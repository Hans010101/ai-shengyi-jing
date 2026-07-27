import assert from 'node:assert/strict';
import test from 'node:test';

import { onRequestPost } from '../functions/api/advisor.js';
import { onRequest as onEdgeOneRequest } from '../edge-functions/api/advisor.js';

const SECRET = 'edgeone-integration-test-secret';

function edgeOneRequest(body, options = {}) {
  return new Request('https://edge.example/api/advisor', {
    method: options.method || 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: options.origin || 'https://edge.example'
    },
    body: options.method === 'GET' ? undefined : JSON.stringify(body)
  });
}

test('EdgeOne forwards a signed request to the single Cloudflare advisor', async () => {
  const originalFetch = globalThis.fetch;
  let upstreamCalls = 0;
  globalThis.fetch = async (url, init) => {
    upstreamCalls += 1;
    return onRequestPost({
      request: new Request(url, init),
      env: {
        EDGEONE_PROXY_SECRET: SECRET,
        AI: {
          async run() {
            return { response: '统一由 Cloudflare Workers AI 回答。' };
          }
        }
      }
    });
  };

  try {
    const response = await onEdgeOneRequest({
      request: edgeOneRequest({ query: '给我一个低成本项目建议' }),
      env: { EDGEONE_PROXY_SECRET: SECRET }
    });
    assert.equal(response.status, 200);
    assert.equal(upstreamCalls, 1);
    const payload = await response.json();
    assert.equal(payload.provider, 'cloudflare-workers-ai');
    assert.match(payload.answer, /统一由 Cloudflare/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('EdgeOne fails closed when its proxy secret is missing', async () => {
  const response = await onEdgeOneRequest({
    request: edgeOneRequest({ query: '测试问题' }),
    env: {}
  });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    error: 'ADVISOR_PROXY_UNAVAILABLE',
    fallback: true
  });
});

test('EdgeOne rejects other methods and cross-origin browser calls', async () => {
  const methodResponse = await onEdgeOneRequest({
    request: edgeOneRequest({}, { method: 'GET' }),
    env: { EDGEONE_PROXY_SECRET: SECRET }
  });
  assert.equal(methodResponse.status, 405);

  const originResponse = await onEdgeOneRequest({
    request: edgeOneRequest(
      { query: '测试问题' },
      { origin: 'https://untrusted.example' }
    ),
    env: { EDGEONE_PROXY_SECRET: SECRET }
  });
  assert.equal(originResponse.status, 403);
});
