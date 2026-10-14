const test = require("node:test"),
  assert = require("node:assert/strict");
const { MongoClient, ObjectId } = require("mongodb");
const crypto = require("node:crypto");
require("ts-node/register/transpile-only");
const {
  financialTransaction,
  bindPayment,
} = require("../src/services/financialIntegrity");
const { releaseOrderInventory } = require("../src/services/orderLifecycle");
const uri = process.env.P0_TEST_MONGODB_URI;

// Explicit opt-in, loopback-only server, newly generated disposable database.
test(
  "real MongoDB transaction rollback, exactly-once stock release and transfer uniqueness",
  { skip: !uri },
  async () => {
    assert.match(
      uri,
      /^mongodb:\/\/(?:[^@/]+@)?(?:127\.0\.0\.1|localhost)(?::\d+)?\//,
      "Only an explicitly configured local test MongoDB is permitted",
    );
    const client = await MongoClient.connect(uri);
    const db = client.db("p0_test_" + crypto.randomBytes(12).toString("hex"));
    const app = {
      locals: {
        mongoClient: client,
        productCollection: db.collection("products"),
        marketplaceOrderCollection: db.collection("orders"),
        paymentCollection: db.collection("payments"),
      },
    };
    try {
      const productId = new ObjectId(),
        orderId = new ObjectId();
      await app.locals.productCollection.insertOne({
        _id: productId,
        quantity: 2,
      });
      await assert.rejects(() =>
        financialTransaction(app, async (session) => {
          await app.locals.productCollection.updateOne(
            { _id: productId },
            { $inc: { quantity: -1 } },
            { session },
          );
          await app.locals.marketplaceOrderCollection.insertOne(
            { _id: orderId },
            { session },
          );
          throw new Error("Simulated process failure before commit");
        }),
      );
      assert.equal(
        (await app.locals.productCollection.findOne({ _id: productId }))
          .quantity,
        2,
      );
      assert.equal(
        await app.locals.marketplaceOrderCollection.countDocuments({}),
        0,
      );
      const order = {
        _id: orderId,
        productId: String(productId),
        quantity: 1,
        inventoryReserved: true,
        inventoryReleased: false,
      };
      await app.locals.marketplaceOrderCollection.insertOne(order);
      await Promise.all([
        releaseOrderInventory(app, order, "test"),
        releaseOrderInventory(app, order, "retry"),
      ]);
      assert.equal(
        (await app.locals.productCollection.findOne({ _id: productId }))
          .quantity,
        3,
      );
      const payment = {
        identifier: "test",
        network: "Pi Testnet",
        transaction: { txid: "hash", verified: true },
      };
      await financialTransaction(app, (session) =>
        bindPayment(app, payment, "store:test", session),
      );
      await assert.rejects(() =>
        financialTransaction(app, (session) =>
          bindPayment(app, payment, "jobs:test", session),
        ),
      );
    } finally {
      await db.dropDatabase();
      await client.close();
    }
  },
);
