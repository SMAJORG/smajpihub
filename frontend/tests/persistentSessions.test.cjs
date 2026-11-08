const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('../node_modules/typescript');
function fixture(post) {
  const values = new Map();
  const events = [];
  const storage = { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const axios = { post, isAxiosError: error => !!error.response };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('frontend/src/lib/sessionCredentials.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, {
    exports, require: name => name === 'axios' ? axios : { Capacitor: { isNativePlatform: () => false } },
    localStorage: storage, window: { dispatchEvent: event => events.push(event.type) },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } }, Event: class { constructor(type) { this.type = type; } },
  });
  return { api: exports, values, events };
}
const session = { accessToken: 'hub_access.test.signature', refreshToken: 'hub_refresh_secret', expiresAt: 'future', accessTokenExpiresAt: 'sooner' };
test('concurrent expired requests share renewal and persist the replacement credentials', async () => {
  let calls = 0, release;
  const f = fixture(async () => { calls++; await new Promise(resolve => { release = resolve; }); return { data: { user: { uid: 'alice' }, session } }; });
  await f.api.saveSessionCredentials(session, { uid: 'alice' });
  const first = f.api.refreshHubSession('https://example.test');
  const second = f.api.refreshHubSession('https://example.test');
  assert.equal(first, second);
  await new Promise(resolve => setImmediate(resolve));
  release(); await first;
  assert.equal(calls, 1);
  assert.equal(JSON.parse(f.values.get('smaj_pi_user')).accessToken, session.accessToken);
});
test('temporary renewal failure preserves login; revoked refresh clears it', async () => {
  let status = 503;
  const f = fixture(async () => { throw { response: { status } }; });
  await f.api.saveSessionCredentials(session, { uid: 'alice' });
  await assert.rejects(f.api.refreshHubSession('https://example.test'));
  assert.ok(f.values.get('smaj_hub_session'));
  status = 401;
  assert.equal(await f.api.refreshHubSession('https://example.test'), null);
  assert.equal(f.values.size, 0);
  assert.ok(f.events.includes('smaj:session-ended'));
});
test('a renewal arriving after logout cannot restore credentials', async () => {
  let release;
  const f = fixture(async () => { await new Promise(resolve => { release = resolve; }); return { data: { user: { uid: 'alice' }, session } }; });
  await f.api.saveSessionCredentials(session, { uid: 'alice' });
  const renewal = f.api.refreshHubSession('https://example.test');
  await new Promise(resolve => setImmediate(resolve));
  await f.api.clearSessionCredentials(); release();
  assert.equal(await renewal, null);
  assert.equal(f.values.size, 0);
});
