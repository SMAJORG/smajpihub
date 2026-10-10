const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const source = fs.readFileSync(require("node:path").join(__dirname, "../src/hooks/usePiPayment.ts"), "utf8");
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
function setup({
  available = true,
  existingPayment = false,
  incomplete,
  recoveryFails = false,
  incompleteAtCreate = false,
  incompleteFromError = false,
  completionFailures = [],
} = {}) {
  const requests = [],
    handoffs = [],
    busy = [];
  let walletCallbacks,
    walletOpened = 0;
  let foundPayment;
  const pi = {
    authenticate: async (_, found) => {
      foundPayment = found;
      if (incomplete && !incompleteAtCreate) found(incomplete);
    },
    createPayment: (_, callbacks) => {
      walletOpened++;
      walletCallbacks = callbacks;
      if (incompleteAtCreate && walletOpened === 1) {
        if (!incompleteFromError) foundPayment(incomplete);
        void callbacks.onError(new Error("A pending payment needs to be handled."), incomplete);
      }
    },
  };
  const modules = {
    "../lib/piSdk": { ensurePiInitialized: async () => pi, withPiTimeout: promise => promise },
    react: {
      useCallback: fn => fn,
      useRef: value => ({ current: value }),
      useState: () => [false, value => busy.push(value)],
    },
    "../lib/axiosClient": {
      axiosClient: {
        get: async url => {
          requests.push(["get", url]);
          return { data: { order: { status: "pending", pricePi: 3, ...(existingPayment ? { paymentId: "payment-1", paymentStatus: "processing" } : {}) } } };
        },
        post: async (url, body, config) => {
          requests.push(["post", url, body, config]);
          if (url === "/payments/complete" && completionFailures.length) throw completionFailures.shift();
          if (recoveryFails && url === "/payments/incomplete")
            throw { response: { data: { message: "Recovery failed" } } };
          return { data: { orderId: incomplete?.metadata?.orderId || "order-1" } };
        },
      },
    },
    "../lib/piBrowserHandoff": { requestPiBrowserHandoff: (...args) => handoffs.push(args) },
    "../lib/soloHost": { isPiPaymentAvailable: () => available, isSoloHostRuntime: () => false },
  };
  const exports = {};
  vm.runInNewContext(code, { exports, require: name => modules[name], Error, window: { Pi: pi, setTimeout: resolve => { resolve(); return 1; } } });
  return {
    payOrder: exports.usePiPayment().payOrder,
    requests,
    handoffs,
    busy,
    callbacks: () => walletCallbacks,
    opened: () => walletOpened,
  };
}
const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
test("pending payment remains busy until completion and blocks duplicate clicks", async () => {
  const app = setup();
  let complete = 0;
  const pending = app.payOrder("order-1", 3, { onComplete: () => complete++ });
  await flush();
  assert.equal(app.opened(), 1);
  assert.deepEqual(app.busy, [true]);
  await app.payOrder("order-1", 3);
  assert.equal(app.opened(), 1);
  await app.callbacks().onReadyForServerApproval("payment-1");
  await app.callbacks().onReadyForServerCompletion("payment-1", "tx-1");
  await pending;
  assert.equal(complete, 1);
  assert.deepEqual(app.busy, [true, false]);
});
test("submitted incomplete payment completes the existing order without a second payment", async () => {
  const app = setup({
    incomplete: { identifier: "payment-1", metadata: { orderId: "order-1" }, transaction: { txid: "tx-1" } },
  });
  let complete = 0;
  await app.payOrder("order-1", 3, { onComplete: () => complete++ });
  assert.equal(app.opened(), 0);
  assert.equal(complete, 1);
  assert.equal(app.requests.find(r => r[1] === "/payments/incomplete")[2].paymentId, "payment-1");
});
test("failed recovery reports the failure without creating another payment", async () => {
  const app = setup({
    recoveryFails: true,
    incomplete: { identifier: "payment-1", metadata: { orderId: "order-1" }, transaction: { txid: "tx-1" } },
  });
  let error;
  await app.payOrder("order-1", 3, {
    onError: message => {
      error = message;
    },
  });
  assert.equal(error, "Recovery failed");
  assert.equal(app.opened(), 0);
  assert.deepEqual(app.busy, [true, false]);
});
test("Pi Browser handoff retains the existing order", async () => {
  const app = setup({ available: false });
  await app.payOrder("order-1", 3);
  assert.equal(app.handoffs[0][1], "/orders/order-1/track");
  assert.equal(app.opened(), 0);
});

