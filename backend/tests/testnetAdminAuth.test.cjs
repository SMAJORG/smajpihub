const { test } = require('node:test');
const assert = require('node:assert/strict');
const { scryptSync, createHash } = require('node:crypto');
process.env.NODE_ENV = 'test';
process.env.PI_NETWORK = 'Pi Testnet';
process.env.PI_COMMERCE_MODE = 'testnet-development';
process.env.MONGODB_DATABASE_NAME = process.env.PI_TESTNET_PAYOUT_DATABASE_NAME = 'qualification_testnet_a2u';
process.env.ADMIN_PI_USERNAMES = process.env.PI_TESTNET_ADMIN_USERNAME = 'existing-admin';
process.env.PI_TESTNET_ADMIN_AUTH_ENABLED = process.env.PI_TESTNET_PAYOUTS_ENABLED = 'true';
delete process.env.PI_MAINNET_ACCOUNT_MODE;
const password = 'test-fixture-password-not-for-deployment';
const salt = Buffer.alloc(16, 17);
process.env.PI_TESTNET_ADMIN_PASSWORD_HASH = `scrypt$${salt.toString('hex')}$${scryptSync(password, salt, 64).toString('hex')}`;
const express = require('express');
const { testnetAdminLogin, testnetAdminLogout, resolveTestnetAdmin } = require('../build/services/testnetAdminAuth');
const { testnetA2UPreflightHandler } = require('../build/handlers/testnetA2U');
const { resolveHubAccessUser } = require('../build/services/persistentSessions');

class Store {
  rows = new Map();
  async findOne(q) { return [...this.rows.values()].find(row => Object.entries(q).every(([k,v]) => v && v.$gt ? row[k] > v.$gt : row[k] === v)) || null; }
  async findOneAndUpdate(q, u, options) {
    let row = this.rows.get(q._id);
    if (!row && options?.upsert) { row = { ...q, ...u.$setOnInsert, attempts: 0 }; this.rows.set(q._id, row); }
    if (row) row.attempts += u.$inc.attempts;
    return row;
  }
  async insertOne(row) { this.rows.set(row._id, row); }
  async updateOne(q, u) { const row = await this.findOne(q); if (row) Object.assign(row, u.$set); return { matchedCount: row ? 1 : 0 }; }
}
async function fixture(run) {
  const app = express(), store = new Store();
  app.use(express.json()); app.locals.testnetAdminAuthCollection = store;
  app.post('/login', testnetAdminLogin); app.post('/logout', testnetAdminLogout);
  app.get('/session', async (req,res) => { const admin = await resolveTestnetAdmin(req, req.get('authorization')?.slice(7) || ''); res.status(admin ? 200 : 401).json({ admin }); });
  app.get('/preflight', testnetA2UPreflightHandler);
  app.get('/hub', async (req,res) => res.json({ user: await resolveHubAccessUser(req, req.get('authorization')?.slice(7) || '') }));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const login = (name = 'existing-admin', secret = password) => fetch(base + '/login', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({username:name,password:secret}) });
  const request = (path, token, method = 'GET') => fetch(base + path, { method, headers:{Authorization:`Bearer ${token}`} });
  try { await run({ store, app, login, request }); }
  finally { await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }); }
}

test('real HTTP credential login issues a scoped opaque token without creating a Pi/Hub account', () => fixture(async f => {
  const bad = await f.login('existing-admin', 'incorrect-password-value'); assert.equal(bad.status, 401);
  const response = await f.login(); assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
  const session = await response.json(); assert.match(session.token, /^testnet_admin\.[a-f0-9]{64}$/); assert.equal(session.scope, 'testnet-payouts');
  assert(!JSON.stringify([...f.store.rows.values()]).includes(session.token)); assert(!JSON.stringify([...f.store.rows.values()]).includes(password));
  assert.equal((await f.request('/session', session.token)).status, 200);
  assert.equal((await f.request('/preflight', session.token)).status, 400, 'authenticated admin reaches UID validation; no Pi API is called');
  assert.equal((await (await f.request('/hub', session.token)).json()).user, null, 'credential session cannot authenticate as a Hub user');
  assert.equal((await f.request('/logout', session.token, 'POST')).status, 204);
  assert.equal((await f.request('/session', session.token)).status, 401);
}));

test('Mainnet, shared production storage, disabled configuration and memory storage fail closed', () => fixture(async f => {
  for (const [name,value] of [['PI_NETWORK','Pi Network'], ['PI_COMMERCE_MODE','mainnet'], ['PI_TESTNET_PAYOUT_DATABASE_NAME','smajpihub'], ['PI_TESTNET_ADMIN_AUTH_ENABLED','false'], ['PI_TESTNET_ADMIN_USERNAME','unauthorized'], ['PI_TESTNET_ADMIN_PASSWORD_HASH','invalid']]) {
    const previous = process.env[name]; process.env[name] = value;
    try { assert.equal((await f.login()).status, 503, name); } finally { process.env[name] = previous; }
  }
  f.app.locals.memoryDatabase = true; assert.equal((await f.login()).status, 503);
}));

test('expiry, tampering, credential rotation and deployment changes invalidate sessions', () => fixture(async f => {
  const { token } = await (await f.login()).json();
  assert.equal((await f.request('/session', token + 'bad')).status, 401);
  const hash = process.env.PI_TESTNET_ADMIN_PASSWORD_HASH;
  process.env.PI_TESTNET_ADMIN_PASSWORD_HASH = hash.replace(/.$/, hash.endsWith('a') ? 'b' : 'a');
  try { assert.equal((await f.request('/session', token)).status, 401); } finally { process.env.PI_TESTNET_ADMIN_PASSWORD_HASH = hash; }
  process.env.PI_NETWORK = 'Pi Network';
  try { assert.equal((await f.request('/session', token)).status, 401); } finally { process.env.PI_NETWORK = 'Pi Testnet'; }
  f.store.rows.get(createHash('sha256').update(token).digest('hex')).expiresAt = new Date(0);
  assert.equal((await f.request('/session', token)).status, 401);
}));

test('login attempts are rate limited in shared persistent storage', () => fixture(async f => {
  for (let i = 0; i < 10; i++) assert.equal((await f.login('wrong-user', 'incorrect-password-value')).status, 401);
  const response = await f.login(); assert.equal(response.status, 429); assert.equal(response.headers.get('retry-after'), '900');
}));
