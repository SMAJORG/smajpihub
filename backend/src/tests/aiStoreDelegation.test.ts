import assert from "node:assert/strict";
import express from "express";
import { createHmac } from "crypto";
import { ObjectId } from "mongodb";
import mountAiDelegationEndpoints from "../handlers/aiDelegation";

const same = (left: any, right: any) => String(left) === String(right);
const matchesValue = (actual: any, expected: any): boolean => {
  if (expected && typeof expected === "object" && !(expected instanceof ObjectId) && !Array.isArray(expected)) {
    return Object.entries(expected).every(([operator, value]) => {
      if (operator === "$ne") return !matchesValue(actual, value);
      if (operator === "$gte") return Number(actual) >= Number(value);
      if (operator === "$lte") return new Date(actual).getTime() <= new Date(value as any).getTime();
      if (operator === "$in") return Array.isArray(value) && value.some(item => matchesValue(actual, item));
      if (operator === "$all") return Array.isArray(actual) && Array.isArray(value) && value.every(item => actual.some((candidate: any) => matchesValue(candidate, item)));
      return false;
    });
  }
  if (Array.isArray(expected)) return Array.isArray(actual) && actual.length === expected.length && actual.every((value, index) => same(value, expected[index]));
  return same(actual, expected);
};
const matches = (document: any, query: any): boolean => Object.entries(query || {}).every(([key, expected]) => {
  if (key === "$or") return (expected as any[]).some(branch => matches(document, branch));
  if (key === "$and") return (expected as any[]).every(branch => matches(document, branch));
  return matchesValue(document[key], expected);
});

const collection = (rows: any[]) => ({
  async findOne(query: any) { return rows.find(row => matches(row, query)) || null; },
  find(query: any) {
    let result = rows.filter(row => matches(row, query));
    const cursor: any = {
      sort(spec: Record<string, number>) {
        const [field, direction] = Object.entries(spec)[0] || ["createdAt", 1];
        result = [...result].sort((a, b) => (new Date(a[field]).getTime() - new Date(b[field]).getTime()) * Number(direction));
        return cursor;
      },
      limit(count: number) { result = result.slice(0, count); return cursor; },
      async toArray() { return result; },
    };
    return cursor;
  },
  async insertOne(document: any) {
    const stored = { ...document, _id: document._id || new ObjectId() };
    if (rows.some(row => same(row._id, stored._id))) throw Object.assign(new Error("duplicate key"), { code: 11000 });
    rows.push(stored);
    return { insertedId: stored._id };
  },
  async updateOne(query: any, update: any, options: any = {}) {
    let row = rows.find(candidate => matches(candidate, query));
    let upsertedCount = 0;
    if (!row && options.upsert) {
      row = { _id: new ObjectId() };
      for (const [key, value] of Object.entries(query || {})) {
        if (!key.startsWith("$") && !(value && typeof value === "object" && Object.keys(value as object).some(part => part.startsWith("$")))) row[key] = value;
      }
      for (const [key, value] of Object.entries(update.$setOnInsert || {})) row[key] = value;
      rows.push(row);
      upsertedCount = 1;
    }
    if (!row) return { matchedCount: 0, modifiedCount: 0, upsertedCount };
    for (const [key, value] of Object.entries(update.$set || {})) row[key] = value;
    if (!upsertedCount) for (const [key, value] of Object.entries(update.$setOnInsert || {})) if (!(key in row)) row[key] = value;
    for (const [key, value] of Object.entries(update.$inc || {})) row[key] = Number(row[key] || 0) + Number(value);
    for (const [key, value] of Object.entries(update.$addToSet || {})) {
      const additions = value && typeof value === "object" && "$each" in (value as object) ? (value as any).$each : [value];
      row[key] ||= [];
      for (const addition of additions) if (!row[key].some((entry: any) => same(entry, addition))) row[key].push(addition);
    }
    for (const [key, value] of Object.entries(update.$pull || {})) {
      const condition: any = value;
      row[key] = (row[key] || []).filter((entry: any) => condition && typeof condition === "object" && "$in" in condition
        ? !condition.$in.some((candidate: any) => same(entry, candidate))
        : !same(entry, value));
    }
    return { matchedCount: upsertedCount ? 0 : 1, modifiedCount: 1, upsertedCount };
  },
});

