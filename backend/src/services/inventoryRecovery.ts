import { financialTransaction } from "./financialIntegrity";
import { releaseOrderInventory } from "./orderLifecycle";
export const expireUnfundedReservations = async (app: any) => {
  const due = await app.locals.marketplaceOrderCollection
    .find({
      status: "pending",
      paymentId: null,
      reservationExpiresAt: { $lte: new Date() },
      inventoryReleased: false,
    })
    .limit(50)
    .toArray();
  for (const order of due)
    await financialTransaction(app, async (session) => {
      const options = session ? { session } : {};
      const changed = await app.locals.marketplaceOrderCollection.updateOne(
        {
          _id: order._id,
          status: "pending",
          paymentId: null,
          inventoryReleased: false,
        },
        { $set: { status: "cancelled", updatedAt: new Date() } },
        options,
      );
      if (changed.modifiedCount)
        await releaseOrderInventory(app, order, "reservation_expired", session);
    });
};
