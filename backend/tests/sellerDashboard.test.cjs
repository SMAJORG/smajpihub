const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  ts = require("typescript");
const exportsModule = {};
new Function(
  "exports",
  ts.transpileModule(
    fs.readFileSync("backend/src/services/sellerDashboard.ts", "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText,
)(exportsModule);
const { summarizeSeller, sellerResponseMetrics, buildSellerDashboard } =
  exportsModule;
const now = Date.parse("2026-10-17T12:00:00Z"),
  hash = "a".repeat(64),
  other = "b".repeat(64),
  payout = "c".repeat(64);
const order = {
  _id: "one",
  sellerId: "seller",
  status: "paid",
  paymentStatus: "paid",
  paidAt: "2026-10-17T01:00:00Z",
  pricePi: 999,
};
const receipt = {
  intentKey: "store:one",
  verified: true,
  amountPi: 2,
  network: "Pi Testnet",
  txid: hash,
  verifiedAt: order.paidAt,
};
const settlement = {
  orderId: "one",
  sellerUid: "seller",
  amountPi: 2,
  network: "Pi Testnet",
  receiptTxid: hash,
  status: "held",
  createdAt: order.paidAt,
};
test("gross receipts are deduplicated and are not seller earnings", () => {
  const data = summarizeSeller(
    [order],
    [settlement],
    [receipt, { ...receipt, _id: "alias" }],
    now,
  );
  const finance = data.finance[0];
  assert.equal(finance.grossSales, 2);
  assert.equal(finance.today, 2);
  assert.equal(finance.week, 2);
  assert.equal(finance.month, 2);
  assert.equal(finance.pendingFunds, 2);
  assert.equal(finance.lifetimeEarnings, 0);
  assert.equal(finance.completedPayments, 0);
  assert.equal(data.paidIds.size, 1);
  assert.equal(finance.series.at(-1).payments, 1);
  assert.equal(finance.hours[1].sales, 2);
});
test("payouts require a verified transaction and never mix networks", () => {
  const orders = [order, { ...order, _id: "two" }];
  const payouts = [
    {
      ...settlement,
      status: "settled",
      txid: payout,
      verifiedAt: order.paidAt,
    },
    {
      ...settlement,
      orderId: "two",
      network: "Pi Mainnet",
      amountPi: 5,
      receiptTxid: other,
    },
  ];
  const data = summarizeSeller(orders, payouts, [receipt], now);
  assert.equal(data.finance[0].lifetimeEarnings, 2);
  assert.equal(data.finance[0].pendingFunds, 0);
  assert.equal(data.finance[0].completedPayments, 1);
  assert.equal(data.finance[1].grossSales, 5);
  assert.equal(data.finance[1].pendingFunds, 5);
  const bad = summarizeSeller(
    [order],
    [{ ...settlement, status: "settled" }],
    [receipt],
    now,
  );
  assert.equal(bad.finance[0].lifetimeEarnings, 0);
});
test("legacy fulfillment status alone never creates sales; unknown networks stay separate", () => {
  const data = summarizeSeller(
    [order],
    [{ ...settlement, network: undefined }],
    [],
    now,
  );
  assert.equal(data.finance[0].grossSales, 0);
  assert.equal(data.finance[2].grossSales, 2);
  assert.equal(summarizeSeller([order], [], [], now).unverifiedOrders, 1);
  assert.equal(
    summarizeSeller([order], null, null, now).finance[0].grossSales,
    null,
  );
});
test("sales use payment dates rather than order updates, and refunds are distinct", () => {
  const data = summarizeSeller(
    [
      {
        ...order,
        paidAt: "2026-09-01T01:00:00Z",
        updatedAt: order.paidAt,
        refundStatus: "completed",
      },
    ],
    [settlement],
    [receipt],
    now,
  ).finance[0];
  assert.equal(data.today, 0);
  assert.equal(data.week, 0);
  assert.equal(data.month, 0);
  assert.equal(data.grossSales, 2);
  assert.equal(data.refundedSales, 2);
  assert.equal(data.pendingFunds, 0);
});
test("response metrics derive from first inbound and seller reply, not hardcoded values", () => {
  const conversations = [
    { _id: "a", buyerId: "buyer", sellerId: "seller" },
    { _id: "b", buyerId: "another", sellerId: "seller" },
  ];
  const messages = [
    {
      conversationId: "a",
      senderId: "buyer",
      createdAt: "2026-10-17T01:00:00Z",
    },
    {
      conversationId: "a",
      senderId: "seller",
      createdAt: "2026-10-17T01:10:00Z",
    },
    {
      conversationId: "b",
      senderId: "another",
      createdAt: "2026-10-17T01:00:00Z",
    },
  ];
  assert.deepEqual(sellerResponseMetrics(conversations, messages, "seller"), {
    responseRate: 50,
    responseMinutes: 10,
    conversations: 2,
  });
  assert.equal(sellerResponseMetrics([], [], "seller").responseRate, null);
});
function database() {
  const queries = [];
  const collection = (key, rows) => ({
    find: (query) => {
      queries.push({ key, query });
      return {
        sort() {
          return this;
        },
        limit() {
          return this;
        },
        toArray: async () => rows,
      };
    },
  });
  const locals = {
    productCollection: collection("products", [
      {
        _id: "p",
        quantity: 2,
        active: true,
        approved: true,
        reviewStatus: "approved",
      },
    ]),
    marketplaceOrderCollection: collection("orders", [order]),
    reviewCollection: collection("reviews", [
      { rating: 5 },
      { rating: 3 },
      { rating: "bad" },
    ]),
    settlementCollection: collection("settlements", [settlement]),
    paymentCollection: collection("payments", [receipt]),
    notificationCollection: collection("notifications", []),
    conversationCollection: collection("conversations", []),
  };
  return { locals, queries };
}
test("every source is scoped to the authenticated seller and verification matches selling access", async () => {
  const { locals, queries } = database();
  const data = await buildSellerDashboard(
    locals,
    {
      uid: "seller",
      role: "buyer",
      verificationStatus: "approved",
      verificationLevel: "trusted_seller",
    },
    now,
  );
  for (const key of ["products", "orders", "reviews", "conversations"])
    assert.equal(
      queries.find((row) => row.key === key).query.sellerId,
      "seller",
    );
  assert.equal(
    queries.find((row) => row.key === "settlements").query.sellerUid,
    "seller",
  );
  assert.equal(
    queries.find((row) => row.key === "notifications").query.userId,
    "seller",
  );
  assert.deepEqual(
    queries.find((row) => row.key === "payments").query.intentKey,
    { $in: ["store:one"] },
  );
  assert.equal(data.seller.active, false);
  assert.equal(data.seller.verificationLevel, "pi_verified");
  assert.equal(data.performance.averageRating, 4);
  assert.equal(data.performance.responseRate, null);
  assert.equal(data.inventory.lowStock, 1);
  assert.equal(data.stats.paidOrders, 1);
});
test("optional source failures are visible without replacing missing earnings with zero", async () => {
  const { locals } = database();
  delete locals.settlementCollection;
  delete locals.notificationCollection;
  const data = await buildSellerDashboard(
    locals,
    { uid: "seller", sellerActive: true },
    now,
  );
  assert.equal(data.finance[0].lifetimeEarnings, null);
  assert.equal(data.notifications, null);
  assert.ok(data.warnings.includes("settlementCollection"));
});

test("dashboard endpoint requires authentication and ignores a supplied seller id", async () => {
  const routes = new Map();
  const router = {};
  for (const method of ["get", "post", "put", "patch", "delete"])
    router[method] = (url, ...handlers) =>
      routes.set(method + " " + url, handlers.at(-1));
  let current = null,
    seen = null;
  const code = ts.transpileModule(
    fs.readFileSync("backend/src/handlers/marketplace.ts", "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    },
  ).outputText;
  const output = {};
  new Function("require", "exports", code)(
    (name) =>
      name === "mongodb"
        ? require("mongodb")
        : name.endsWith("/auth")
          ? { resolveCurrentUser: async () => current }
          : name.endsWith("/sellerDashboard")
            ? {
                buildSellerDashboard: async (_locals, user) => {
                  seen = user.uid;
                  return { products: [] };
                },
              }
            : name.endsWith("/profileAvatars")
              ? { enrichProfileAvatars: async (_req, items) => items }
              : name.endsWith("/environments")
                ? { __esModule: true, default: { pi_network: "Pi Testnet" } }
                : {},
    output,
  );
  output.default(router);
  const call = async (key, locals = {}) => {
    const result = { status: 200 };
    const response = {
      status(value) {
        result.status = value;
        return this;
      },
      json(value) {
        result.body = value;
        return this;
      },
      setHeader() {},
    };
    await routes.get(key)(
      {
        app: { locals },
        query: { sellerId: "victim" },
        params: { id: "000000000000000000000001" },
        body: { active: false },
      },
      response,
    );
    return result;
  };
  assert.equal((await call("get /seller/dashboard")).status, 401);
  assert.equal(seen, null);
  current = { uid: "actual-seller" };
  assert.equal((await call("get /seller/dashboard")).status, 200);
  assert.equal(seen, "actual-seller");
  let filter;
  await call("patch /seller/products/:id/availability", {
    productCollection: {
      updateOne: async (query) => {
        filter = query;
        return { matchedCount: 0 };
      },
    },
  });
  assert.equal(filter.sellerId, "actual-seller");
  await call("delete /seller/products/:id", {
    productCollection: {
      deleteOne: async (query) => {
        filter = query;
        return { deletedCount: 0 };
      },
    },
  });
  assert.equal(filter.sellerId, "actual-seller");
});
