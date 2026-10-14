import { ObjectId } from "mongodb";
import {
  bindPayment,
  financialError,
  financialTransaction,
  verifyOutboundPayment,
} from "./financialIntegrity";
export const recordMerchantSettlement = async (
  app: any,
  orderId: string,
  paymentId: string,
) => {
  if (!ObjectId.isValid(orderId)) throw financialError("Invalid order", 400);
  const order = await app.locals.marketplaceOrderCollection.findOne({
    _id: new ObjectId(orderId),
  });
  if (
    !order ||
    order.paymentStatus !== "paid" ||
    order.status !== "completed" ||
    order.disputeStatus === "open" ||
    order.disputeStatus === "under_review" ||
    order.refundStatus === "requested" ||
    order.refundStatus === "manual_required" ||
    order.refundStatus === "completed"
  )
    throw financialError(
      "Settlement is held pending fulfillment or resolution",
    );
  const payment = await verifyOutboundPayment(paymentId, {
    uid: order.sellerId,
    amount: Number(order.pricePi),
    metadataKey: "orderId",
    intentId: orderId,
  });
  return financialTransaction(app, async (session) => {
    const options = session ? { session } : {};
    const current = await app.locals.marketplaceOrderCollection.findOne(
      { _id: order._id },
      options,
    );
    if (
      current.status !== "completed" ||
      current.paymentStatus !== "paid" ||
      ["open", "under_review"].includes(current.disputeStatus) ||
      ["requested", "approved", "manual_required", "completed"].includes(
        current.refundStatus,
      )
    )
      throw financialError("Order changed; settlement held");
    const payable = await app.locals.settlementCollection.findOne(
      { _id: "store:" + orderId },
      options,
    );
    if (
      !payable ||
      payable.amountPi !== payment.amount ||
      payable.sellerUid !== payment.user_uid
    )
      throw financialError(
        "Payable missing or mismatched; reconciliation required",
      );
    if (payable.status === "settled") {
      if (payable.paymentId !== paymentId)
        throw financialError("Already settled with another transfer");
      return payable;
    }
    if (payable.status !== "held")
      throw financialError("Payable is not eligible for settlement");
    await bindPayment(app, payment, "settlement:" + orderId, session);
    await app.locals.settlementCollection.updateOne(
      { _id: payable._id, status: "held" },
      {
        $set: {
          status: "settled",
          paymentId,
          txid: payment.transaction.txid,
          recipientAddress: payment.to_address,
          verifiedAt: new Date(),
        },
      },
      options,
    );
    // Write the order too so refund/dispute changes serialize against settlement.
    await app.locals.marketplaceOrderCollection.updateOne(
      { _id: order._id },
      { $set: { settlementStatus: "settled", settlementPaymentId: paymentId } },
      options,
    );
    return { status: "settled", paymentId, txid: payment.transaction.txid };
  });
};
