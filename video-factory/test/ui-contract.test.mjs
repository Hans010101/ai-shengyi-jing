import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');

test('all five source connectors are real tabs', () => {
  for (const source of ['text', 'topic', 'article', 'book', 'ai-shengyi-case']) {
    assert.match(html, new RegExp(`role="tab"[^>]+data-source="${source}"`));
  }
  assert.match(app, /function switchSource\(type/);
  assert.match(app, /ArrowRight/);
});

test('file preview can run the classic script and points production to HTTPS', () => {
  assert.doesNotMatch(html, /type="module"/);
  assert.match(html, /app\.js\?v=1\.1\.0/);
  assert.match(app, /location\.protocol === 'file:'/);
  assert.match(app, /https:\/\/ai-shengyi-video-studio\.pages\.dev/);
});

test('production access supports one-time activation and an admin fallback', () => {
  assert.match(html, /id="activationCode"/);
  assert.match(html, /id="factoryKey" type="password"/);
  assert.match(app, /\/api\/activate/);
  assert.match(app, /factorySession/);
});
