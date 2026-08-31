import { PayloadTooLargeError, readBoundedBody } from './advisor.js';

const EDGEONE_ORIGIN = 'https://ai-shengyi-jing-cn-vfh61o1a.edgeone.dev';
const MAX_BODY_BYTES = 2048;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WELCOME_FROM = 'AI 生意经 <newsletter@aishengyijing.asia>';
const FALLBACK_WELCOME_FROM = 'AI 生意经 <ai-shengyi-jing@midastrade.asia>';

function corsOrigin(request) {
  const origin = request.headers.get('Origin') || '';
  const ownOrigin = new URL(request.url).origin;
  return origin === ownOrigin || origin === EDGEONE_ORIGIN ? origin : '';
}

function jsonResponse(body, status, origin) {
  const headers = {
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  };
  if (origin === EDGEONE_ORIGIN) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers.Vary = 'Origin';
  }
  return Response.json(body, { status, headers });
}

async function resend(path, options, apiKey, allowedStatuses = []) {
  const response = await fetch(`https://api.resend.com${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'User-Agent': 'ai-shengyi-jing/1.0',
      ...options.headers
    },
    signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok && !allowedStatuses.includes(response.status)) {
    throw new Error(`Resend ${options.method || 'GET'} ${path} failed with ${response.status}`);
  }
  return response;
}

function welcomeEmail(language) {
  const english = language === 'en';
  const siteUrl = english
    ? 'https://aishengyijing.asia/?lang=en'
    : 'https://aishengyijing.asia/';
  const copy = english ? {
    subject: 'Welcome to AI Business Insights — subscription confirmed',
    preheader: 'Your subscription is confirmed. Expect at most one curated update per week.',
    title: 'Welcome aboard',
    intro: 'Your subscription to AI Business Insights is confirmed.',
    promise: 'From the next edition onward, you will receive at most one concise email per week featuring:',
    items: ['Noteworthy AI businesses from around the world', 'Clear breakdowns of product, revenue, and growth loops', 'Practical signals and opportunities worth tracking'],
    cta: 'Explore the latest cases',
    note: 'You received this email because you subscribed on AI Business Insights. Every future edition will include an unsubscribe option.'
  } : {
    subject: '欢迎订阅 AI 生意经｜订阅已确认',
    preheader: '订阅已确认，每周最多一封 AI 生意案例精选。',
    title: '欢迎加入 AI 生意经',
    intro: '你的邮箱订阅已确认成功。',
    promise: '从下一期开始，每周最多收到 1 封精炼更新，内容包括：',
    items: ['全球值得关注的 AI 生意案例', '产品、收入与增长闭环的清晰拆解', '值得持续跟踪的实操信号与机会'],
    cta: '查看最新 AI 生意案例',
    note: '你收到此邮件，是因为你在 AI 生意经网站完成了订阅。后续每封邮件都会提供退订入口。'
  };

  return {
    subject: copy.subject,
    text: `${copy.title}\n\n${copy.intro}\n${copy.promise}\n\n- ${copy.items.join('\n- ')}\n\n${copy.cta}: ${siteUrl}\n\n${copy.note}`,
    html: `<!doctype html>
<html lang="${english ? 'en' : 'zh-CN'}">
<body style="margin:0;background:#f4f7fb;color:#172033;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${copy.preheader}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f7fb;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 8px 30px rgba(23,32,51,.08);">
        <tr><td style="height:8px;background:linear-gradient(90deg,#f0a800,#f46217);"></td></tr>
        <tr><td style="padding:38px 42px 18px;">
          <div style="font-size:15px;font-weight:800;color:#dd650c;letter-spacing:.04em;">AI 生意经 · AI BUSINESS INSIGHTS</div>
          <h1 style="margin:18px 0 12px;font-size:30px;line-height:1.25;color:#111827;">${copy.title}</h1>
          <p style="margin:0 0 18px;font-size:17px;line-height:1.8;color:#374151;">${copy.intro}</p>
          <p style="margin:0 0 12px;font-size:15px;line-height:1.8;color:#4b5563;">${copy.promise}</p>
          <ul style="margin:0 0 28px;padding-left:22px;font-size:15px;line-height:2;color:#374151;">
            ${copy.items.map(item => `<li>${item}</li>`).join('')}
          </ul>
          <a href="${siteUrl}" style="display:inline-block;background:linear-gradient(90deg,#eca400,#f15a17);color:#ffffff;text-decoration:none;font-weight:800;padding:14px 24px;border-radius:10px;">${copy.cta}</a>
        </td></tr>
        <tr><td style="padding:22px 42px 34px;font-size:12px;line-height:1.7;color:#7b8495;border-top:1px solid #eef1f5;">${copy.note}</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
  };
}

