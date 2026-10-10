import { ObjectId } from "mongodb";
import { platformAPIKeyClient } from "./platformAPIClient";
import { createNotification } from "./notifications";

const timelineEntry = (status: string, label: string, note?: string) => ({ status, label, note, at: new Date().toISOString() });
const reply = (status: number, body: Record<string, unknown>) => ({ status, body });

export const completeStorePayment = async (
  app: any, buyerUid: string, input: { paymentId?: string; orderId?: string; txid?: string },
  recovering = false, recoveredPayment?: any
) => {
    const { paymentId, orderId, txid } = input;
    if (!paymentId || !orderId || !txid) {
      return reply(400, { error: "bad_request", message: "Missing paymentId, orderId, or txid." });
    }

    if (!ObjectId.isValid(String(orderId))) return reply(400, { error: "bad_request", message: "Invalid order id" });
    const order = await app.locals.marketplaceOrderCollection.findOne({ _id: new ObjectId(String(orderId)), buyerId: buyerUid });
    if (!order) return reply(404, { error: "not_found", message: "Order not found" });
    const alreadyRecorded = order.paymentStatus === "paid" && order.paymentId === paymentId && order.paymentTxid === txid;
    if (alreadyRecorded && !recovering) {
      return reply(200, { message: "Payment already completed.", orderId: order._id.toString(), paymentId, txid });
    }
    if (!recovering && order.status !== "pending") {
      return reply(400, { error: "bad_request", message: "Only pending orders can be completed with payment." });
    }
    const payment = recoveredPayment || (await platformAPIKeyClient.get(`/v2/payments/${paymentId}`)).data;
    const mismatch = (candidate: any) => {
      if (candidate?.identifier !== paymentId) return "Pi returned a different payment identifier.";
      if (candidate.direction !== "user_to_app") return "This is not a payment to this app.";
      if (candidate.user_uid !== order.buyerId) return "This payment belongs to a different Pi account.";
      if (String(candidate.metadata?.orderId || "") !== order._id.toString()) return "This payment belongs to a different order. Resume its original order.";
      if (!Number.isFinite(Number(order.pricePi)) || Number(order.pricePi) <= 0) return "This order has no valid Pi payment price. Refresh the order or contact support.";
      if (!Number.isFinite(Number(candidate.amount)) || Number(candidate.amount) <= 0 || (!recovering && Math.round(Number(candidate.amount) * 1e7) !== Math.round(Number(order.pricePi) * 1e7))) return "The Pi payment amount differs from this order's total. Check the original order before paying again.";
      if (candidate.transaction?.txid && candidate.transaction.txid !== txid) return "The transaction hash differs from the transaction recorded by Pi.";
      if (candidate.status?.cancelled || candidate.status?.user_cancelled) return "Pi reports that this payment was cancelled.";
      return null;
    };
    const problem = mismatch(payment);
    if (problem) return reply(400, { error: "payment_mismatch", message: problem });

    // /complete validates the SDK hash at Pi; an earlier GET can lack transaction data.
    const completed = payment.status?.developer_completed === true ? payment :
      (await platformAPIKeyClient.post(`/v2/payments/${paymentId}/complete`, { txid })).data;
    const confirmed = completed?.identifier ? completed : (await platformAPIKeyClient.get(`/v2/payments/${paymentId}`)).data;
    const confirmedProblem = mismatch(confirmed);
    if (confirmedProblem) return reply(400, { error: "payment_mismatch", message: confirmedProblem });
    if (confirmed.transaction?.txid !== txid || confirmed.transaction?.verified !== true || confirmed.status?.transaction_verified !== true || confirmed.status?.developer_completed !== true) {
      return reply(409, { error: "verification_pending", message: "Pi has not confirmed completion yet. Check Pi Wallet and retry Continue Payment; do not make another payment." });
    }

    // Acknowledge the verified transfer without crediting a mismatched order.
    if (recovering && Math.round(Number(confirmed.amount) * 1e7) !== Math.round(Number(order.pricePi) * 1e7)) {
      await app.locals.marketplaceOrderCollection.updateOne(
        { _id: order._id },
        { $addToSet: { paymentReconciliation: { paymentId, txid, amountPi: Number(confirmed.amount), reason: "amount_mismatch" } } }
      );
      return reply(200, { message: "Previous transfer acknowledged and recorded for reconciliation.", orderId: "", originalOrderId: order._id.toString(), paymentId, txid, requiresReconciliation: true });
    }

    // Recovery acknowledges the existing transfer without undoing fulfillment or cancellation.
    if (alreadyRecorded) return reply(200, { message: "Payment recovered.", orderId: order._id.toString(), paymentId, txid });
    if (order.paymentStatus === "paid" && (order.paymentId || order.paymentTxid)) return reply(409, { message: "Pi payment completed, but this order records another payment. Contact support to reconcile the extra transfer." });
    const recorded = await app.locals.marketplaceOrderCollection.updateOne(
      { _id: order._id, status: order.status, paymentStatus: order.paymentStatus },
      {
        $set: {
          status: order.status === "pending" ? "paid" : order.status,
          paymentStatus: "paid",
          paymentRecoveryState: "completed",
          paymentRecoveryError: null,
          paymentId,
          paymentTxid: txid,
          paidAt: order.paidAt || new Date(),
          updatedAt: new Date(),
          timeline: [
            ...(Array.isArray(order.timeline) ? order.timeline : []),
            timelineEntry("paid", "Paid", "Pi payment confirmed."),
          ],
        },
      }
    );

    if (recorded.matchedCount === 0) {
      const current = await app.locals.marketplaceOrderCollection.findOne({ _id: order._id, buyerId: buyerUid });
      if (current?.paymentStatus === "paid" && current.paymentId === paymentId && current.paymentTxid === txid)
        return reply(200, { message: "Payment already completed.", orderId: order._id.toString(), paymentId, txid });
      return reply(409, { message: "Pi payment completed, but the order changed. Refresh and retry; do not make another payment." });
    }

    // Push delivery must not hold the wallet completion response open.
    void Promise.allSettled([
      createNotification(app, {
        userId: order.buyerId,
        type: "payment_successful",
        title: "Payment successful",
        message: `${order.productTitle} payment was confirmed successfully.`,
        relatedId: order._id.toString(),
        image: order.productImage,
      }),
      createNotification(app, {
        userId: order.sellerId,
        type: "payment_received",
        title: "Payment received",
        message: `${order.buyerName} paid for ${order.productTitle}.`,
        relatedId: order._id.toString(),
        image: order.productImage,
      }),
    ]);

    return reply(200, { message: "Payment completed.", orderId: order._id.toString(), paymentId, txid });
};
