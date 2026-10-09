const { test } = require("node:test");
const assert = require("node:assert/strict");
require("ts-node/register/transpile-only");
const { ObjectId } = require("mongodb");
const { MemoryCollection } = require("../src/services/memoryDatabase");
const {
  verifiedTestnetPayment,
  testnetExplorerUrl,
  LiveTransactionFeed,
} = require("../src/services/liveTransactions");
const hash = "a".repeat(64),
  candidate = {
    paymentId: "test-payment",
    txid: hash,
    amount: 2,
    time: "2026-01-02T10:00:00Z",
  };
const payment = () => ({
  identifier: candidate.paymentId,
  network: "Pi Testnet",
  direction: "user_to_app",
  amount: 2,
  created_at: "2026-01-01T10:00:00Z",
  status: {
    developer_approved: true,
    developer_completed: true,
    transaction_verified: true,
    cancelled: false,
    user_cancelled: false,
  },
  transaction: {
    txid: hash,
    verified: true,
    _link: `https://blockexplorer.minepi.com/testnet/transactions/${hash}`,
  },
  user_uid: "private-user",
  from_address: "private-address",
  metadata: { private: true },
});
const order = () => ({
  _id: new ObjectId(),
  paymentStatus: "paid",
  paymentId: candidate.paymentId,
  paymentTxid: hash,
  pricePi: 2,
  paidAt: candidate.time,
});
test("strict Testnet completion and binding gates; no private fields", () => {
  assert.equal(
    verifiedTestnetPayment(payment(), candidate).time,
    "2026-01-02T10:00:00.000Z",
  );
  for (const k of [
    "developer_approved",
    "developer_completed",
    "transaction_verified",
  ]) {
    const p = payment();
    p.status[k] = false;
    assert.equal(verifiedTestnetPayment(p, candidate), null);
  }
  for (const k of ["cancelled", "user_cancelled"]) {
    const p = payment();
    p.status[k] = true;
    assert.equal(verifiedTestnetPayment(p, candidate), null);
  }
  for (const overrides of [
    { network: "Pi Network" },
    { network: undefined },
    { direction: "app_to_user" },
    { identifier: "wrong" },
    { amount: 3 },
    { amount: NaN },
    { amount: 0 },
    { amount: "2" },
    { transaction: null },
    { transaction: { txid: hash, verified: false } },
    { transaction: { txid: "b".repeat(64), verified: true } },
  ])
    assert.equal(
      verifiedTestnetPayment({ ...payment(), ...overrides }, candidate),
      null,
    );
  assert(
    !JSON.stringify(verifiedTestnetPayment(payment(), candidate)).includes(
      "private",
    ),
  );
  assert.equal(
    verifiedTestnetPayment(payment(), { ...candidate, time: undefined })
      .timeKind,
    "payment-created",
  );
});
test("only HTTPS official Testnet explorer links with the matching hash", () => {
  assert(testnetExplorerUrl(payment().transaction._link, hash));
  for (const url of [
    "javascript:alert(1)",
    `https://evil.example/testnet/transactions/${hash}`,
    `https://blockexplorer.minepi.com/mainnet/transactions/${hash}`,
    `https://user:pass@blockexplorer.minepi.com/testnet/transactions/${hash}`,
    `https://api.testnet.minepi.com/operations/123`,
    `https://blockexplorer.minepi.com/testnet/transactions/${hash}?private=yes`,
  ])
    assert.equal(testnetExplorerUrl(url, hash), null);
});
test("single-flight, ten-second throttle, Mongo upsert deduplication, public allowlist", async () => {
  const live = new MemoryCollection();
  let calls = 0;
  const feed = new LiveTransactionFeed(
    {
      marketplaceOrderCollection: new MemoryCollection([order()]),
      liveTransactionCollection: live,
    },
    {
      get: async () => {
        calls++;
        await new Promise((r) => setImmediate(r));
        return { data: payment() };
      },
    },
  );
  await Promise.all([feed.refresh(), feed.refresh(), feed.refresh()]);
  assert.equal(calls, 1);
  await feed.refresh();
  assert.equal(calls, 1);
  await feed.refresh(Date.now() + 11000);
  assert.equal(calls, 1);
  assert.equal(await live.countDocuments(), 1);
  assert.deepEqual(Object.keys((await feed.latest())[0]).sort(), [
    "amount",
    "explorerUrl",
    "network",
    "time",
    "timeKind",
    "transactionId",
    "verified",
  ]);
});
test("Mainnet and API failures never enter the public feed", async () => {
  const locals = {
    marketplaceOrderCollection: new MemoryCollection([order()]),
    liveTransactionCollection: new MemoryCollection(),
  };
  const failed = new LiveTransactionFeed(locals, {
    get: async () => {
      throw Error("secret");
    },
  });
  await failed.refresh();
  assert(failed.unavailable);
  assert.deepEqual(await failed.latest(), []);
  const mainnet = new LiveTransactionFeed(locals, {
    get: async () => ({ data: { ...payment(), network: "Pi Network" } }),
  });
  await mainnet.refresh();
  assert.deepEqual(await mainnet.latest(), []);
});
test("latest ten sorted records exclude internal fields", async () => {
  const live = new MemoryCollection(
    Array.from({ length: 15 }, (_, i) => ({
      _id: new ObjectId(),
      transactionId: i.toString(16).padStart(64, "0"),
      amount: 1,
      time: new Date(Date.UTC(2026, 0, i + 1)).toISOString(),
      timeKind: "completion",
      network: "Pi Testnet",
      verified: true,
      paymentId: "hidden",
      user_uid: "hidden",
      explorerUrl: null,
    })),
  );
  const feed = new LiveTransactionFeed(
    { liveTransactionCollection: live },
    {
      get: async () => {
        throw Error("unexpected");
      },
    },
  );
  const rows = await feed.latest();
  assert.equal(rows.length, 10);
  assert.equal(rows[0].time, "2026-01-15T00:00:00.000Z");
  assert(!JSON.stringify(rows).includes("hidden"));
});
test("older paid records are eventually backfilled", async () => {
  const records = Array.from({ length: 12 }, (_, i) => ({
    ...order(),
    _id: new ObjectId(),
    paymentId: "payment-" + i,
    paymentTxid: i.toString(16).padStart(64, "0"),
  }));
  const live = new MemoryCollection();
  const feed = new LiveTransactionFeed(
    {
      liveTransactionCollection: live,
      marketplaceOrderCollection: new MemoryCollection(records),
    },
    {
      get: async (url) => {
        const id = url.split("/").pop();
        return {
          data: {
            ...payment(),
            identifier: id,
            transaction: {
              ...payment().transaction,
              txid: records.find((r) => r.paymentId === id).paymentTxid,
            },
          },
        };
      },
    },
  );
  const now = Date.now();
  for (let i = 0; i < 4; i++) await feed.refresh(now + i * 11000);
  assert.equal(await live.countDocuments(), 12);
});
test("public GET endpoint returns only verified snapshots; memory DB is unavailable", async () => {
  const Module = require("node:module");
  const original = Module._load;
  const handlerSuffix =
    "handlers" + require("node:path").sep + "transactions.ts";
  const config = {
    use_memory_db: false,
    pi_payments_enabled: false,
    pi_api_key: "",
    platform_api_url: "https://api.minepi.com",
  };
  Module._load = function (name, parent, main) {
    if (parent?.filename.endsWith(handlerSuffix)) {
      if (name === "../environments") return config;
      if (name === "../services/platformAPIClient")
        return {
          platformAPIKeyClient: {
            get: () => {
              throw Error("should not call with disabled payments");
            },
          },
        };
    }
    return original.apply(this, arguments);
  };
  let mount;
  try {
    mount = require("../src/handlers/transactions").default;
  } finally {
    Module._load = original;
  }
  const express = require("express");
  const app = express();
  app.locals.liveTransactionCollection = new MemoryCollection([
    {
      transactionId: hash,
      amount: 2,
      time: candidate.time,
      timeKind: "completion",
      network: "Pi Testnet",
      verified: true,
      user_uid: "hidden",
      paymentId: "hidden",
      explorerUrl: null,
    },
  ]);
  const router = express.Router();
  mount(router);
  app.use("/api/transactions", router);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  try {
    const url = `http://127.0.0.1:${server.address().port}/api/transactions/live`;
    const response = await fetch(url);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const body = await response.json();
    assert.equal(body.transactions.length, 1);
    assert(!JSON.stringify(body).includes("hidden"));
    assert.equal(body.availability, "unavailable");
    config.use_memory_db = true;
    const disabled = await fetch(url);
    assert.equal(disabled.status, 503);
    assert(!JSON.stringify(await disabled.json()).includes("hidden"));
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
});

test("recover completed payments without local hash or paid status across app sources", async () => {
  const collections = [
    "marketplaceOrderCollection",
    "jobBillingCollection",
    "transportBookingCollection",
    "coursePaymentCollection",
    "universityPaymentCollection",
  ];
  const locals = { liveTransactionCollection: new MemoryCollection() };
  collections.forEach((name, i) => {
    locals[name] = new MemoryCollection(
      Array.from({ length: 3 }, (_, j) => ({
        _id: new ObjectId(),
        paymentId: "recover-" + i + "-" + j,
        pi_payment_identifier: "recover-" + i + "-" + j,
        paymentStatus: "processing",
        status: "pending",
      })),
    );
  });
  locals.paymentCollection = new MemoryCollection([{ _id: new ObjectId(), identifier: "recover-5-0" }]);
  let calls = 0;
  const feed = new LiveTransactionFeed(locals, {
    get: async (url) => {
      const id = url.split("/").pop();
      const index = Number(id.split("-")[1]) * 3 + Number(id.split("-")[2]);
      calls++;
      return {
        data: {
          ...payment(),
          identifier: id,
          transaction: {
            verified: true,
            txid: index.toString(16).padStart(64, "0"),
          },
        },
      };
    },
  });
  await feed.refresh();
  assert.equal(calls, 16);
  assert.equal(await locals.liveTransactionCollection.countDocuments(), 16);
  assert.equal((await feed.latest()).length, 10);
  assert(
    (await feed.latest()).every((row) => row.timeKind === "payment-created"),
  );
});
test("missing local hash never weakens completion verification", () => {
  assert(verifiedTestnetPayment(payment(), { ...candidate, txid: undefined }));
  const incomplete = payment();
  incomplete.status.developer_completed = false;
  assert.equal(
    verifiedTestnetPayment(incomplete, { ...candidate, txid: undefined }),
    null,
  );
});
