import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const window = { location: { href: 'https://example.com/', search: '' } };
const document = {
  addEventListener() {},
  documentElement: { dataset: {} },
  querySelector() { return null; },
  querySelectorAll() { return []; },
};
const localStorage = { getItem() { return null; }, setItem() {} };

vm.runInNewContext(
  fs.readFileSync(new URL('../assets/i18n.js', import.meta.url), 'utf8'),
  { document, Intl, localStorage, URL, URLSearchParams, window },
);

test('annual and monthly revenue normalize to monthly values', () => {
  assert.equal(window.SiteI18n.monthlyRevenue('$1.2M/Year'), 100_000);
  assert.equal(window.SiteI18n.monthlyRevenue('$10K/mo'), 10_000);
  assert.equal(window.SiteI18n.monthlyRevenue('$120K annually'), 10_000);
});
