const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync(require('node:path').join(__dirname, '../src/hooks/usePiPayment.ts'), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function setup({ available = true, incomplete, recoveryFails = false } = {}) {
  const requests = [], handoffs = [], busy = [];
  let walletCallbacks, walletOpened = 0;
  const modules = {
    react: { useCallback: fn => fn, useRef: value => ({ current: value }), useState: () => [false, value => busy.push(value)] },
    '../lib/axiosClient': { axiosClient: {
      get: async url => { requests.push(['get', url]); return { data: { order: { status: 'pending', pricePi: 3 } } }; },
      post: async (url, body) => { requests.push(['post', url, body]); if (recoveryFails && url === '/payments/complete') throw new Error('Recovery failed'); },
    } },
    '../lib/piBrowserHandoff': { requestPiBrowserHandoff: (...args) => handoffs.push(args) },
    '../lib/soloHost': { isPiPaymentAvailable: () => available, isSoloHostRuntime: () => false },
  };
  const exports = {};
  vm.runInNewContext(code, { exports, require: name => modules[name], Error, window: { Pi: {
    authenticate: async (_, found) => { if (incomplete) found(incomplete); },
    createPayment: (_, callbacks) => { walletOpened++; walletCallbacks = callbacks; },
  } } });
  return { payOrder: exports.usePiPayment().payOrder, requests, handoffs, busy, callbacks: () => walletCallbacks, opened: () => walletOpened };
}
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
test('pending payment remains busy until completion and blocks duplicate clicks', async () => {
  const app = setup(); let complete = 0;
  const pending = app.payOrder('order-1', 3, { onComplete: () => complete++ });
  await flush();
  assert.equal(app.opened(), 1);
  assert.deepEqual(app.busy, [true]);
  await app.payOrder('order-1', 3);
  assert.equal(app.opened(), 1);
  await app.callbacks().onReadyForServerApproval('payment-1');
  await app.callbacks().onReadyForServerCompletion('payment-1', 'tx-1');
  await pending;
  assert.equal(complete, 1);
  assert.deepEqual(app.busy, [true, false]);
});
test('submitted incomplete payment completes the existing order without a second payment', async () => {
  const app = setup({ incomplete: { identifier: 'payment-1', metadata: { orderId: 'order-1' }, transaction: { txid: 'tx-1' } } });
  let complete = 0;
  await app.payOrder('order-1', 3, { onComplete: () => complete++ });
  assert.equal(app.opened(), 0);
  assert.equal(complete, 1);
  assert.equal(app.requests.find(r => r[1] === '/payments/complete')[2].paymentId, 'payment-1');
});
test('failed recovery reports the failure without creating another payment', async () => {
  const app = setup({ recoveryFails: true, incomplete: { identifier: 'payment-1', metadata: { orderId: 'order-1' }, transaction: { txid: 'tx-1' } } });
  let error;
  await app.payOrder('order-1', 3, { onError: message => { error = message; } });
  assert.equal(error, 'Recovery failed');
  assert.equal(app.opened(), 0);
  assert.deepEqual(app.busy, [true, false]);
});
test('Pi Browser handoff retains the existing order', async () => {
  const app = setup({ available: false });
  await app.payOrder('order-1', 3);
  assert.equal(app.handoffs[0][1], '/orders/order-1/track');
  assert.equal(app.opened(), 0);
});

const { ObjectId } = require('../../backend/node_modules/mongodb');
const serverSource = fs.readFileSync(require('node:path').join(__dirname, '../../backend/src/handlers/payments.ts'), 'utf8');
const serverCode = ts.transpileModule(serverSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
async function completePayment({ mismatch, alreadyPaid = false } = {}) {
  const order = { _id: new ObjectId(), buyerId: 'buyer', sellerId: 'seller', pricePi: 3, status: alreadyPaid ? 'paid' : 'pending', paymentStatus: alreadyPaid ? 'paid' : 'processing', paymentId: 'payment-1', paymentTxid: alreadyPaid ? 'tx-1' : undefined };
  const payment = { user_uid: 'buyer', amount: 3, metadata: { orderId: order._id.toString() }, transaction: { txid: 'tx-1' }, status: {} };
  if (mismatch === 'buyer') payment.user_uid = 'other';
  if (mismatch === 'order') payment.metadata.orderId = new ObjectId().toString();
  if (mismatch === 'amount') payment.amount = 1;
  if (mismatch === 'txid') payment.transaction.txid = 'other-tx';
  if (mismatch === 'cancelled') payment.status.cancelled = true;
  let updates = 0, completions = 0, apiReads = 0, response;
  const modules = {
    mongodb: { ObjectId },
    '../services/auth': { resolveCurrentUser: async () => ({ uid: 'buyer' }) },
    '../services/platformAPIClient': { platformAPIKeyClient: { get: async () => { apiReads++; return { data: payment }; }, post: async () => { completions++; } } },
    '../services/notifications': { createNotification: async () => {} },
  };
  const exports = {};
  vm.runInNewContext(serverCode, { exports, require: name => modules[name], Date, Promise });
  const routes = {};
  const router = { get: () => {}, post: (path, handler) => { routes[path] = handler; } };
  exports.default(router);
  const req = { body: { orderId: order._id.toString(), paymentId: 'payment-1', txid: 'tx-1' }, app: { locals: { marketplaceOrderCollection: {
    findOne: async query => query.buyerId === 'buyer' ? order : null,
    updateOne: async (_, update) => { updates++; assert.equal(update.$set.status, 'paid'); },
  } } } };
  const res = { status: status => ({ json: body => { response = { status, body }; } }) };
  await routes['/complete'](req, res);
  return { response, updates, completions, apiReads };
}
test('server verifies buyer, order, amount, transaction and cancellation before completing', async () => {
  for (const mismatch of ['buyer', 'order', 'amount', 'txid', 'cancelled']) {
    const result = await completePayment({ mismatch });
    assert.equal(result.response.status, 400, mismatch);
    assert.equal(result.updates, 0, mismatch);
    assert.equal(result.completions, 0, mismatch);
  }
});
test('server completes a matching submitted payment', async () => {
  const result = await completePayment();
  assert.equal(result.response.status, 200);
  assert.equal(result.updates, 1);
  assert.equal(result.completions, 1);
});
test('completion retries do not repeat Pi completion or order updates', async () => {
  const result = await completePayment({ alreadyPaid: true });
  assert.equal(result.response.status, 200);
  assert.equal(result.updates, 0);
  assert.equal(result.completions, 0);
  assert.equal(result.apiReads, 0);
});