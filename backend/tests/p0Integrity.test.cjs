const test = require("node:test"),
  assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  ts = require("typescript");
const { ObjectId } = require("mongodb");
function harness() {
  const actor = { _id: new ObjectId(), uid: "buyer", jobsRole: "employer" };
  let payment,
    posts = 0;
  const api = {
    get: async () => ({ data: payment }),
    post: async () => {
      posts++;
      return { data: payment };
    },
  };
  const cache = new Map();
  const load = (file) => {
    file = path.resolve(__dirname, "../src", file);
    if (cache.has(file)) return cache.get(file);
    const exports = {};
    cache.set(file, exports);
    const code = ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText;
    new Function("require", "exports", code)((name) => {
      if (name.endsWith("/environments"))
        return {
          __esModule: true,
          default: {
            pi_network: "Pi Testnet",
            is_production: true,
            pi_api_key: "mock",
          },
        };
      if (name.endsWith("/platformAPIClient"))
        return { platformAPIKeyClient: api };
      if (name.endsWith("/auth"))
        return { resolveCurrentUser: async () => actor };
      if (name.endsWith("/notifications"))
        return { createNotification: async () => {} };
      if (name.startsWith("."))
        return load(
          path.relative(
            path.resolve(__dirname, "../src"),
            path.resolve(path.dirname(file), name + ".ts"),
          ),
        );
      return require(name);
    }, exports);
    return exports;
  };
  const app = {
    locals: {
      ...load("services/memoryDatabase.ts").createMemoryCollections(),
      piNetwork: "Pi Testnet",
    },
  };
  const mount = (file) => {
    const routes = {};
    const router = { use() {} };
    for (const verb of ["get", "post", "patch", "put", "delete"])
      router[verb] = (p, h) => {
        routes[verb.toUpperCase() + " " + p] = h;
      };
    load(file).default(router);
    return routes;
  };
  const response = () => ({
    code: 200,
    headersSent: false,
    status(n) {
      this.code = n;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  });
  return {
    actor,
    app,
    load,
    mount,
    response,
    setPayment(p) {
      payment = p;
    },
    posts: () => posts,
  };
}
const incoming = (id, metadata, amount = 3) => ({
  identifier: id,
  direction: "user_to_app",
  user_uid: "buyer",
  amount,
  network: "Pi Testnet",
  metadata,
  transaction: { txid: "tx", verified: true },
  status: { developer_completed: true, transaction_verified: true },
});

test("shared verification rejects payer, amount, intent, direction, network and verification mismatches", () => {
  const h = harness(),
    verify = h.load("services/financialIntegrity.ts").verifyIncomingPayment;
  const good = incoming("p", { billingId: "b" }),
    expected = {
      paymentId: "p",
      payer: "buyer",
      amount: 3,
      metadataKey: "billingId",
      intentId: "b",
    };
  verify(good, expected, true, "tx");
  for (const patch of [
    { user_uid: "other" },
    { amount: 1 },
    { metadata: { billingId: "other" } },
    { direction: "app_to_user" },
    { network: "Pi Network" },
    { identifier: "other" },
    { transaction: { txid: "wrong", verified: true } },
    { status: { developer_completed: true, transaction_verified: false } },
    { status: { cancelled: true } },
  ])
    assert.throws(() => verify({ ...good, ...patch }, expected, true, "tx"));
});
test("payment and transaction identities cannot cross domains or credit twice", async () => {
  const h = harness(),
    bind = h.load("services/financialIntegrity.ts").bindPayment,
    p = incoming("p", { orderId: "o" });
  await bind(h.app, p, "store:o");
  await bind(h.app, p, "store:o");
  await assert.rejects(() => bind(h.app, p, "jobs:b"));
  await assert.rejects(() =>
    bind(h.app, { ...p, identifier: "p2" }, "store:o"),
  );
  await assert.rejects(() => bind(h.app, { ...p, identifier: "p3" }, "jobs:b"));
});
test("legacy Store receipts cannot be reused by Jobs before a ledger backfill", async () => {
  const h = harness();
  await h.app.locals.marketplaceOrderCollection.insertOne({ paymentId: "legacy", paymentStatus: "paid" });
  await assert.rejects(() => h.load("services/financialIntegrity.ts").bindPayment(h.app, incoming("legacy", { billingId: "b" }), "jobs:b"));
});
test("late callbacks retain verified receipt and reject replacement payment identifiers", async () => {
  const h = harness(),
    routes = h.mount("handlers/payments.ts"),
    id = new ObjectId();
  await h.app.locals.marketplaceOrderCollection.insertOne({
    _id: id,
    buyerId: "buyer",
    status: "completed",
    paymentStatus: "paid",
    paymentId: "p",
    paymentTxid: "tx",
    paidAt: new Date(),
  });
  for (const route of ["/failed", "/cancelled_payment"]) {
    const req = { app: h.app, body: { orderId: String(id), paymentId: "p" } };
    const res = h.response();
    await routes["POST " + route](req, res);
    assert.equal(res.code, 200);
    const saved = await h.app.locals.marketplaceOrderCollection.findOne({
      _id: id,
    });
    assert.equal(saved.paymentStatus, "paid");
    assert.equal(saved.paymentTxid, "tx");
    req.body.paymentId = "other";
    const denied = h.response();
    await routes["POST " + route](req, denied);
    assert.equal(denied.code, 409);
  }
});
test("private and legacy CVs are denied; application ownership and blocking are enforced", () => {
  const h = harness(),
    visible = h.load("services/candidateAuthorization.ts").visibleCv;
  const company = {
    ownerId: String(h.actor._id),
    slug: "co",
    verified: true,
    moderationStatus: "approved",
  };
  const profile = {
    userId: "candidate",
    cv: { url: "secret", visibility: "private", protectedAsset: true },
  };
  assert.equal(visible(profile, h.actor), undefined);
  assert.equal(visible(profile, h.actor, company), undefined);
  profile.cv.visibility = "applications";
  assert.equal(visible(profile, h.actor, company), undefined);
  const application = {
    candidateId: "candidate",
    employerId: String(h.actor._id),
  };
  assert.equal(visible(profile, h.actor, company, application).url, "secret");
  profile.blockedEmployerIds = ["co"];
  assert.equal(visible(profile, h.actor, company, application), undefined);
  profile.blockedEmployerIds = [];
  profile.cv.protectedAsset = false;
  assert.equal(visible(profile, h.actor, company, application), undefined);
});
test("Jobs rejects underpayment and replay preserves the original activation date", async () => {
  const h = harness(),
    routes = h.mount("handlers/jobs.ts");
  await h.app.locals.jobBillingCollection.insertOne({
    billingId: "b",
    employerId: String(h.actor._id),
    id: "monthly",
    pricePi: 3,
    status: "processing",
    paymentId: "p",
  });
  h.setPayment(incoming("p", { billingId: "b" }, 1));
  const req = {
    app: h.app,
    body: { billingId: "b", paymentId: "p", txid: "tx" },
  };
  const denied = h.response();
  await routes["POST /billing/complete"](req, denied);
  assert.equal(denied.code, 400);
  h.setPayment(incoming("p", { billingId: "b" }));
  const ok = h.response();
  await routes["POST /billing/complete"](req, ok);
  assert.equal(ok.code, 200);
  const saved = await h.app.locals.jobBillingCollection.findOne({
    billingId: "b",
  });
  assert.equal(saved.status, "paid");
  const replay = h.response();
  await routes["POST /billing/complete"](req, replay);
  assert.equal(replay.code, 200);
  assert.equal(
    (await h.app.locals.jobBillingCollection.findOne({ billingId: "b" }))
      .paidAt,
    saved.paidAt,
  );
  assert.equal(h.posts(), 0);
});
test("financial writes fail closed without a transactional production database", async () => {
  const h = harness(),
    run = h.load("services/financialIntegrity.ts").financialTransaction;
  let called = false;
  await assert.rejects(() =>
    run({ locals: {} }, async () => {
      called = true;
    }),
  );
  assert.equal(called, false);
});
test("candidate detail endpoint redacts a private CV for an employer without a company", async () => {
  const h = harness(),
    routes = h.mount("handlers/jobs.ts");
  await h.app.locals.jobProfileCollection.insertOne({
    userId: "candidate",
    cv: {
      url: "private-document",
      visibility: "private",
      protectedAsset: true,
    },
  });
  const res = h.response();
  await routes["GET /employer/candidates/:userId"](
    { app: h.app, params: { userId: "candidate" } },
    res,
  );
  assert.equal(res.code, 200);
  assert.equal(res.body.candidate.cv, undefined);
});
test("repeated checkout returns the same order without reserving more stock", async () => {
  const h = harness(),
    routes = h.mount("handlers/marketplace.ts"),
    productId = new ObjectId();
  await h.app.locals.productCollection.insertOne({
    _id: productId,
    active: true,
    approved: true,
    reviewStatus: "approved",
    sellerId: "merchant",
    pricePi: 3,
    quantity: 2,
  });
  const req = {
    app: h.app,
    body: { productId: String(productId), quantity: 1 },
    get: () => "stable-checkout-key",
  };
  const first = h.response();
  await routes["POST /orders"](req, first);
  assert.equal(first.code, 201);
  const second = h.response();
  await routes["POST /orders"](req, second);
  assert.equal(second.code, 200);
  assert.equal(first.body.order._id, second.body.order._id);
  assert.equal(
    (await h.app.locals.productCollection.findOne({ _id: productId })).quantity,
    1,
  );
  req.body.quantity = 2;
  const conflict = h.response();
  await routes["POST /orders"](req, conflict);
  assert.equal(conflict.code, 409);
});
test("expiry releases unpaid stock once and never releases an unresolved payment", async () => {
  const h = harness(),
    recover = h.load(
      "services/inventoryRecovery.ts",
    ).expireUnfundedReservations;
  const productId = new ObjectId();
  await h.app.locals.productCollection.insertOne({
    _id: productId,
    quantity: 0,
  });
  await h.app.locals.marketplaceOrderCollection.insertOne({
    productId: String(productId),
    quantity: 1,
    status: "pending",
    paymentId: null,
    inventoryReserved: true,
    inventoryReleased: false,
    reservationExpiresAt: new Date(0),
  });
  await h.app.locals.marketplaceOrderCollection.insertOne({
    productId: String(productId),
    quantity: 1,
    status: "pending",
    paymentId: "unresolved",
    inventoryReserved: true,
    inventoryReleased: false,
    reservationExpiresAt: new Date(0),
  });
  await recover(h.app);
  await recover(h.app);
  assert.equal(
    (await h.app.locals.productCollection.findOne({ _id: productId })).quantity,
    1,
  );
  assert.equal(
    (
      await h.app.locals.marketplaceOrderCollection.findOne({
        paymentId: "unresolved",
      })
    ).status,
    "pending",
  );
});
test("settlement requires a completed order, payable and verified recipient transfer", async () => {
  const h = harness(),
    id = new ObjectId(),
    service = h.load("services/merchantSettlement.ts");
  await h.app.locals.marketplaceOrderCollection.insertOne({
    _id: id,
    sellerId: "merchant",
    buyerId: "buyer",
    pricePi: 3,
    status: "completed",
    paymentStatus: "paid",
  });
  await h.app.locals.settlementCollection.insertOne({
    _id: "store:" + id,
    amountPi: 3,
    sellerUid: "merchant",
    status: "held",
  });
  h.setPayment({
    ...incoming("out", { orderId: String(id) }),
    direction: "app_to_user",
    user_uid: "merchant",
    to_address: "merchant-wallet",
  });
  assert.equal(
    (await service.recordMerchantSettlement(h.app, String(id), "out")).status,
    "settled",
  );
  await service.recordMerchantSettlement(h.app, String(id), "out");
  h.setPayment({
    ...incoming("other", { orderId: String(id) }),
    direction: "app_to_user",
    user_uid: "wrong",
    to_address: "wrong-wallet",
  });
  await assert.rejects(() =>
    service.recordMerchantSettlement(h.app, String(id), "other"),
  );
});