async function welcomeIdempotencyKey(email) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(email));
  return `welcome-${[...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')}`;
}

async function sendWelcomeEmail(email, language, env) {
  const content = welcomeEmail(language);
  const options = {
    method: 'POST',
    headers: { 'Idempotency-Key': await welcomeIdempotencyKey(email) },
    body: JSON.stringify({
      from: WELCOME_FROM,
      to: [email],
      subject: content.subject,
      html: content.html,
      text: content.text
    })
  };
  try {
    await resend('/emails', options, env.RESEND_API_KEY);
  } catch (error) {
    if (!/failed with (400|403|422)$/.test(error instanceof Error ? error.message : '')) throw error;
    const payload = JSON.parse(options.body);
    await resend('/emails', {
      ...options,
      body: JSON.stringify({ ...payload, from: FALLBACK_WELCOME_FROM })
    }, env.RESEND_API_KEY);
  }
}

async function upsertSubscriber(email, language, env) {
  const contactPath = `/contacts/${encodeURIComponent(email)}`;
  const existing = await resend(contactPath, { method: 'GET' }, env.RESEND_API_KEY, [404]);
  if (existing.status === 404) {
    await sendWelcomeEmail(email, language, env);
    await resend('/contacts', {
      method: 'POST',
      body: JSON.stringify({
        email,
        unsubscribed: false,
        segments: [{ id: env.RESEND_SEGMENT_ID }]
      })
    }, env.RESEND_API_KEY, [409]);
    return true;
  }

  await resend(contactPath, {
    method: 'PATCH',
    body: JSON.stringify({ unsubscribed: false })
  }, env.RESEND_API_KEY);
  await resend(`${contactPath}/segments/${encodeURIComponent(env.RESEND_SEGMENT_ID)}`, {
    method: 'POST'
  }, env.RESEND_API_KEY, [409]);
  return false;
}

export async function onRequestOptions(context) {
  const origin = corsOrigin(context.request);
  if (!origin) return jsonResponse({ error: 'REQUEST_ORIGIN_REJECTED' }, 403, '');
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin'
    }
  });
}

export async function onRequestPost(context) {
  const origin = corsOrigin(context.request);
  if (!origin) return jsonResponse({ error: 'REQUEST_ORIGIN_REJECTED' }, 403, '');

  let payload;
  try {
    const body = await readBoundedBody(context.request, MAX_BODY_BYTES);
    payload = JSON.parse(new TextDecoder().decode(body));
  } catch (error) {
    if (error instanceof PayloadTooLargeError) {
      return jsonResponse({ error: 'REQUEST_TOO_LARGE' }, 413, origin);
    }
    return jsonResponse({ error: 'INVALID_JSON' }, 400, origin);
  }

  if (payload?.website) return jsonResponse({ ok: true }, 200, origin);
  const email = typeof payload?.email === 'string' ? payload.email.trim().toLowerCase() : '';
  const language = payload?.language === 'en' ? 'en' : 'zh';
  if (payload?.consent !== true || email.length > 254 || !EMAIL_PATTERN.test(email)) {
    return jsonResponse({ error: 'VALID_EMAIL_AND_CONSENT_REQUIRED' }, 400, origin);
  }
  if (!context.env?.RESEND_API_KEY || !context.env?.RESEND_SEGMENT_ID) {
    return jsonResponse({ error: 'SUBSCRIPTION_UNAVAILABLE' }, 503, origin);
  }

  try {
    const welcomeSent = await upsertSubscriber(email, language, context.env);
    return jsonResponse({ ok: true, welcomeSent }, 200, origin);
  } catch (error) {
    console.error(JSON.stringify({
      message: 'subscription provider failed',
      error: error instanceof Error ? error.message : String(error),
      path: new URL(context.request.url).pathname
    }));
    return jsonResponse({ error: 'SUBSCRIPTION_PROVIDER_FAILED' }, 502, origin);
  }
}

export { EDGEONE_ORIGIN, upsertSubscriber, welcomeEmail };
