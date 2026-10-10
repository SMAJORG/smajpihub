import { platformAPIKeyClient } from "./platformAPIClient";
import { completeStorePayment } from "./storePayments";

const activeScans = new WeakSet<object>();

export const recoverPendingStorePayments = async (app: any) => {
  const collection = app.locals.marketplaceOrderCollection;
  if (!collection || activeScans.has(app)) return;
  activeScans.add(app);
  try {
    const orders = await collection.find({
      paymentId: { $type: "string", $ne: "" },
      paymentStatus: "processing",
      paymentRecoveryState: { $nin: ["blocked", "reconciled"] },
      $or: [{ paymentRecoveryNextCheckAt: { $exists: false } }, { paymentRecoveryNextCheckAt: { $lte: new Date() } }],
    }).sort({ paymentRecoveryCheckedAt: 1, updatedAt: -1 }).limit(10).toArray();
    let index = 0;
    await Promise.all(Array.from({ length: 2 }, async () => {
      while (index < orders.length) {
        const order = orders[index++];
        const query = { _id: order._id, paymentId: order.paymentId, paymentStatus: "processing" };
        const record = (fields: Record<string, unknown>) => collection.updateOne(query, {
          $set: { paymentRecoveryCheckedAt: new Date(), paymentRecoveryNextCheckAt: new Date(Date.now() + 5000), ...fields },
        });
        try {
          if (!/^[a-z0-9_-]{1,200}$/i.test(order.paymentId)) {
            await record({ paymentRecoveryState: "blocked", paymentRecoveryError: "Invalid payment identifier" });
            continue;
          }
          const { data: payment } = await platformAPIKeyClient.get(
            "/v2/payments/" + encodeURIComponent(order.paymentId), { timeout: 6000 }
          );
          if (payment.identifier !== order.paymentId || payment.user_uid !== order.buyerId ||
              payment.direction !== "user_to_app" || String(payment.metadata?.orderId || "") !== order._id.toString()) {
            await record({ paymentRecoveryState: "blocked", paymentRecoveryError: "Payment identity does not match this order" });
            continue;
          }
          if (payment.status?.cancelled || payment.status?.user_cancelled) {
            await record({ paymentStatus: "cancelled", paymentRecoveryState: "cancelled" });
            continue;
          }
          if (!payment.transaction?.txid) {
            await record({ paymentRecoveryState: "awaiting_transaction", paymentRecoveryNextCheckAt: new Date(Date.now() + (Date.now() - new Date(order.updatedAt || order.createdAt || 0).getTime() < 600000 ? 5000 : 60000)) });
            continue;
          }
          const result = await completeStorePayment(app, order.buyerId, {
            orderId: order._id.toString(), paymentId: order.paymentId, txid: payment.transaction.txid,
          }, true, payment);
          await record({
            paymentRecoveryState: result.status === 200
              ? (result.body.requiresReconciliation ? "reconciled" : "completed")
              : result.status === 400 || result.status === 404 ? "blocked" : "retry",
            paymentRecoveryError: result.status === 200 ? null : result.body.message,
          });
          if (result.status !== 200) console.warn("[pi-payment-recovery] confirmation pending", { orderId: order._id.toString(), status: result.status, error: result.body.error });
        } catch (error) {
          const failure = error as { code?: string; response?: { status?: number } };
          console.error("[pi-payment-recovery] retrying confirmation", { orderId: order._id.toString(), code: failure.code, upstreamStatus: failure.response?.status });
          await record({ paymentRecoveryState: "retry" }).catch(() => undefined);
        }
      }
    }));
  } catch (error) {
    console.error("[pi-payment-recovery] scan failed", { code: (error as { code?: string }).code });
  } finally {
    activeScans.delete(app);
  }
};

export const startStorePaymentRecovery = (app: any) => {
  app.locals.storePaymentRecoveryStarted = true;
  // Persisted approved payments are scanned on startup and after deployment restarts.
  void recoverPendingStorePayments(app);
  const timer = setInterval(() => { void recoverPendingStorePayments(app); }, 5000);
  timer.unref();
  return () => clearInterval(timer);
};