async function main() {
  const previous = { ...process.env };
  const secret = "store-delegation-test-secret-has-at-least-thirty-two-characters";
  process.env.SMAJ_AI_DELEGATION_SECRET = secret;
  process.env.SMAJ_PRODUCTION_WRITES_ENABLED = "true";
  const buyer = { _id: new ObjectId(), uid: "delegated-buyer", displayName: "Buyer", username: "buyer" };
  const seller = { _id: new ObjectId(), uid: "real-seller", displayName: "Real Seller", username: "seller" };
  const productId = new ObjectId();
  const products = [{ _id: productId, title: "Hub product", sellerId: seller.uid, sellerName: "Outdated seller name", pricePi: 2.5, priceUsdt: 0, quantity: 12, image: "https://hub.example/product.png", category: "Books", active: true, hidden: false, approved: true, reviewStatus: "approved" }];
  const messages: any[] = [];
  const conversations: any[] = [];
  const orders: any[] = [];
  const notifications: any[] = [];
  const app = express();
  app.use(express.json());
  app.locals.memoryDatabase = {};
  app.locals.userCollection = {
    async findOne(query: any) {
      return [buyer, seller].find(user => matches(user, query)) || null;
    },
  };
  app.locals.productCollection = {
    ...collection(products),
    async updateOne(query: any, update: any, options?: any) {
      return collection(products).updateOne(query, update, options);
    },
  };
  app.locals.conversationCollection = collection(conversations);
  app.locals.messageCollection = collection(messages);
  app.locals.marketplaceOrderCollection = collection(orders);
  app.locals.notificationCollection = collection(notifications);
  app.locals.paymentCollection = new Proxy({}, { get() { throw new Error("AI delegation must never access the payment collection"); } });
  const router = express.Router();
  mountAiDelegationEndpoints(router);
  app.use("/ai-delegation", router);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as any).port}/ai-delegation`;

  const claimsFor = (operation: string, action: any, overrides: Record<string, unknown> = {}) => ({
    aud: "smaj-hub-delegation",
    operation,
    exp: Math.floor(Date.now() / 1000) + 60,
    sub: String(buyer._id),
    uid: buyer.uid,
    contractId: "approved-store-contract",
    approvedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    bindingConfirmed: true,
    action,
    ...overrides,
  });
  const post = (claims: any, operation = claims.operation, signed = true) => {
    const encoded = Buffer.from(JSON.stringify(claims)).toString("base64url");
    const signature = createHmac("sha256", secret).update(encoded).digest("base64url");
    return fetch(`${base}/${operation}`, {
      method: "POST",
      headers: { ...(signed ? { "X-SMAJ-Delegation": `${encoded}.${signature}` } : {}) },
    });
  };
  const prepare = async (action: any) => {
    const response = await post(claimsFor("prepare", action));
    assert.equal(response.status, 200);
    const body = await response.json() as any;
    assert.deepEqual(Object.keys(body), ["preview"]);
    assert.deepEqual(Object.keys(body.preview), ["product"]);
    assert.deepEqual(Object.keys(body.preview.product), ["recordId", "title", "sellerName", "pricePi", "quantityAvailable"]);
    assert.equal(body.preview.product.sellerName, seller.displayName);
    return body.preview;
  };
  const approved = (operation: string, action: any, preview: any, overrides: Record<string, unknown> = {}) =>
    claimsFor(operation, { ...action, storePreview: preview }, overrides);

  try {
    const contact = { id: "contact-action-1", serviceId: "store", kind: "contact_seller", recordId: String(productId), message: "  Is this item available?  " };
    const contactPreview = await prepare(contact);
    assert.equal(messages.length, 0);
    assert.equal(conversations.length, 0);
    assert.equal(notifications.length, 0);

    assert.equal((await post(claimsFor("execute", contact), "execute", false)).status, 401);
    assert.equal((await post({ ...approved("execute", contact, contactPreview), sub: String(new ObjectId()) })).status, 403);
    assert.equal((await post(approved("execute", contact, contactPreview, { bindingConfirmed: false }))).status, 401);
    assert.equal((await post(approved("execute", contact, contactPreview, { approvedAt: "not-a-date" }))).status, 401);
    assert.equal(messages.length, 0);

    const sentResponse = await post(approved("execute", contact, contactPreview));
    assert.equal(sentResponse.status, 200);
    const sent = (await sentResponse.json() as any).evidence;
    assert.equal(sent.status, "sent");
    assert.equal(sent.messageId, sent.backendId);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].message, contact.message);
    assert.equal(messages[0].senderId, buyer.uid);
    assert.equal(conversations[0].sellerId, seller.uid);
    assert.equal(notifications.length, 1);
    assert.equal(notifications[0].userId, seller.uid);
    assert.equal(notifications[0].type, "new_message");
    products[0].active = false;
    assert.equal((await post(approved("execute", contact, contactPreview))).status, 200);
    products[0].active = true;
    assert.equal((await post(approved("execute", { ...contact, message: "A different message" }, contactPreview))).status, 409);
    assert.equal(messages.length, 1);
    assert.equal(notifications.length, 1);

    for (let index = 0; index < 55; index++) {
      await app.locals.messageCollection.insertOne({
        _id: new ObjectId(),
        conversationId: sent.conversationId,
        senderId: seller.uid,
        senderName: seller.displayName,
        message: `Seller reply ${index}`,
        messageType: "text",
        createdAt: new Date(Date.now() + index + 1),
      });
    }
    products[0].active = false;
    products[0].pricePi = 9;
    const contactVerifiedResponse = await post(approved("verify", contact, contactPreview));
    assert.equal(contactVerifiedResponse.status, 200);
    products[0].active = true;
    products[0].pricePi = 2.5;
    const contactVerified = (await contactVerifiedResponse.json() as any).evidence;
    assert.equal(contactVerified.messages.length, 50);
    assert.equal(contactVerified.messages[0].message, "Seller reply 5");
    assert.equal(contactVerified.messages[49].message, "Seller reply 54");
    assert.ok(contactVerified.messages.every((message: any) => [buyer.uid, seller.uid].includes(message.senderId)));
    assert.deepEqual(contactVerified.messages.map((message: any) => new Date(message.createdAt).getTime()), [...contactVerified.messages.map((message: any) => new Date(message.createdAt).getTime())].sort((a: number, b: number) => a - b));
    conversations[0].participants.push("unrelated-user");
    assert.equal((await post(approved("verify", contact, contactPreview))).status, 409);
    conversations[0].participants.pop();

    products[0].quantity = 3;
    const orderAction = { id: "order-action-1", serviceId: "store", kind: "create_order", recordId: String(productId), quantity: 3 };
    const orderPreview = await prepare(orderAction);
    assert.equal(products[0].quantity, 3);
    assert.equal(orders.length, 0);
    products[0].quantity = 4;
    assert.equal((await post(approved("execute", { ...orderAction, quantity: 4 }, orderPreview))).status, 409);
    products[0].quantity = 3;
    products[0].pricePi = 2.6;
    assert.equal((await post(approved("execute", orderAction, orderPreview))).status, 409);
    products[0].pricePi = 2.5;
    const orderClaims = approved("execute", orderAction, orderPreview);
    const orderResponse = await post(orderClaims);
    assert.equal(orderResponse.status, 200);
    const orderEvidence = (await orderResponse.json() as any).evidence;
    assert.equal(orderEvidence.status, "pending");
    assert.equal(orderEvidence.paymentStatus, "pending");
    assert.equal(orderEvidence.quantity, 3);
    assert.equal(orderEvidence.unitPricePi, 2.5);
    assert.equal(orderEvidence.totalPricePi, 7.5);
    assert.equal(products[0].quantity, 0);
    assert.equal(orders.length, 1);
    assert.equal(orders[0].paymentId, null);
    assert.equal(orders[0].paymentTxid, null);
    assert.equal(notifications.length, 3);
    assert.equal((await post(orderClaims)).status, 200);
    assert.equal(products[0].quantity, 0);
    assert.equal(orders.length, 1);
    assert.equal((await post(approved("execute", { ...orderAction, quantity: 2 }, orderPreview))).status, 409);
    assert.equal(products[0].quantity, 0);
    assert.equal(orders.length, 1);
    const verifiedOrderResponse = await post(approved("verify", orderAction, orderPreview));
    assert.equal(verifiedOrderResponse.status, 200);
    const verifiedOrder = (await verifiedOrderResponse.json() as any).evidence;
    assert.equal(verifiedOrder.orderId, orderEvidence.orderId);
    assert.equal(verifiedOrder.status, "pending");
    assert.equal(verifiedOrder.paymentStatus, "pending");
    assert.equal(verifiedOrder.createdAt, orders[0].createdAt.toISOString());
    orders[0].status = "processing";
    orders[0].paymentStatus = "paid";
    orders[0].paymentId = "owner-payment-id";
    orders[0].paymentTxid = "owner-payment-txid";
    orders[0].inventoryReserved = false;
    orders[0].inventoryReleased = true;
    const refreshedOrderResponse = await post(approved("verify", orderAction, orderPreview));
    assert.equal(refreshedOrderResponse.status, 200);
    const refreshedOrder = (await refreshedOrderResponse.json() as any).evidence;
    assert.equal(refreshedOrder.status, "processing");
    assert.equal(refreshedOrder.paymentStatus, "paid");
    assert.equal("paymentId" in refreshedOrder, false);
    assert.equal("paymentTxid" in refreshedOrder, false);

    const invalidId = { ...contact, id: "invalid-product-action", recordId: "not-an-object-id" };
    assert.equal((await post(claimsFor("prepare", invalidId))).status, 400);
    const selfProduct = { ...products[0], _id: new ObjectId(), sellerId: buyer.uid };
    products.push(selfProduct);
    assert.equal((await post(claimsFor("prepare", { ...contact, id: "self-buy", recordId: String(selfProduct._id) }))).status, 404);
    const unavailable = { ...products[0], _id: new ObjectId(), active: false };
    products.push(unavailable);
    assert.equal((await post(claimsFor("prepare", { ...contact, id: "unpublished", recordId: String(unavailable._id) }))).status, 404);
    products[0].quantity = 2;
    const insufficient = { ...orderAction, id: "insufficient-stock", quantity: 3 };
    assert.equal((await post(claimsFor("prepare", insufficient))).status, 409);
    assert.equal(orders.length, 1);
    console.log("Store AI delegation tests passed: HMAC ownership/approval, exact preview and message, idempotent messaging/notification, truthful seller reply verification, pending stock reservation/idempotency, and invalid product/self-buy/stock checks.");
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    process.env = previous;
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
