const { test } = require("node:test");
const assert = require("node:assert/strict");
require("ts-node/register/transpile-only");
const { ObjectId } = require("mongodb");
const { MemoryCollection } = require("../src/services/memoryDatabase");
test("checkout resumes own reserved unpaid order but rejects unavailable stock for other buyers", async () => {
  const Module = require("node:module"),
    original = Module._load;
  const suffix = require("node:path").join("handlers", "marketplace.ts");
  let buyer = "buyer";
  Module._load = function (name, parent) {
    if (parent?.filename.endsWith(suffix)) {
      if (name === "../services/auth")
        return { resolveCurrentUser: async () => ({ uid: buyer }) };
      if (name === "../environments") return {};
      if (name === "../services/imageStorage") return {};
      if (name === "../services/notifications")
        return { createNotification: async () => {} };
      if (name === "../services/piPricing") return { piFromUsdt: () => 1 };
    }
    return original.apply(this, arguments);
  };
  let mount;
  try {
    mount = require("../src/handlers/marketplace").default;
  } finally {
    Module._load = original;
  }
  const express = require("express"),
    app = express(),
    router = express.Router();
  app.use(express.json());
  const productId = new ObjectId(),
    orderId = new ObjectId();
  app.locals.productCollection = new MemoryCollection([
    {
      _id: productId,
      active: true,
      approved: true,
      reviewStatus: "approved",
      sellerId: "seller",
      quantity: 0,
    },
  ]);
  app.locals.marketplaceOrderCollection = new MemoryCollection([
    {
      _id: orderId,
      buyerId: "buyer",
      productId: String(productId),
      quantity: 1,
      status: "pending",
      paymentStatus: "pending",
      inventoryReserved: true,
      inventoryReleased: false,
    },
  ]);
  mount(router);
  app.use(router);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const request = () =>
    fetch("http://127.0.0.1:" + server.address().port + "/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: String(productId), quantity: 1 }),
    });
  try {
    let response = await request();
    assert.equal(response.status, 200);
    assert.equal((await response.json()).order._id, String(orderId));
    assert.equal(
      (await app.locals.productCollection.findOne({ _id: productId })).quantity,
      0,
    );
    assert.equal(
      await app.locals.marketplaceOrderCollection.countDocuments(),
      1,
    );
    buyer = "other";
    response = await request();
    assert.equal(response.status, 409);
    buyer = "buyer";
    await app.locals.marketplaceOrderCollection.updateOne(
      { _id: orderId },
      { $set: { status: "paid", paymentStatus: "paid" } },
    );
    response = await request();
    assert.equal(response.status, 409);
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
});
