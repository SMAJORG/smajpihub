const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), ts = require("typescript");
const { ObjectId } = require("mongodb");
const load = (file, deps) => {
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, "../src/services", file), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {}; new Function("require", "exports", code)(name => deps[name], exports); return exports;
};
function setup({ mismatch, absentTransaction = false, cancelled = false, unverified = false, alreadyCompleted = false, failures = 0 } = {}) {
  const order = { _id: new ObjectId(), buyerId: "buyer", sellerId: "seller", pricePi: 3, status: "pending", paymentStatus: "processing", paymentId: "payment-1" };
  const payment = { identifier: "payment-1", user_uid: "buyer", direction: "user_to_app", metadata: { orderId: order._id.toString() }, amount: 3, transaction: absentTransaction ? null : { txid: "tx-1" }, status: cancelled ? { cancelled: true } : {} };
  if (mismatch === "buyer") payment.user_uid = "other";
  if (mismatch === "order") payment.metadata.orderId = new ObjectId().toString();
  if (mismatch === "amount") payment.amount = 1;
  if (alreadyCompleted) { payment.status = { developer_completed: true, transaction_verified: true }; payment.transaction.verified = true; }
  let posts = 0, reads = 0, scans = 0;
  const api = {
    get: async () => { reads++; return { data: payment }; },
    post: async () => { posts++; if (failures-- > 0) throw { response: { status: 503 } }; payment.status = { developer_completed: true, transaction_verified: !unverified }; payment.transaction.verified = !unverified; return { data: payment }; },
  };
  const collection = {
    find: () => { scans++; return { sort() { return this; }, limit() { return this; }, toArray: async () => order.paymentStatus === "processing" && !["blocked", "reconciled"].includes(order.paymentRecoveryState) ? [order] : [] }; },
    findOne: async q => String(q._id) === String(order._id) && q.buyerId === order.buyerId ? { ...order } : null,
    updateOne: async (q, update) => {
      if (q.paymentStatus && q.paymentStatus !== order.paymentStatus) return { matchedCount: 0 };
      if (q.paymentId && q.paymentId !== order.paymentId) return { matchedCount: 0 };
      if (update.$set) Object.assign(order, update.$set);
      if (update.$addToSet) order.paymentReconciliation = [update.$addToSet.paymentReconciliation];
      return { matchedCount: 1 };
    },
  };
  const app = { locals: { marketplaceOrderCollection: collection } };
  const shared = load("storePayments.ts", { mongodb: { ObjectId }, "./platformAPIClient": { platformAPIKeyClient: api }, "./notifications": { createNotification: async () => {} } });
  const recovery = load("storePaymentRecovery.ts", { "./platformAPIClient": { platformAPIKeyClient: api }, "./storePayments": shared });
  return { app, order, payment, api, recover: () => recovery.recoverPendingStorePayments(app), posts: () => posts, reads: () => reads, scans: () => scans };
}
test("server completes a submitted transfer without any browser completion callback", async () => {
  const app = setup(); await app.recover();
  assert.equal(app.posts(), 1); assert.equal(app.order.paymentStatus, "paid"); assert.equal(app.order.paymentTxid, "tx-1");
  await app.recover(); assert.equal(app.posts(), 1);
});
test("startup scan repairs a saved order when Pi already completed its transfer", async () => {
  const app = setup({ alreadyCompleted: true }); await app.recover();
  assert.equal(app.posts(), 0); assert.equal(app.order.paymentStatus, "paid");
});
test("server never completes an unsubmitted or cancelled payment", async () => {
  for (const options of [{ absentTransaction: true }, { cancelled: true }]) {
    const app = setup(options); await app.recover(); assert.equal(app.posts(), 0); assert.notEqual(app.order.paymentStatus, "paid");
  }
});
test("server refuses a transfer for another buyer or order", async () => {
  for (const mismatch of ["buyer", "order"]) {
    const app = setup({ mismatch }); await app.recover(); assert.equal(app.posts(), 0); assert.equal(app.order.paymentRecoveryState, "blocked");
  }
});
test("a different amount is acknowledged separately without paying the saved order", async () => {
  const app = setup({ mismatch: "amount" }); await app.recover();
  assert.equal(app.posts(), 1); assert.equal(app.order.paymentStatus, "processing"); assert.equal(app.order.paymentRecoveryState, "reconciled");
  assert.equal(app.order.paymentReconciliation[0].amountPi, 1);
});
test("temporary Pi failures remain recoverable on the next scan", async () => {
  const app = setup({ failures: 1 }); await app.recover();
  assert.equal(app.order.paymentStatus, "processing"); assert.equal(app.order.paymentRecoveryState, "retry");
  await app.recover(); assert.equal(app.order.paymentStatus, "paid"); assert.equal(app.posts(), 2);
});
test("unverified blockchain transactions do not mark an order paid", async () => {
  const app = setup({ unverified: true }); await app.recover();
  assert.equal(app.order.paymentStatus, "processing"); assert.equal(app.order.paymentRecoveryState, "retry");
});
test("overlapping timer scans share the active scan", async () => {
  const app = setup(); let release;
  const get = app.api.get; app.api.get = async () => { await new Promise(resolve => { release = resolve; }); return get(); };
  const first = app.recover(); for (let i = 0; i < 10; i++) await Promise.resolve();
  await app.recover(); assert.equal(app.scans(), 1); release(); await first;
  assert.equal(app.order.paymentStatus, "paid");
});

test("a simultaneous browser completion cannot turn successful recovery into an error", async () => {
  const app = setup(); const update = app.app.locals.marketplaceOrderCollection.updateOne;
  app.app.locals.marketplaceOrderCollection.updateOne = async (q, data) => {
    if (data.$set?.paymentStatus === "paid") {
      Object.assign(app.order, { paymentStatus: "paid", paymentId: "payment-1", paymentTxid: "tx-1" });
      return { matchedCount: 0 };
    }
    return update(q, data);
  };
  await app.recover(); assert.equal(app.order.paymentStatus, "paid"); assert.equal(app.posts(), 1);
});
