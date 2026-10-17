const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const exportsObject = {};
new Function('exports', ts.transpileModule(fs.readFileSync(require('node:path').join(__dirname, '../src/services/walletActivity.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(exportsObject);
const { buildWalletActivity } = exportsObject;
const user = { uid: 'alice', _id: 'mongo-alice' };
const hash = 'a'.repeat(64);
function matches(row, query) {
  return Object.entries(query).every(([key, value]) => {
    if (key === '$or') return value.some(part => matches(row, part));
    if (value && value.$in) return value.$in.includes(row[key]);
    if (value && value.$regex) return new RegExp(value.$regex).test(row[key]);
    return row[key] === value;
  });
}
function collection(rows) {
  return { find(query) { let limit = Infinity; return { sort() { return this; }, limit(n) { limit = n; return this; }, maxTimeMS() { return this; }, async toArray() { return rows.filter(row => matches(row, query)).slice(0, limit); } }; } };
}
function locals(orders = [], receipts = [], extra = {}) {
  return { piNetwork: 'Pi Network', marketplaceOrderCollection: collection(orders), paymentCollection: collection(receipts), ...extra };
}
function receipt(id, network = 'Pi Network', extra = {}) {
  return { _id: 'payment:' + network + ':' + id, paymentId: id, network, payerUid: 'alice', verified: true, direction: 'user_to_app', txid: hash, amountPi: 0.1234567, intentKey: 'store:' + id, createdAt: '2026-10-17T10:00:00Z', ...extra };
}
function order(id, extra = {}) { return { _id: id, buyerId: 'alice', sellerId: 'seller', paymentId: id, paymentTxid: hash, paymentStatus: 'completed', pricePi: 0.1234567, productTitle: id, createdAt: '2026-10-17T10:00:00Z', ...extra }; }

test('scopes real records to the account and separates verified networks from legacy activity', async () => {
  const db = locals([order('main'), order('test'), order('legacy'), order('other', { buyerId: 'bob' })], [receipt('main'), receipt('test', 'Pi Testnet'), receipt('other', 'Pi Network', { payerUid: 'bob' }), { ...receipt('main'), _id: 'credit:main' }]);
  const main = await buildWalletActivity(db, user);
  assert.deepEqual(main.items.map(row => row.title), ['main']);
  assert.deepEqual(main.summary.paid, { count: 1, amountPi: 0.1234567 });
  assert.equal(main.balance.available, false); assert.equal(main.balance.amountPi, null);
  const sandbox = await buildWalletActivity(db, user, { network: 'testnet' });
  assert.equal(sandbox.items.length, 1); assert.equal(sandbox.items[0].title, 'test');
  const legacy = await buildWalletActivity(db, user, { network: 'unknown' });
  assert.equal(legacy.items[0].status, 'unverified'); assert.equal(legacy.summary.paid.count, 0);
  assert.equal(main.networks.reduce((sum, row) => sum + row.count, 0), 3);
});
test('invalid proof, wrong payer, direction and zero amount never produce paid totals', async () => {
  const ids = ['payer', 'direction', 'zero', 'intent'];
  const db = locals(ids.map(id => order(id)), [receipt('payer', 'Pi Network', { payerUid: 'bob' }), receipt('direction', 'Pi Network', { direction: 'app_to_user' }), receipt('zero', 'Pi Network', { amountPi: 0 }), receipt('intent', 'Pi Network', { intentKey: 'jobs:other', payerUid: 'bob' })]);
  const result = await buildWalletActivity(db, user);
  assert.equal(result.summary.paid.count, 0);
  assert.ok(result.items.every(row => !row.verified));
});
test('manual salary and held payouts are recorded without inventing spendable earnings', async () => {
  const db = locals([], [], { jobPaymentCollection: collection([{ _id: 'salary', candidateId: 'mongo-alice', employerId: 'employer', amountPi: 2, status: 'confirmed' }]), settlementCollection: collection([{ _id: 'store:sale', sellerUid: 'alice', amountPi: 3, status: 'held' }]) });
  const result = await buildWalletActivity(db, user, { network: 'unknown', filter: 'earnings' });
  assert.equal(result.total, 2); assert.equal(result.summary.completed.count, 0);
  assert.ok(result.items.every(row => !row.verified));
});

test('Education, Jobs, Transport and Stream use persisted amounts without upgrading legacy confirmations', async () => {
  const db = locals([], [], {
    coursePaymentCollection: collection([{ _id: 'course', user_id: 'mongo-alice', amount_pi: 1.25, course_title: 'Course', status: 'completed' }, { _id: 'private', user_id: 'someone-else', amount_pi: 99 }]),
    universityPaymentCollection: collection([{ _id: 'university', user_id: 'mongo-alice', amount_pi: 2, program_name: 'Program', status: 'pending' }]),
    jobBillingCollection: collection([{ billingId: 'billing', employerId: 'mongo-alice', pricePi: 3, status: 'paid' }]),
    transportBookingCollection: collection([{ bookingId: 'ride', userId: 'alice', farePi: 4, paymentStatus: 'completed' }]),
  });
  const result = await buildWalletActivity(db, { ...user, streamSubscription: { plan: 'premium', pricePi: 5, paymentId: 'subscription', paymentStatus: 'completed' } }, { network: 'unknown' });
  assert.equal(result.total, 5); assert.equal(result.summary.pending.amountPi, 15.25);
  assert.equal(result.summary.paid.count, 0); assert.ok(result.items.every(row => !row.verified));
  assert.deepEqual([...new Set(result.items.map(row => row.service))].sort(), ['education', 'jobs', 'stream', 'transport']);
});
test('verified refunds and other integrated services support filters without duplicate receipts', async () => {
  const db = locals([order('sale', { refundStatus: 'completed', refundReference: 'refund', refundTxid: hash })], [receipt('sale'), receipt('refund', 'Pi Network', { direction: 'app_to_user', intentKey: 'refund:sale' }), receipt('food', 'Pi Network', { intentKey: 'food:meal' }), receipt('event', 'Pi Testnet', { intentKey: 'events:ticket' })]);
  const refunds = await buildWalletActivity(db, user, { filter: 'refunds' });
  assert.equal(refunds.total, 1); assert.equal(refunds.items[0].verified, true); assert.equal(refunds.items[0].direction, 'incoming');
  const food = await buildWalletActivity(db, user, { service: 'food', filter: 'payments' });
  assert.equal(food.total, 1); assert.equal(food.items[0].service, 'food');
  const page = await buildWalletActivity(db, user, { limit: 1, offset: 1 });
  assert.equal(page.items.length, 1); assert.equal(page.total, 3);
});
test('empty data is zero activity; failed or truncated sources withhold totals', async () => {
  const empty = await buildWalletActivity(locals(), user);
  assert.equal(empty.total, 0); assert.equal(empty.summary.paid.count, 0);
  const unavailable = await buildWalletActivity(locals([], [], { paymentCollection: { find() { throw Error('database offline'); } } }), user);
  assert.equal(unavailable.partial, true); assert.equal(unavailable.summary, null);
  const truncated = await buildWalletActivity(locals(Array.from({ length: 5001 }, (_, index) => order(String(index)))), user);
  assert.equal(truncated.truncated, true); assert.equal(truncated.summary, null);
  await assert.rejects(buildWalletActivity(locals(), {}, {}), { status: 401 });
  await assert.rejects(buildWalletActivity(locals(), user, { network: 'mixed' }), { status: 400 });
});

test('activity endpoint requires authentication, ignores requested account IDs and disables caching', async () => {
  const routes = new Map(), moduleExports = {}; let account = null, called = 0, passedUser;
  const code = ts.transpileModule(fs.readFileSync(require('node:path').join(__dirname, '../src/handlers/payments.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'exports', code)(name => {
    if (name.endsWith('/auth')) return { resolveCurrentUser: async () => account };
    if (name.endsWith('/walletActivity')) return { buildWalletActivity: async (db, owner) => { called++; passedUser = owner; return { items: [] }; } };
    return {};
  }, moduleExports);
  const router = {}; for (const method of ['get', 'post', 'patch', 'delete', 'put']) router[method] = (route, handler) => routes.set(method + ' ' + route, handler);
  moduleExports.default(router);
  let status = 200, cache, data;
  const response = { status(value) { status = value; return this; }, json(value) { data = value; return this; }, setHeader(key, value) { if (key === 'Cache-Control') cache = value; } };
  const request = { app: { locals: {} }, query: { uid: 'victim' } };
  await routes.get('get /activity')(request, response);
  assert.equal(status, 401); assert.equal(called, 0);
  account = user; status = 200;
  await routes.get('get /activity')(request, response);
  assert.equal(status, 200); assert.equal(passedUser.uid, 'alice'); assert.equal(cache, 'no-store'); assert.deepEqual(data.items, []);
});
