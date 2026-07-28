import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const caseScript = fs.readFileSync(new URL('../assets/case.js', import.meta.url), 'utf8');

function createContext(fetchImpl) {
  const context = vm.createContext({
    console: { warn() {} },
    document: { addEventListener() {} },
    fetch: fetchImpl,
    URL,
    URLSearchParams,
  });
  vm.runInContext(
    'const PROJECTS = [{ id: "linkedin-automation", name: "LinkedIn智能拓客工具" }];',
    context,
  );
  vm.runInContext(caseScript, context);
  return context;
}

test('HTML fallback response is never parsed as JSON', async () => {
  let parsed = false;
  const context = createContext(async () => ({
    ok: true,
    headers: { get: () => 'text/html; charset=UTF-8' },
    async json() {
      parsed = true;
      throw new Error('HTML must not be parsed');
    },
  }));

  const result = await vm.runInContext(
    'fetchJsonIfAvailable("data/case_articles/missing.json")',
    context,
  );

  assert.equal(result, null);
  assert.equal(parsed, false);
});

test('curated project remains available when no article file exists', () => {
  const context = createContext(async () => {
    throw new Error('network should not be needed');
  });

  const result = vm.runInContext(
    'findCuratedProject("linkedin-automation")',
    context,
  );

  assert.equal(result.id, 'linkedin-automation');
  assert.equal(result.name, 'LinkedIn智能拓客工具');
});
