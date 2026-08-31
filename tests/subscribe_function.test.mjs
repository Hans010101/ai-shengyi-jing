import assert from 'node:assert/strict';
import test from 'node:test';

import { EDGEONE_ORIGIN, onRequestOptions, onRequestPost, welcomeEmail } from '../functions/api/subscribe.js';

const originalFetch = globalThis.fetch;
const env = { RESEND_API_KEY: 're_test', RESEND_SEGMENT_ID: 'segment_test' };

function request(body, origin = 'https://ai-shengyi-jing.pages.dev') {
  return new Request('https://ai-shengyi-jing.pages.dev/api/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify(body)
  });
}

test.afterEach(() => { globalThis.fetch = originalFetch; });

test('welcomes a new subscriber before creating the normalized contact', async () => {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push([url, options]);
    return new Response(null, { status: options.method === 'GET' ? 404 : 200 });
  };

  const response = await onRequestPost({
    request: request({ email: ' Founder@Example.com ', consent: true, website: '', language: 'en' }),
    env
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, welcomeSent: true });
  assert.equal(calls.length, 3);
  assert.equal(calls[0][0], 'https://api.resend.com/contacts/founder%40example.com');
  assert.equal(calls[1][0], 'https://api.resend.com/emails');
  const welcome = JSON.parse(calls[1][1].body);
  assert.equal(welcome.from, 'AI 生意经 <ai-shengyi-jing@midastrade.asia>');
  assert.deepEqual(welcome.to, ['founder@example.com']);
  assert.equal(welcome.subject, 'Welcome to AI Business Insights — subscription confirmed');
  assert.match(calls[1][1].headers['Idempotency-Key'], /^welcome-[a-f0-9]{64}$/);
  assert.match(welcome.html, /Explore the latest cases/);
  assert.equal(calls[2][0], 'https://api.resend.com/contacts');
  assert.deepEqual(JSON.parse(calls[2][1].body), {
    email: 'founder@example.com',
    unsubscribed: false,
    segments: [{ id: 'segment_test' }]
  });
  assert.equal(calls[2][1].headers.Authorization, 'Bearer re_test');
});

test('renders the welcome email in Chinese and English', () => {
  assert.match(welcomeEmail('zh').subject, /欢迎订阅 AI 生意经/);
  assert.match(welcomeEmail('zh').html, /ai-shengyi-jing-cn-vfh61o1a\.edgeone\.dev/);
  assert.match(welcomeEmail('en').text, /Explore the latest cases/);
});

test('resubscribes an existing contact and keeps it in the segment', async () => {
  const methods = [];
  globalThis.fetch = async (_url, options) => {
    methods.push(options.method);
    return new Response(null, { status: 200 });
  };

  const response = await onRequestPost({
    request: request({ email: 'founder@example.com', consent: true }),
    env
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, welcomeSent: false });
  assert.deepEqual(methods, ['GET', 'PATCH', 'POST']);
});

test('rejects invalid input and cross-origin requests without contacting Resend', async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return new Response(null, { status: 200 }); };

  const invalid = await onRequestPost({ request: request({ email: 'bad', consent: true }), env });
  const rejected = await onRequestPost({
    request: request({ email: 'founder@example.com', consent: true }, 'https://example.com'),
    env
  });

  assert.equal(invalid.status, 400);
  assert.equal(rejected.status, 403);
  assert.equal(calls, 0);
});

test('accepts EdgeOne preflight and silently discards honeypot submissions', async () => {
  const preflight = await onRequestOptions({
    request: new Request('https://ai-shengyi-jing.pages.dev/api/subscribe', {
      method: 'OPTIONS',
      headers: { Origin: EDGEONE_ORIGIN }
    })
  });
  const honeypot = await onRequestPost({
    request: request({ email: 'bot@example.com', consent: true, website: 'spam' }, EDGEONE_ORIGIN),
    env
  });

  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), EDGEONE_ORIGIN);
  assert.equal(honeypot.status, 200);
});
