import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MODEL,
  onRequestPost,
  secureTokenMatches
} from '../functions/api/editorial.js';

const TOKEN = 'test-editorial-token';

function createRequest(body, token = TOKEN) {
  return new Request('https://ai-shengyi-jing.pages.dev/api/editorial', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
}

function articleFixture() {
  return {
    title: '一个细分工具如何验证付费需求',
    dek: '从真实痛点出发的小生意实验',
    opening: '创业者从一个明确问题开始。',
    keyFacts: [{ label: '模式', value: '订阅制' }],
    sections: [{
      heading: '找到真实需求',
      paragraphs: ['先访谈目标用户。'],
      callout: '先验证，再扩张。'
    }],
    conclusion: '小步试错。',
    riskNote: '营收数据需独立核验。'
  };
}

test('requires the private editorial token', async () => {
  const response = await onRequestPost({
    request: createRequest({ project: {} }, 'wrong-token'),
    env: { EDITORIAL_API_TOKEN: TOKEN }
  });
  assert.equal(response.status, 401);
});

test('uses Workers AI JSON mode for editorial generation', async () => {
  let receivedModel = '';
  let receivedInput;
  const response = await onRequestPost({
    request: createRequest({
      project: { nameZh: '示例工具', summary: '通过订阅收费。' },
      sourceNotes: '公开事实笔记'
    }),
    env: {
      EDITORIAL_API_TOKEN: TOKEN,
      AI: {
        async run(model, input) {
          receivedModel = model;
          receivedInput = input;
          return { response: articleFixture() };
        }
      }
    }
  });

  assert.equal(response.status, 200);
  assert.equal(receivedModel, MODEL);
  assert.equal(receivedInput.response_format.type, 'json_schema');
  const payload = await response.json();
  assert.equal(payload.provider, 'cloudflare-workers-ai');
  assert.equal(payload.article.sections.length, 1);
});

test('signals fallback when the AI binding is unavailable', async () => {
  const response = await onRequestPost({
    request: createRequest({ project: { nameZh: '示例工具' } }),
    env: { EDITORIAL_API_TOKEN: TOKEN }
  });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).fallback, true);
});

test('token comparison is deterministic', async () => {
  assert.equal(await secureTokenMatches(TOKEN, TOKEN), true);
  assert.equal(await secureTokenMatches('nope', TOKEN), false);
});
