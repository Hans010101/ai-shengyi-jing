import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MODEL,
  onRequestPost,
  signedPayload
} from '../functions/api/advisor.js';

function createRequest(body, headers = {}) {
  return new Request('https://ai-shengyi-jing.pages.dev/api/advisor', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://ai-shengyi-jing.pages.dev',
      ...headers
    },
    body: JSON.stringify(body)
  });
}

test('uses the Cloudflare Workers AI binding and returns provider metadata', async () => {
  let receivedModel = '';
  let receivedInput;
  const response = await onRequestPost({
    request: createRequest({
      query: '如何做一个低成本 AI 工具？',
      projects: [{ name: '示例工具', summary: '通过订阅收费。' }]
    }),
    env: {
      AI: {
        async run(model, input) {
          receivedModel = model;
          receivedInput = input;
          return { response: '先验证一个明确痛点，再制作最小版本。' };
        }
      }
    }
  });

  assert.equal(response.status, 200);
  assert.equal(receivedModel, MODEL);
  assert.equal(receivedInput.messages[0].role, 'system');
  const payload = await response.json();
  assert.equal(payload.provider, 'cloudflare-workers-ai');
  assert.match(payload.answer, /最小版本/);
});

test('returns a fallback signal when the AI binding is unavailable', async () => {
  const response = await onRequestPost({
    request: createRequest({ query: '测试问题' }),
    env: {}
  });

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    error: 'AI_BINDING_UNAVAILABLE',
    fallback: true
  });
});

test('answers English requests with an English system prompt', async () => {
  let messages;
  const response = await onRequestPost({
    request: createRequest({ query: 'How should I validate this idea?', language: 'en' }),
    env: { AI: { async run(_model, input) { messages = input.messages; return { response: 'Start with five customer interviews.' }; } } }
  });
  assert.equal(response.status, 200);
  assert.match(messages[0].content, /practical English/);
});

test('rejects empty queries and oversized request bodies', async () => {
  const emptyResponse = await onRequestPost({
    request: createRequest({ query: '   ' }),
    env: {}
  });
  assert.equal(emptyResponse.status, 400);

  const oversizedResponse = await onRequestPost({
    request: createRequest({ query: 'a'.repeat(20_000) }),
    env: {}
  });
  assert.equal(oversizedResponse.status, 413);
});

test('rejects cross-origin browser requests', async () => {
  const response = await onRequestPost({
    request: createRequest({ query: '测试问题' }, { Origin: 'https://example.com' }),
    env: {}
  });
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error, 'REQUEST_ORIGIN_REJECTED');
});

test('accepts a fresh HMAC-signed EdgeOne proxy request', async () => {
  const secret = 'edgeone-test-proxy-secret';
  const body = new TextEncoder().encode(JSON.stringify({ query: '测试问题' }));
  const timestamp = String(Math.floor(Date.now() / 1000));
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = Array.from(
    new Uint8Array(
      await crypto.subtle.sign('HMAC', key, signedPayload(timestamp, body))
    ),
    byte => byte.toString(16).padStart(2, '0')
  ).join('');

  const response = await onRequestPost({
    request: new Request('https://ai-shengyi-jing.pages.dev/api/advisor', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-AI-Shengyi-Jing-Timestamp': timestamp,
        'X-AI-Shengyi-Jing-Signature': signature
      },
      body
    }),
    env: {
      EDGEONE_PROXY_SECRET: secret,
      AI: {
        async run() {
          return { response: '签名验证通过。' };
        }
      }
    }
  });

  assert.equal(response.status, 200);
  assert.match((await response.json()).answer, /签名验证通过/);
});

test('rejects stale or invalid EdgeOne proxy signatures', async () => {
  const response = await onRequestPost({
    request: new Request('https://ai-shengyi-jing.pages.dev/api/advisor', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-AI-Shengyi-Jing-Timestamp': '1',
        'X-AI-Shengyi-Jing-Signature': '0'.repeat(64)
      },
      body: JSON.stringify({ query: '测试问题' })
    }),
    env: { EDGEONE_PROXY_SECRET: 'edgeone-test-proxy-secret' }
  });

  assert.equal(response.status, 403);
});
