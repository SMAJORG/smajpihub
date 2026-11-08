const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { ObjectId } = require('mongodb');
const modules = new Map();
function load(file) {
  file = path.resolve(__dirname, '../src', file);
  if (modules.has(file)) return modules.get(file);
  const out = {}; modules.set(file, out);
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  new Function('require', 'exports', source)(name => {
    if (name.endsWith('/environments')) return { __esModule: true, default: { session_secret: 'test-only-long-session-signing-secret' } };
    if (name.startsWith('.')) return load(path.relative(path.resolve(__dirname, '../src'), path.resolve(path.dirname(file), name + '.ts')));
    return require(name);
  }, out);
  return out;
}
const { MemoryCollection } = load('services/memoryDatabase.ts');
const sessions = load('services/persistentSessions.ts');
const devices = load('services/deviceSessions.ts');
const { SESSION_TTL_MS } = load('services/sessionPolicy.ts');
function setup() {
  const user = { _id: new ObjectId(), uid: 'pi-user', username: 'Pi User', role: 'buyer' };
  const locals = { userCollection: new MemoryCollection([user]), deviceSessionCollection: new MemoryCollection([]) };
  const req = () => ({ session: { cookie: { expires: new Date(Date.now() + SESSION_TTL_MS) } }, app: { locals }, get: () => '', cookies: {} });
  return { user, locals, req };
}
test('30 days of inactivity: expired short token renews without Pi, then expires after 30 idle days', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1800000000000 });
  const { user, locals, req } = setup(); const first = req();
  const issued = await sessions.issuePersistentSession(first, user);
  const [record] = await locals.deviceSessionCollection.find({}).toArray();
  assert.equal(new Date(record.expiresAt).getTime() - Date.now(), 30 * 24 * 3600000);
  assert.equal(JSON.stringify(record).includes(issued.refreshToken), false, 'only a digest of the refresh secret is persisted');
  t.mock.timers.tick(29 * 24 * 3600000);
  assert.equal(await sessions.resolveHubAccessUser(req(), issued.accessToken), null);
  const renewal = req(); renewal.get = name => name === 'x-smaj-refresh-token' ? issued.refreshToken : '';
  const refreshed = await sessions.refreshPersistentSession(renewal);
  assert.equal(refreshed.user.uid, user.uid);
  assert.equal((await sessions.resolveHubAccessUser(req(), refreshed.session.accessToken)).uid, user.uid);
  t.mock.timers.tick(30 * 24 * 3600000 + 1);
  assert.equal(await sessions.refreshPersistentSession(renewal), null);
});
test('revocation, blocking and missing device records reject both access and renewal; other devices remain signed in', async () => {
  const { user, locals, req } = setup(); const a = req(), b = req();
  const first = await sessions.issuePersistentSession(a, user), second = await sessions.issuePersistentSession(b, user);
  const renew = req(); renew.cookies.smaj_refresh = first.refreshToken;
  await locals.deviceSessionCollection.updateOne({ sessionKey: devices.currentDeviceSessionKey(a) }, { $set: { active: false, revokedAt: new Date() } });
  assert.equal(await sessions.resolveHubAccessUser(req(), first.accessToken), null);
  assert.equal(await sessions.refreshPersistentSession(renew), null);
  assert.equal((await sessions.resolveHubAccessUser(req(), second.accessToken)).uid, user.uid);
  await locals.userCollection.updateOne({ uid: user.uid }, { $set: { blocked: true } });
  assert.equal(await sessions.resolveHubAccessUser(req(), second.accessToken), null);
  await locals.deviceSessionCollection.deleteOne({ sessionKey: devices.currentDeviceSessionKey(b) });
  assert.equal(await devices.validateAndTouchDeviceSession(b, user.uid), false);
  assert.equal(await locals.deviceSessionCollection.countDocuments(), 1, 'a deleted or expired device must never be resurrected');
});
test('tampered access signatures and refresh secrets cannot authorize a session', async () => {
  const { user, req } = setup(); const issued = await sessions.issuePersistentSession(req(), user);
  assert.equal(await sessions.resolveHubAccessUser(req(), issued.accessToken + 'x'), null);
  const invalid = req(); invalid.cookies.smaj_refresh = issued.refreshToken.slice(0, -1) + (issued.refreshToken.endsWith('a') ? 'b' : 'a');
  assert.equal(await sessions.refreshPersistentSession(invalid), null);
});
