import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/index.ts', import.meta.url), 'utf8');

test('worker points CORS and case links only at Cloudflare 002', () => {
  assert.doesNotMatch(source, /ai-shengyi-video-studio\.pages\.dev|ai-shengyi-jing\.pages\.dev/);
  assert.equal(source.match(/https:\/\/ai-shengyi-video-studio-5dw\.pages\.dev/g)?.length, 3);
  assert.match(source, /https:\/\/ai-shengyi-jing-etz\.pages\.dev\/case/);
});

test('renderer health is protected and only probes the container health endpoint', () => {
  const authGate = source.indexOf("url.pathname.startsWith('/api/')");
  const route = source.indexOf("url.pathname === '/api/renderer/health'");
  assert.ok(authGate >= 0 && route > authGate);
  const block = source.slice(route, source.indexOf("url.pathname === '/api/jobs'", route));
  assert.match(block, /request\.method === 'GET'/);
  assert.match(block, /getByName\('health-check'\)\.fetch\('http:\/\/container\/health', \{ signal: AbortSignal\.timeout\(30_000\) \}\)/);
  assert.doesNotMatch(block, /AI\.run|VIDEO_DB|VIDEO_BUCKET|\/jobs/);
});
