const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function fixture(put, get) {
  let stored = { uid: 'alice', username: 'Alice', language: 'English', languagePreferenceSaved: false, settings: { language: 'English', theme: 'dark', notifications: false } };
  let writes = 0;
  const output = {};
  const code = ts.transpileModule(fs.readFileSync('frontend/src/hooks/useAuth.ts', 'utf8').replace(/import\.meta\.env/g, '({})'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code + "\nexports.restoreProfile = toUser;", { exports: output, console, setTimeout,
    window: { localStorage: { getItem: () => JSON.stringify(stored), setItem: (_key,value) => { writes++; stored = JSON.parse(value); } } },
    require: name => name === 'react' ? { useRef: value => ({ current: value }), useState: value => [value, () => {}], useCallback: fn => fn, useEffect() {} }
      : name === 'axios' ? { isAxiosError: error => !!error.response }
      : name.endsWith('/axiosClient') ? { axiosClient: { put, get } }
      : name.endsWith('/capacitorPiAuth') ? { isCapacitorNative: () => false } : {},
  });
  return { auth: output.useAuth(), restore: output.restoreProfile, stored: () => stored, writes: () => writes, clear: () => { stored = null; } };
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

test('a missing language endpoint falls back to authenticated settings and confirms every supported language', async () => {
  for (const language of ['en','fr','ar','ha','es','pt','zh','sw','hi','tr']) {
    const calls = [];
    const f = fixture(async (url, body) => {
      calls.push(url);
      if (url === '/user/language') throw { response: { status: 404 } };
      assert.equal(url, '/user/settings');
      assert.equal(body.theme, 'dark'); assert.equal(body.notifications, false);
      assert.equal(body.language, language);
      return { data: { user: { uid: 'alice', language: 'English', settings: { ...body } } } };
    }, async url => {
      assert.equal(url, '/user');
      return { data: { user: { uid: 'alice', language: 'English', settings: { theme: 'dark', language: 'English', notifications: false } } } };
    });
    await f.auth.updateLanguage(language);
    assert.deepEqual(calls, ['/user/language', '/user/settings']);
    assert.equal(f.stored().language, language);
    assert.equal(f.stored().languagePreferenceSaved, true);
  }
});
test('the compatibility path never accepts local-only saves, another user, or a response without the selected persisted value', async () => {
  for (const response of [null, { uid: 'another', settings: { language: 'fr' } }, { uid: 'alice', settings: { language: 'English' } }]) {
    const f = fixture(async url => {
      if (url === '/user/language') throw { response: { status: 404 } };
      return { data: { user: response } };
    }, async () => ({ data: { user: { uid: 'alice', settings: { theme: 'dark', notifications: false } } } }));
    await assert.rejects(f.auth.updateLanguage('fr'));
    assert.equal(f.writes(), 0);
  }
});
test('authentication and database errors are not disguised as compatibility saves', async () => {
  for (const status of [401,403,400,503]) {
    let fallback = false;
    const f = fixture(async () => { throw { response: { status } }; }, async () => { fallback = true; });
    await assert.rejects(f.auth.updateLanguage('fr'));
    assert.equal(fallback, false); assert.equal(f.writes(), 0);
  }
});

test('refresh and login restore settings-only preferences from a legacy API without showing the first-login prompt again', () => {
  const f = fixture(async () => {});
  for (const language of ['en','fr','ar','ha','es','pt','zh','sw','hi','tr']) {
    const restored = f.restore({ uid: 'alice', language: 'English', settings: { language, theme: 'dark', notifications: false } }, f.stored());
    assert.equal(restored.language, language);
    assert.equal(restored.languagePreferenceSaved, true);
  }
  const firstLogin = f.restore({ uid: 'alice', language: 'English', settings: { language: 'English', theme: 'light', notifications: true } }, f.stored());
  assert.equal(firstLogin.languagePreferenceSaved, false);
});
