import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/index.ts', import.meta.url), 'utf8');
const wrangler = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
const factoryWorkflow = await readFile(new URL('../../.github/workflows/deploy-video-factory.yml', import.meta.url), 'utf8');
const studioWorkflow = await readFile(new URL('../../.github/workflows/deploy-video-studio.yml', import.meta.url), 'utf8');

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

test('production deploy cannot pass by falling back to the API-only worker', () => {
  assert.match(wrangler, /"tag": "copy002-empty-state-v1"/);
  assert.doesNotMatch(factoryWorkflow, /continue-on-error|Restore stable API|wrangler deploy --config wrangler\.api\.jsonc/);
  assert.match(factoryWorkflow, /rendererEnabled is not true/);
  assert.match(factoryWorkflow, /api\/renderer\/health/);
  assert.match(factoryWorkflow, /VIDEO_FACTORY_ADMIN_TOKEN/);
});

test('studio deploy targets the 002 Pages project name, not its generated subdomain', () => {
  assert.match(studioWorkflow, /--project-name ai-shengyi-video-studio --branch main/);
  assert.doesNotMatch(studioWorkflow, /--project-name ai-shengyi-video-studio-5dw/);
});
