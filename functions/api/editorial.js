const MODEL = '@cf/meta/llama-3.1-8b-instruct-fast';
const MAX_BODY_BYTES = 48 * 1024;
const MAX_SOURCE_NOTES = 12_000;

class PayloadTooLargeError extends Error {}

function jsonResponse(body, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}

async function readBoundedJson(request) {
  const declaredLength = Number(request.headers.get('Content-Length') || 0);
  if (declaredLength > MAX_BODY_BYTES) {
    throw new PayloadTooLargeError();
  }
  if (!request.body) throw new SyntaxError('Request body is required');

  const reader = request.body.getReader();
  const chunks = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new PayloadTooLargeError();
    }
    chunks.push(value);
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(body));
}

async function secureTokenMatches(provided, expected) {
  if (!provided || !expected) return false;
  const encoder = new TextEncoder();
  const [providedHash, expectedHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(provided)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected))
  ]);
  const left = new Uint8Array(providedHash);
  const right = new Uint8Array(expectedHash);
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

function cleanText(value, maxLength) {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function articleSchema() {
  return {
    type: 'object',
    properties: {
      title: { type: 'string' },
      dek: { type: 'string' },
      opening: { type: 'string' },
      keyFacts: {
        type: 'array',
        minItems: 3,
        maxItems: 6,
        items: {
          type: 'object',
          properties: {
            label: { type: 'string' },
            value: { type: 'string' }
          },
          required: ['label', 'value']
        }
      },
      sections: {
        type: 'array',
        minItems: 6,
        maxItems: 8,
        items: {
          type: 'object',
          properties: {
            heading: { type: 'string' },
            paragraphs: {
              type: 'array',
              minItems: 2,
              maxItems: 4,
              items: { type: 'string' }
            },
            callout: { type: 'string' }
          },
          required: ['heading', 'paragraphs', 'callout']
        }
      },
      conclusion: { type: 'string' },
      riskNote: { type: 'string' }
    },
    required: ['title', 'dek', 'opening', 'keyFacts', 'sections', 'conclusion', 'riskNote']
  };
}

function buildMessages(payload) {
  const project = payload.project || {};
  const sourceNotes = cleanText(payload.sourceNotes, MAX_SOURCE_NOTES);
  const projectFacts = {
    中文项目名: cleanText(project.nameZh, 80),
    原项目名: cleanText(project.name, 160),
    项目简介: cleanText(project.summary, 500),
    营收口径: cleanText(project.revenue, 100),
    商业模式: cleanText(project.businessModel, 800),
    核心洞察: cleanText(project.insight, 800),
    产品架构: cleanText(project.productArch, 800),
    商业闭环: cleanText(project.businessLoop, 800),
    中国机会: cleanText(project.chinaOpportunity, 800),
    上手路径: Array.isArray(project.getStartedPath)
      ? project.getStartedPath.slice(0, 5).map(item => cleanText(item, 500))
      : []
  };

  return [
    {
      role: 'system',
      content: `你是“AI生意经”的资深中文商业编辑。请把事实资料写成适合微信公众号阅读的原创案例文章。

硬性要求：
1. 只能使用提供的事实，无法核实的数字要注明“据来源页披露”或省略。
2. 不逐句翻译、不复刻原文段落顺序、不长篇引用；必须重新组织叙事并加入中国创业者视角的分析。
3. 标题克制，不使用“稳赚”“完美复制”等承诺性表达。
4. 全文约 2400—3600 个中文字符，6—8 个章节，每节 2—4 个短段落。
5. 风格像高质量商业类微信公众号文章：开头用一个真实场景或关键决策制造画面感；中段拆解产品、渠道、收入、运营与转折；结尾给出中国创业者可执行的验证路径。
6. 不写空泛口号。每一节至少包含一个来自资料的具体事实、数字、动作或因果关系。
7. 明确区分事实、编辑分析和风险提示；对旧数据标明时间背景。
8. 段落要有节奏，长短句交替；允许提出问题，但不要夸张煽情。
9. 只返回符合 JSON Schema 的数据，不输出 Markdown。`
    },
    {
      role: 'user',
      content: `项目结构化资料：
${JSON.stringify(projectFacts, null, 2)}

来源页公开事实笔记：
${sourceNotes || '未抓取到额外公开信息，请只使用结构化资料。'}

请生成原创中文案例文章。`
    }
  ];
}

export async function onRequestPost(context) {
  const authorization = context.request.headers.get('Authorization') || '';
  const providedToken = authorization.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : '';
  const tokenValid = await secureTokenMatches(
    providedToken,
    context.env?.EDITORIAL_API_TOKEN
  );
  if (!tokenValid) {
    return jsonResponse({ error: 'UNAUTHORIZED' }, 401);
  }

  let payload;
  try {
    payload = await readBoundedJson(context.request);
  } catch (error) {
    if (error instanceof PayloadTooLargeError) {
      return jsonResponse({ error: 'REQUEST_TOO_LARGE' }, 413);
    }
    return jsonResponse({ error: 'INVALID_JSON' }, 400);
  }

  if (!payload?.project || typeof payload.project !== 'object') {
    return jsonResponse({ error: 'PROJECT_REQUIRED' }, 400);
  }
  if (!context.env?.AI || typeof context.env.AI.run !== 'function') {
    return jsonResponse({ error: 'AI_BINDING_UNAVAILABLE', fallback: true }, 503);
  }

  try {
    const result = await context.env.AI.run(MODEL, {
      messages: buildMessages(payload),
      response_format: {
        type: 'json_schema',
        json_schema: articleSchema()
      },
      max_tokens: 4600,
      temperature: 0.55
    });
    let article = result?.response;
    if (typeof article === 'string') {
      article = JSON.parse(article);
    }
    if (!article || typeof article !== 'object' || !Array.isArray(article.sections)) {
      throw new Error('Workers AI returned an invalid editorial response');
    }
    return jsonResponse({
      article,
      provider: 'cloudflare-workers-ai',
      model: MODEL
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({
      message: 'editorial generation failed',
      error: message,
      path: new URL(context.request.url).pathname
    }));
    const quotaLimited = /quota|limit|exceed|neuron/i.test(message);
    return jsonResponse({
      error: quotaLimited ? 'AI_FREE_QUOTA_UNAVAILABLE' : 'AI_GENERATION_FAILED',
      fallback: true
    }, quotaLimited ? 429 : 503);
  }
}

export { MODEL, articleSchema, secureTokenMatches };
