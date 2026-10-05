const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { ObjectId } = require('../../backend/node_modules/mongodb');
function load(relative, modules, globals = {}) {
  const source = fs.readFileSync(path.join(__dirname, relative), 'utf8').replace(/import\.meta\.env/g, '({})');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, require: name => modules[name] || {}, Error, console, setTimeout, ...globals });
  return exports;
}
const service = load('../../backend/src/services/profileAvatars.ts', { mongodb: { ObjectId } });
function request(users) {
  let queries = 0;
  return { app: { locals: { userCollection: { find: () => { queries++; return { project: () => ({ toArray: async () => users }) }; } } } }, queries: () => queries };
}
test('Store cards resolve the latest account photo in one batch', async () => {
  const req = request([{ _id: new ObjectId(), uid: 'seller', avatar: 'new.jpg' }]);
  const rows = [{ sellerId: 'seller', sellerAvatar: 'old.jpg' }, { sellerId: 'seller', sellerAvatar: 'older.jpg' }];
  const result = await service.enrichProfileAvatars(req, rows, 'product');
  assert.equal(result[0].sellerAvatar, 'new.jpg');
  assert.equal(result[1].sellerAvatar, 'new.jpg');
  assert.equal(rows[0].sellerAvatar, 'old.jpg');
  assert.equal(req.queries(), 1);
});
test('old Stream reviews resolve current photos by account id', async () => {
  const id = new ObjectId();
  const req = request([{ _id: id, uid: 'viewer', avatar: 'new.jpg' }]);
  const result = await service.enrichProfileAvatars(req, [{ userId: id.toString(), reviewer: { name: 'Viewer', avatarUrl: 'old.jpg' } }], 'review');
  assert.equal(result[0].reviewer.avatarUrl, 'new.jpg');
  assert.equal(result[0].reviewer.name, 'Viewer');
});
test('cleared photos do not resurrect old snapshots; missing accounts retain their snapshot', async () => {
  const req = request([{ uid: 'seller', avatar: '', streamProfile: { avatarUrl: 'old.jpg' } }]);
  const result = await service.enrichProfileAvatars(req, [{ sellerId: 'seller', sellerAvatar: 'old.jpg' }, { sellerId: 'missing', sellerAvatar: 'fallback.jpg' }], 'product');
  assert.equal(result[0].sellerAvatar, '');
  assert.equal(result[1].sellerAvatar, 'fallback.jpg');
});
test('both Store and Stream snapshots are synchronized on save', async () => {
  const updates = [];
  const collection = { updateMany: async (filter, update) => { updates.push({ filter, update }); } };
  const req = { app: { locals: { productCollection: collection, streamReviewCollection: collection } } };
  await service.synchronizeAvatarSnapshots(req, { uid: 'seller', _id: new ObjectId() }, 'new.jpg');
  assert.equal(updates.length, 2);
  assert.equal(updates[0].update.$set.sellerAvatar, 'new.jpg');
  assert.equal(updates[1].update.$set['reviewer.avatarUrl'], 'new.jpg');
});
test('Stream save announces the server-confirmed photo; failed saves announce nothing', async () => {
  const events = [];
  let fail = false;
  const api = load('../src/lib/streamProfile.ts', { './axiosClient': { axiosClient: { put: async () => { if (fail) throw new Error('Offline'); return { data: { profile: { avatarUrl: 'server.jpg' } } }; } } } }, {
    window: { dispatchEvent: event => events.push(event) }, CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
  });
  await api.saveStreamProfile({ avatarUrl: 'requested.jpg' });
  assert.equal(events[0].detail.avatar, 'server.jpg');
  fail = true;
  await assert.rejects(api.saveStreamProfile({ avatarUrl: 'local.jpg' }), /Offline/);
  assert.equal(events.length, 1);
});
test('failed account profile save does not store a local-only photo', async () => {
  const stored = { uid: 'viewer', username: 'viewer', avatar: 'old.jpg' };
  let writes = 0;
  const api = load('../src/hooks/useAuth.ts', {
    react: { useRef: value => ({ current: value }), useState: value => [value, () => {}], useCallback: fn => fn, useEffect: () => {} },
    axios: { isAxiosError: () => false },
    '../lib/capacitorPiAuth': { isCapacitorNative: () => false },
    '../lib/axiosClient': { axiosClient: { put: async () => { throw new Error('Offline'); } } },
  }, { window: { localStorage: { getItem: () => JSON.stringify(stored), setItem: () => writes++ } } });
  await assert.rejects(api.useAuth().updateProfile({ avatar: 'new.jpg' }), /Offline/);
  assert.equal(writes, 0);
});
test('Stream photo events and other-tab changes update the shared account state', async () => {
  const states = [], effects = [], listeners = new Map();
  let stored = { uid: 'viewer', username: 'viewer', avatar: 'old.jpg' };
  const api = load('../src/hooks/useAuth.ts', {
    react: {
      useRef: value => ({ current: value }), useCallback: fn => fn, useEffect: fn => effects.push(fn),
      useState: value => { const index = states.length; states.push(value); return [value, next => { states[index] = typeof next === 'function' ? next(states[index]) : next; }]; },
    },
    axios: { isAxiosError: () => false },
    '../lib/capacitorPiAuth': { isCapacitorNative: () => false },
    '../lib/axiosClient': { getBaseURL: () => '', axiosClient: {} },
  }, { window: {
    localStorage: { getItem: () => JSON.stringify(stored), setItem: (_, value) => { stored = JSON.parse(value); } },
    addEventListener: (type, handler) => listeners.set(type, handler), removeEventListener: type => listeners.delete(type),
  } });
  api.useAuth();
  const cleanups = effects.map(effect => effect());
  listeners.get('smaj:profile-avatar-updated')({ detail: { avatar: 'new.jpg' } });
  assert.equal(states[0].avatar, 'new.jpg');
  assert.equal(stored.avatar, 'new.jpg');
  stored = { ...stored, avatar: 'other-tab.jpg' };
  listeners.get('storage')({ key: 'smaj_pi_user' });
  assert.equal(states[0].avatar, 'other-tab.jpg');
  cleanups.forEach(cleanup => cleanup?.());
  assert.equal(listeners.size, 0);
});