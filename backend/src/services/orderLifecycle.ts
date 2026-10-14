import { ClientSession } from "mongodb";
import { financialTransaction } from "./financialIntegrity";
import { ObjectId } from "mongodb";

export const ORDER_STATUSES = ["pending", "paid", "processing", "shipped", "delivered", "completed", "cancelled"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

const transitions: Record<OrderStatus, readonly OrderStatus[]> = {
  pending: ["cancelled"],
  paid: ["processing"],
  processing: ["shipped"],
  shipped: ["delivered", "completed"],
  delivered: ["completed"],
  completed: [],
  cancelled: [],
};

export const canTransitionOrder = (current: string, next: string) =>
  ORDER_STATUSES.includes(current as OrderStatus)
  && ORDER_STATUSES.includes(next as OrderStatus)
  && transitions[current as OrderStatus].includes(next as OrderStatus);

export const releaseOrderInventory = async (app: any, order: Record<string, any>, reason: string, session?: ClientSession): Promise<boolean> => {
  if (!session && app.locals.mongoClient) return financialTransaction(app, tx => releaseOrderInventory(app, order, reason, tx));
  const options = session ? { session } : {};
  if (!order?.inventoryReserved || order.inventoryReleased || !ObjectId.isValid(String(order.productId || ""))) return false;
  const now = new Date();
  const claimed = await app.locals.marketplaceOrderCollection.updateOne(
    { _id: order._id, inventoryReserved: true, inventoryReleased: { $ne: true } },
    { $set: { inventoryReleased: true, inventoryReleasedAt: now, inventoryReleaseReason: reason, updatedAt: now } }, options
  );
  if (!claimed.modifiedCount) return false;
  const restored = await app.locals.productCollection.updateOne(
    { _id: new ObjectId(String(order.productId)) },
    { $inc: { quantity: Math.max(1, Number(order.quantity) || 1) }, $set: { updatedAt: now } }, options
  );
  if (!restored.matchedCount) throw new Error("Inventory product missing; release rolled back");
  return true;
};

export const timelineEntry = (status: string, label: string, note?: string) => ({
  status,
  label,
  note,
  at: new Date().toISOString(),
});
