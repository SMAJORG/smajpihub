const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
function fixture() {
  let user = { uid: 'alice', username: 'Alice', role: 'buyer', settings: { language: 'English', theme: 'dark', notifications: false } };
  let failure = false, writes = 0;
  const collection = {
    updateOne: async (query, update) => {
      if (failure) throw new Error('database unavailable');
      assert.equal(query.uid, 'alice'); writes++;
      for (const [key, value] of Object.entries(update.$set)) {
        if (key === 'settings.language') user.settings.language = value;
        else user[key] = value;
      }
      return { matchedCount: 1 };
    },
    findOne: async query => query.uid === user?.uid ? user : null,
  };
  const output = {};
  const code = ts.transpileModule(fs.readFileSync('backend/src/handlers/users.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'exports', code)(name => name.endsWith('/auth') ? { resolveCurrentUser: async () => user } : name.endsWith('/deviceSessions') ? { currentDeviceSessionKey: () => 'device' } : name.endsWith('/environments') ? { default: { admin_pi_usernames: [] } } : {}, output);
  const routes = new Map();
  const router = {};
  for (const method of ['get','put','post','delete','patch']) router[method] = (path, handler) => routes.set(`${method} ${path}`, handler);
  output.default(router);
  const call = async (language, method = 'put /language') => {
    const response = { code: 200, body: null, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; }, setHeader() {} };
    await routes.get(method)({ body: { language, uid: 'someone-else' }, app: { locals: { userCollection: collection, deviceSessionCollection: { findOne: async () => ({ refreshTokenHash: 'known' }) } } }, get: () => '', session: {} }, response);
    return response;
  };
  return { call, user: () => user, signOut: () => { user = null; }, fail: () => { failure = true; }, writes: () => writes };
}
test('default English is not a saved preference; explicit Save including English survives a subsequent profile read', async () => {
  const f = fixture();
  assert.equal((await f.call(null, 'get /')).body.user.languagePreferenceSaved, false);
  const saved = await f.call('en');
  assert.equal(saved.code, 200);
  assert.equal(saved.body.user.languagePreferenceSaved, true);
  assert.equal((await f.call(null, 'get /')).body.user.languagePreferenceSaved, true);
});
test('language is saved only to the authenticated account while theme and notification settings are preserved', async () => {
  const f = fixture(); const result = await f.call('fr');
  assert.equal(result.body.user.uid, 'alice');
  assert.equal(f.user().language, 'fr');
  assert.deepEqual(f.user().settings, { language: 'fr', theme: 'dark', notifications: false });
  assert.equal((await f.call(null, 'get /')).body.user.language, 'fr');
});
test('unsupported language, missing authentication and storage failure never confirm a saved preference', async () => {
  const f = fixture();
  assert.equal((await f.call('unsupported')).code, 400); assert.equal(f.writes(), 0);
  f.fail(); assert.equal((await f.call('ar')).code, 503);
  assert.equal(f.user().languagePreferenceSaved, undefined);
  f.signOut(); assert.equal((await f.call('fr')).code, 401);
});
