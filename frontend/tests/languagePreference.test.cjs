const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function fixture(put) {
  let stored = { uid: 'alice', username: 'Alice', language: 'English', languagePreferenceSaved: false, settings: { language: 'English', theme: 'dark', notifications: false } };
  let writes = 0;
  const output = {};
  const code = ts.transpileModule(fs.readFileSync('frontend/src/hooks/useAuth.ts', 'utf8').replace(/import\.meta\.env/g, '({})'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports: output, console, setTimeout,
    window: { localStorage: { getItem: () => JSON.stringify(stored), setItem: (_key,value) => { writes++; stored = JSON.parse(value); } } },
    require: name => name === 'react' ? { useRef: value => ({ current: value }), useState: value => [value, () => {}], useCallback: fn => fn, useEffect() {} }
      : name === 'axios' ? { isAxiosError: error => !!error.response }
      : name.endsWith('/axiosClient') ? { axiosClient: { put } }
      : name.endsWith('/capacitorPiAuth') ? { isCapacitorNative: () => false } : {},
  });
  return { auth: output.useAuth(), stored: () => stored, writes: () => writes, clear: () => { stored = null; } };
}
test('language Save persists the server-confirmed profile, including the completion flag', async () => {
  let request;
  const f = fixture(async (url, body) => { request = { url, body }; return { data: { user: { uid: 'alice', language: 'fr', languagePreferenceSaved: true, settings: { language: 'fr', theme: 'dark', notifications: false } } } }; });
  await f.auth.updateLanguage('fr');
  assert.equal(request.url, '/user/language'); assert.equal(request.body.language, 'fr');
  assert.equal(f.stored().language, 'fr'); assert.equal(f.stored().languagePreferenceSaved, true);
  assert.equal(f.stored().settings.theme, 'dark');
});
test('offline, anonymous, mismatched account and unconfirmed responses never hide the first-login prompt', async () => {
  for (const response of [null, { uid: 'alice' }, { uid: 'another-account', languagePreferenceSaved: true }]) {
    const f = fixture(async () => ({ data: { user: response } }));
    await assert.rejects(f.auth.updateLanguage('fr'));
    assert.equal(f.writes(), 0); assert.equal(f.stored().languagePreferenceSaved, false);
  }
  const f = fixture(async () => { throw Error('Offline'); });
  await assert.rejects(f.auth.updateLanguage('fr'), /Offline/);
  assert.equal(f.writes(), 0);
});

test('a language response arriving after logout cannot recreate the authenticated profile', async () => {
  let finish;
  const f = fixture(() => new Promise(resolve => { finish = resolve; }));
  const pending = f.auth.updateLanguage('fr');
  f.clear();
  finish({ data: { user: { uid: 'alice', language: 'fr', languagePreferenceSaved: true } } });
  await assert.rejects(pending);
  assert.equal(f.writes(), 0);
  assert.equal(f.stored(), null);
});