const { ObjectId } = require("../../backend/node_modules/mongodb");
const serverSource = fs.readFileSync(
  require("node:path").join(__dirname, "../../backend/src/handlers/payments.ts"),
  "utf8"
);
const serverCode = ts.transpileModule(serverSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
async function completePayment({ orderStatus, mismatch, alreadyPaid = false, rounded = false, recovery = false, delayedTransaction = false, unverified = false, confirmedMismatch = false, piAlreadyCompleted = false, piFailure, notificationHangs = false } = {}) {
  const order = {
    _id: new ObjectId(),
    buyerId: "buyer",
    sellerId: "seller",
    pricePi: 3,
    status: orderStatus || (alreadyPaid ? "paid" : "pending"),
    paymentStatus: alreadyPaid ? "paid" : "processing",
    paymentId: "payment-1",
    paymentTxid: alreadyPaid ? "tx-1" : undefined,
  };
  const payment = {
    identifier: "payment-1",
    direction: "user_to_app",
    user_uid: "buyer",
    amount: 3,
    metadata: { orderId: order._id.toString() },
    transaction: { txid: "tx-1" },
    status: {},
  };
  if (rounded) {
    order.pricePi = 300 / 314159;
    payment.amount = 0.0009549;
  }
  if (mismatch === "identifier") payment.identifier = "other";
  if (mismatch === "direction") payment.direction = "app_to_user";
  if (mismatch === "buyer") payment.user_uid = "other";
  if (mismatch === "order") payment.metadata.orderId = new ObjectId().toString();
  if (mismatch === "amount") payment.amount = 1;
  if (mismatch === "txid") payment.transaction.txid = "other-tx";
  if (mismatch === "cancelled") payment.status.cancelled = true;
  if (delayedTransaction) payment.transaction = null;
  if (piAlreadyCompleted) { payment.status = { developer_completed: true, transaction_verified: true }; payment.transaction.verified = true; }
  let updates = 0,
    completions = 0,
    apiReads = 0,
    response;
  const modules = {
    mongodb: { ObjectId },
    "../services/auth": { resolveCurrentUser: async () => ({ uid: "buyer" }) },
    "../services/platformAPIClient": {
      platformAPIKeyClient: {
        get: async () => {
          apiReads++;
          return { data: payment };
        },
        post: async () => {
          completions++;
          if (piFailure) throw piFailure;
          return { data: { ...payment, transaction: { txid: confirmedMismatch ? "wrong-tx" : "tx-1", verified: !unverified }, status: { developer_completed: true, transaction_verified: !unverified } } };
        },
      },
    },
    "../services/notifications": { createNotification: async () => { if (notificationHangs) await new Promise(() => {}); } },
  };
  const exports = {};
  vm.runInNewContext(serverCode, { exports, require: name => modules[name], Date, Promise });
  const routes = {};
  const router = {
    get: () => {},
    post: (path, handler) => {
      routes[path] = handler;
    },
  };
  exports.default(router);
  const req = {
    body: { orderId: order._id.toString(), paymentId: "payment-1", txid: "tx-1" },
    app: {
      locals: {
        marketplaceOrderCollection: {
          findOne: async query => (query.buyerId === "buyer" && String(query._id) === String(order._id) ? order : null),
          updateOne: async (_, update) => {
            updates++;
            if (update.$set) assert.equal(update.$set.status, order.status === "pending" ? "paid" : order.status);
            else assert.equal(update.$addToSet.paymentReconciliation.reason, "amount_mismatch");
            return { matchedCount: 1 };
          },
        },
      },
    },
  };
  const res = {
    status: status => ({
      json: body => {
        response = { status, body };
      },
    }),
  };
  if (recovery) req.body.orderId = new ObjectId().toString();
  await routes[recovery ? "/incomplete" : "/complete"](req, res);
  return { response, updates, completions, apiReads };
}
test("server verifies buyer, order, amount, transaction and cancellation before completing", async () => {
  for (const mismatch of ["identifier", "direction", "buyer", "order", "amount", "txid", "cancelled"]) {
    const result = await completePayment({ mismatch });
    assert.equal(result.response.status, 400, mismatch);
    assert.equal(result.updates, 0, mismatch);
    assert.equal(result.completions, 0, mismatch);
  }
});
test("server completes a matching submitted payment", async () => {
  const result = await completePayment();
  assert.equal(result.response.status, 200);
  assert.equal(result.updates, 1);
  assert.equal(result.completions, 1);
});
test("completion retries do not repeat Pi completion or order updates", async () => {
  const result = await completePayment({ alreadyPaid: true });
  assert.equal(result.response.status, 200);
  assert.equal(result.updates, 0);
  assert.equal(result.completions, 0);
  assert.equal(result.apiReads, 0);
});
test("Pi decimal precision accepts equivalent legacy order prices without accepting different amounts", async () => {
  const result = await completePayment({ rounded: true });
  assert.equal(result.response.status, 200);
  assert.equal(result.completions, 1);
});
test("server resolves incomplete payments from authoritative Pi order metadata", async () => {
  const result = await completePayment({ recovery: true });
  assert.equal(result.response.status, 200);
  assert.equal(result.completions, 1);
  assert(result.response.body.orderId);
});
test("SDK discovery during wallet creation recovers instead of leaving the pending error", async () => {
  const app = setup({
    incompleteAtCreate: true,
    incomplete: { identifier: "payment-1", metadata: { orderId: "order-1" } },
  });
  let complete = 0,
    error;
  await app.payOrder("order-1", 3, {
    onComplete: () => complete++,
    onError: value => {
      error = value;
    },
  });
  assert.equal(complete, 1);
  assert.equal(error, undefined);
  assert.equal(app.opened(), 1);
});

test("submitted payment in SDK error details recovers even without the discovery callback", async () => {
  const app = setup({
    incompleteAtCreate: true,
    incompleteFromError: true,
    incomplete: { identifier: "payment-1", metadata: { orderId: "order-1" }, transaction: { txid: "tx-1" } },
  });
  let complete = 0;
  await app.payOrder("order-1", 3, { onComplete: () => complete++ });
  assert.equal(complete, 1);
  assert.equal(app.requests.filter(r => r[1] === "/payments/incomplete").length, 1);
});

test("a transaction absent from the initial lookup is verified through Pi completion", async () => {
  const result = await completePayment({ delayedTransaction: true });
  assert.equal(result.response.status, 200); assert.equal(result.updates, 1);
});
test("unverified Pi completion cannot mark an order paid", async () => {
  const result = await completePayment({ unverified: true });
  assert.equal(result.response.status, 409); assert.equal(result.updates, 0);
});
test("a mismatched completed transaction cannot mark an order paid", async () => {
  const result = await completePayment({ confirmedMismatch: true });
  assert.equal(result.response.status, 400); assert.equal(result.updates, 0);
});

test("a payment already completed by Pi repairs the order without re-completing at Pi", async () => {
  const result = await completePayment({ piAlreadyCompleted: true });
  assert.equal(result.response.status, 200); assert.equal(result.updates, 1); assert.equal(result.completions, 0);
});
test("an order with a recorded pending payment recovers before opening another wallet payment", async () => {
  const app = setup({ existingPayment: true }); let completed = 0;
  await app.payOrder("order-1", 3, { onComplete: () => completed++ });
  assert.equal(completed, 1); assert.equal(app.opened(), 0);
});
test("a failed recorded payment recovery cannot create a second payment", async () => {
  const app = setup({ existingPayment: true, recoveryFails: true }); let error;
  await app.payOrder("order-1", 3, { onError: message => { error = message; } });
  assert.equal(error, "Recovery failed"); assert.equal(app.opened(), 0);
});

test("incomplete recovery verifies the SDK hash when the Pi lookup has no transaction yet", async () => {
  const result = await completePayment({ recovery: true, delayedTransaction: true });
  assert.equal(result.response.status, 200);
  assert.equal(result.updates, 1);
  assert.equal(result.completions, 1);
});

test("incomplete recovery completes Pi without rolling back fulfillment or cancellation", async () => {
  for (const orderStatus of ["paid", "processing", "shipped", "delivered", "completed", "cancelled"]) {
    const result = await completePayment({ recovery: true, orderStatus });
    assert.equal(result.response.status, 200, orderStatus);
    assert.equal(result.completions, 1, orderStatus);
    assert.equal(result.updates, 1, orderStatus);
  }
});
test("recovery completes Pi even when MongoDB already records this payment", async () => {
  const result = await completePayment({ recovery: true, alreadyPaid: true, orderStatus: "shipped" });
  assert.equal(result.response.status, 200);
  assert.equal(result.completions, 1);
  assert.equal(result.updates, 0);
});
test("normal completion still rejects a new payment on a non-pending order", async () => {
  const result = await completePayment({ orderStatus: "cancelled" });
  assert.equal(result.response.status, 400);
  assert.equal(result.completions, 0);
  assert.equal(result.updates, 0);
});
test("recovery acknowledges a different amount without marking the order paid", async () => {
  const result = await completePayment({ recovery: true, orderStatus: "shipped", mismatch: "amount" });
  assert.equal(result.response.status, 200);
  assert.equal(result.response.body.orderId, "");
  assert.equal(result.response.body.requiresReconciliation, true);
  assert.equal(result.completions, 1);
  assert.equal(result.updates, 1);
});

test("a different pending payment discovered by the wallet is recovered and checkout retries automatically", async () => {
  const app = setup({ incompleteAtCreate: true, incomplete: { identifier: "old", metadata: { orderId: "old-order" }, transaction: { txid: "old-tx" } } });
  let complete = 0;
  const pending = app.payOrder("order-1", 3, { onComplete: () => complete++ });
  await flush(); await flush();
  assert.equal(app.opened(), 2);
  assert.equal(complete, 0);
  await app.callbacks().onReadyForServerCompletion("new", "new-tx");
  await pending;
  assert.equal(complete, 1);
});

test("transient confirmation failure retries the same payment and hash before completing", async () => {
  const app = setup({ completionFailures: [{ response: { status: 502 } }, { response: { status: 409, data: { error: "verification_pending" } } }] });
  let completed = 0;
  const pending = app.payOrder("order-1", 3, { onComplete: () => completed++ });
  await flush();
  await app.callbacks().onReadyForServerCompletion("payment-1", "tx-1");
  await pending;
  const posts = app.requests.filter(r => r[1] === "/payments/complete");
  assert.equal(posts.length, 3);
  for (const request of posts) {
    assert.equal(request[2].paymentId, "payment-1");
    assert.equal(request[2].txid, "tx-1");
    assert.equal(request[3].timeout, 65000);
  }
  assert.equal(app.opened(), 1);
  assert.equal(completed, 1);
});

test("duplicate SDK completion callbacks share a request and notify once", async () => {
  const app = setup(); let completed = 0;
  const pending = app.payOrder("order-1", 3, { onComplete: () => completed++ });
  await flush();
  await Promise.all([app.callbacks().onReadyForServerCompletion("payment-1", "tx-1"), app.callbacks().onReadyForServerCompletion("payment-1", "tx-1")]);
  await pending;
  await app.callbacks().onReadyForServerCompletion("payment-1", "tx-1");
  assert.equal(app.requests.filter(r => r[1] === "/payments/complete").length, 1);
  assert.equal(completed, 1);
});

test("permanent confirmation rejection stops without retrying or marking paid", async () => {
  const app = setup({ completionFailures: [{ response: { status: 400, data: { message: "Wrong amount" } } }] });
  let error, completed = 0;
  const pending = app.payOrder("order-1", 3, { onError: value => { error = value; }, onComplete: () => completed++ });
  await flush(); await app.callbacks().onReadyForServerCompletion("payment-1", "tx-1"); await pending;
  assert.equal(error, "Wrong amount"); assert.equal(completed, 0);
  assert.equal(app.requests.filter(r => r[1] === "/payments/complete").length, 1);
});

test("server returns a retryable response when Pi completion fails instead of rejecting the handler", async () => {
  const result = await completePayment({ piFailure: { response: { status: 503 } } });
  assert.equal(result.response.status, 502); assert.equal(result.response.body.retryable, true);
  assert.equal(result.updates, 0);
});

test("server reports rejected app API credentials without exposing upstream details", async () => {
  const result = await completePayment({ piFailure: { response: { status: 401 } } });
  assert.equal(result.response.status, 502); assert.equal(result.response.body.retryable, false);
  assert.equal(result.updates, 0);
});

test("slow push delivery does not delay the successful wallet completion response", async () => {
  const result = await completePayment({ notificationHangs: true });
  assert.equal(result.response.status, 200); assert.equal(result.updates, 1);
});

test("exhausted transient retries keep checkout busy for the next SDK completion callback", async () => {
  const app = setup({ completionFailures: Array.from({ length: 3 }, () => ({ response: { status: 503 } })) });
  let completed = 0, errors = 0;
  const pending = app.payOrder("order-1", 3, { onComplete: () => completed++, onError: () => errors++ });
  await flush();
  await app.callbacks().onReadyForServerCompletion("payment-1", "tx-1");
  assert.deepEqual(app.busy, [true]); assert.equal(errors, 0);
  await app.callbacks().onReadyForServerCompletion("payment-1", "tx-1"); await pending;
  assert.equal(completed, 1); assert.equal(app.opened(), 1);
});
