import { PayloadTooLargeError, readBoundedBody } from './advisor.js';

const EDGEONE_ORIGIN = 'https://ai-shengyi-jing-cn-vfh61o1a.edgeone.dev';
const MAX_BODY_BYTES = 2048;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

async function resend(path, options, apiKey) {
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
  if (!response.ok && response.status !== 404 && response.status !== 409) {
    throw new Error(`Resend ${options.method || 'GET'} ${path} failed with ${response.status}`);
  }
  return response;
}

async function upsertSubscriber(email, env) {
  const contactPath = `/contacts/${encodeURIComponent(email)}`;
  const existing = await resend(contactPath, { method: 'GET' }, env.RESEND_API_KEY);
  if (existing.status === 404) {
    await resend('/contacts', {
      method: 'POST',
      body: JSON.stringify({
        email,
        unsubscribed: false,
        segments: [{ id: env.RESEND_SEGMENT_ID }]
      })
    }, env.RESEND_API_KEY);
    return;
  }

  await resend(contactPath, {
    method: 'PATCH',
    body: JSON.stringify({ unsubscribed: false })
  }, env.RESEND_API_KEY);
  await resend(`${contactPath}/segments/${encodeURIComponent(env.RESEND_SEGMENT_ID)}`, {
    method: 'POST'
  }, env.RESEND_API_KEY);
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
  if (payload?.consent !== true || email.length > 254 || !EMAIL_PATTERN.test(email)) {
    return jsonResponse({ error: 'VALID_EMAIL_AND_CONSENT_REQUIRED' }, 400, origin);
  }
  if (!context.env?.RESEND_API_KEY || !context.env?.RESEND_SEGMENT_ID) {
    return jsonResponse({ error: 'SUBSCRIPTION_UNAVAILABLE' }, 503, origin);
  }

  try {
    await upsertSubscriber(email, context.env);
    return jsonResponse({ ok: true }, 200, origin);
  } catch (error) {
    console.error(JSON.stringify({
      message: 'subscription provider failed',
      error: error instanceof Error ? error.message : String(error),
      path: new URL(context.request.url).pathname
    }));
    return jsonResponse({ error: 'SUBSCRIPTION_PROVIDER_FAILED' }, 502, origin);
  }
}

export { EDGEONE_ORIGIN, upsertSubscriber };
