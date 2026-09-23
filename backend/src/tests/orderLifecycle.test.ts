import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import { canTransitionOrder, releaseOrderInventory } from "../services/orderLifecycle";
import { createMemoryCollections } from "../services/memoryDatabase";

const run = async () => {
  assert.equal(canTransitionOrder("pending", "cancelled"), true);
  assert.equal(canTransitionOrder("pending", "shipped"), false);
  assert.equal(canTransitionOrder("paid", "processing"), true);
  assert.equal(canTransitionOrder("processing", "shipped"), true);
  assert.equal(canTransitionOrder("shipped", "completed"), true);
  assert.equal(canTransitionOrder("completed", "cancelled"), false);

  const collections = createMemoryCollections();
  const productId = new ObjectId();
  await collections.productCollection.insertOne({ _id: productId, quantity: 2 });
  const orderResult = await collections.marketplaceOrderCollection.insertOne({
    productId: productId.toString(),
    quantity: 3,
    inventoryReserved: true,
    inventoryReleased: false,
  });
  const order = await collections.marketplaceOrderCollection.findOne({ _id: orderResult.insertedId });
  const app = { locals: collections };

  assert.equal(await releaseOrderInventory(app, order!, "test"), true);
  assert.equal((await collections.productCollection.findOne({ _id: productId }))?.quantity, 5);
  assert.equal(await releaseOrderInventory(app, order!, "duplicate"), false);
  assert.equal((await collections.productCollection.findOne({ _id: productId }))?.quantity, 5);

  console.log("Order lifecycle tests passed");
};

void run();
