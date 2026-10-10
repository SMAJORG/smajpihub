import { Request, Response, Router } from "express";
import { ObjectId } from "mongodb";
import { resolveCurrentUser } from "../services/auth";
import { platformAPIKeyClient } from "../services/platformAPIClient";
import { completeStorePayment } from "../services/storePayments";
import { createNotification } from "../services/notifications";

const timelineEntry = (status: string, label: string, note?: string) => ({
  status,
  label,
  note,
  at: new Date().toISOString(),
});

const requireUser = async (req: Request, res: Response) => {
  const currentUser = await resolveCurrentUser(req);
  if (!currentUser) {
    res.status(401).json({ error: "unauthorized", message: "User needs to sign in first" });
    return null;
  }
  return currentUser;
};

const findBuyerOrder = async (req: Request, res: Response, orderId: string) => {
  const user = await requireUser(req, res);
  if (!user) return null;
  if (!ObjectId.isValid(orderId)) {
    res.status(400).json({ error: "bad_request", message: "Invalid order id" });
    return null;
  }
  const order = await req.app.locals.marketplaceOrderCollection.findOne({ _id: new ObjectId(orderId), buyerId: user.uid });
  if (!order) {
    res.status(404).json({ error: "not_found", message: "Order not found" });
    return null;
  }
  return order;
};

// Express 4 does not forward rejected async handlers to its error middleware.
const paymentRoute = (handler: (req: Request, res: Response) => Promise<unknown>) =>
  async (req: Request, res: Response) => {
    try {
      return await handler(req, res);
    } catch (error) {
      const failure = error as { code?: string; response?: { status?: number } };
      const upstreamStatus = failure.response?.status;
      const retryable = !upstreamStatus || upstreamStatus === 429 || upstreamStatus >= 500;
      console.error("[pi-payment] request failed", { path: req.path, upstreamStatus, code: failure.code });
      if (res.headersSent) return;
      return res.status(502).json({
        error: "payment_upstream_error",
        retryable,
        message: retryable
          ? "Payment confirmation is temporarily unavailable. Retry confirmation of this payment."
          : "Pi rejected the server payment request. Contact support to check the app payment configuration.",
      });
    }
  };

export default function mountPaymentsEndpoints(router: Router) {
  router.get("/", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    const orders = await req.app.locals.marketplaceOrderCollection
      .find({ $or: [{ buyerId: user.uid }, { sellerId: user.uid }] })
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(100)
      .toArray();
    const payments = orders
      .filter((order: any) => order.paymentId || order.paymentStatus || ["paid", "processing", "shipped", "delivered", "completed"].includes(order.status))
      .map((order: any) => ({
        orderId: order._id.toString(),
        productTitle: order.productTitle,
        productImage: order.productImage || "",
        amountPi: Number(order.pricePi) || 0,
        paymentId: order.paymentId || "",
        txid: order.paymentTxid || "",
        status: order.paymentStatus || (order.status === "paid" ? "paid" : order.status === "pending" ? "pending" : order.status),
        orderStatus: order.status,
        role: order.buyerId === user.uid ? "buyer" : "seller",
        createdAt: order.createdAt,
        updatedAt: order.updatedAt || order.paidAt || order.createdAt,
        paidAt: order.paidAt || null,
      }));
    const summary = payments.reduce((totals: any, payment: any) => {
      totals.total += payment.amountPi;
      if (payment.status === "paid" || payment.orderStatus === "paid" || payment.paidAt) totals.paid += payment.amountPi;
      else if (payment.status === "processing" || payment.status === "pending") totals.pending += payment.amountPi;
      else if (payment.status === "cancelled") totals.cancelled += payment.amountPi;
      return totals;
    }, { total: 0, paid: 0, pending: 0, cancelled: 0 });
    return res.status(200).json({ payments, summary, serverTime: new Date().toISOString() });
  });

  router.post("/incomplete", paymentRoute(async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    const paymentId = String(req.body?.paymentId || "");
    if (!/^[a-z0-9_-]{1,200}$/i.test(paymentId)) return res.status(400).json({ message: "Invalid Pi payment identifier." });
    const { data: payment } = await platformAPIKeyClient.get("/v2/payments/" + encodeURIComponent(paymentId));
    if (payment.user_uid !== user.uid) return res.status(403).json({ message: "This Pi payment belongs to a different account." });
    const orderId = String(payment.metadata?.orderId || "");
    if (!ObjectId.isValid(orderId)) return res.status(409).json({ message: "This pending payment belongs to another service. Open that service to finish it before paying for a Store order." });
    const txid = payment.transaction?.txid || req.body?.txid;
    if (typeof txid !== "string" || !txid) return res.status(409).json({ message: "Pi has not recorded a transaction for this payment yet. Check Pi Wallet before retrying." });
    req.body = { paymentId, orderId, txid };
    return await completePayment(req, res, true, payment);
  }));

  router.post("/approve", paymentRoute(async (req, res) => {
    const { paymentId, orderId } = req.body || {};
    if (!paymentId || !orderId) {
      return res.status(400).json({ error: "bad_request", message: "Missing paymentId or orderId." });
    }

    const order = await findBuyerOrder(req, res, String(orderId));
    if (!order) return;
    if (order.status !== "pending") {
      return res.status(400).json({ error: "bad_request", message: "Only pending orders can be approved for payment." });
    }

    const savedPayment = await req.app.locals.marketplaceOrderCollection.updateOne(
      { _id: order._id, buyerId: order.buyerId, status: "pending" },
      {
        $set: {
          paymentId,
          paymentStatus: "processing",
          paymentRecoveryState: "pending",
          paymentRecoveryCheckedAt: null,
          paymentRecoveryNextCheckAt: new Date(0),
          updatedAt: new Date(),
          timeline: [
            ...(Array.isArray(order.timeline) ? order.timeline : []),
            timelineEntry("payment_processing", "Payment Processing", "Pi payment was approved and is waiting for confirmation."),
          ],
        },
      }
    );

    if (!savedPayment.matchedCount) return res.status(409).json({ message: "The order changed before payment approval. Refresh and try again." });

    // Persist the payment identifier before Pi lets the wallet submit funds.
    await platformAPIKeyClient.post(`/v2/payments/${paymentId}/approve`);

    void createNotification(req.app, {
      userId: order.buyerId,
      type: "payment_processing",
      title: "Payment pending confirmation",
      message: `${order.productTitle} payment is approved and waiting for confirmation.`,
      relatedId: order._id.toString(),
      image: order.productImage,
    });

    return res.status(200).json({ message: "Payment approved.", paymentId });
  }));

  const completePayment = async (req: Request, res: Response, recovering = false, recoveredPayment?: any) => {
    if (!req.body?.paymentId || !req.body?.orderId || !req.body?.txid) return res.status(400).json({ error: "bad_request", message: "Missing paymentId, orderId, or txid." });
    const user = await requireUser(req, res);
    if (!user) return;
    const result = await completeStorePayment(req.app, user.uid, req.body || {}, recovering, recoveredPayment);
    return res.status(result.status).json(result.body);
  };
  router.post("/complete", paymentRoute((req, res) => completePayment(req, res)));

  router.post("/cancelled_payment", async (req, res) => {
    const { paymentId, orderId } = req.body || {};
    if (!paymentId || !orderId) {
      return res.status(400).json({ error: "bad_request", message: "Missing paymentId or orderId." });
    }

    const order = await findBuyerOrder(req, res, String(orderId));
    if (!order) return;

    await req.app.locals.marketplaceOrderCollection.updateOne(
      { _id: order._id },
      {
        $set: {
          paymentId,
          paymentStatus: "cancelled",
          updatedAt: new Date(),
          timeline: [
            ...(Array.isArray(order.timeline) ? order.timeline : []),
            timelineEntry("cancelled", "Payment Cancelled", "Pi payment was cancelled."),
          ],
        },
      }
    );

    await createNotification(req.app, {
      userId: order.buyerId,
      type: "payment_cancelled",
      title: "Payment cancelled",
      message: `${order.productTitle} payment was cancelled.`,
      relatedId: order._id.toString(),
      image: order.productImage,
    });

    return res.status(200).json({ message: "Payment cancelled." });
  });

  router.post("/failed", async (req, res) => {
    const { paymentId, orderId } = req.body || {};
    if (!paymentId || !orderId) {
      return res.status(400).json({ error: "bad_request", message: "Missing paymentId or orderId." });
    }

    const order = await findBuyerOrder(req, res, String(orderId));
    if (!order) return;

    await req.app.locals.marketplaceOrderCollection.updateOne(
      { _id: order._id },
      {
        $set: {
          paymentId,
          paymentStatus: "failed",
          updatedAt: new Date(),
          timeline: [
            ...(Array.isArray(order.timeline) ? order.timeline : []),
            timelineEntry("failed", "Payment Failed", "Pi payment failed. Please try again."),
          ],
        },
      }
    );

    await createNotification(req.app, {
      userId: order.buyerId,
      type: "payment_failed",
      title: "Payment failed",
      message: `${order.productTitle} payment failed. Please try again.`,
      relatedId: order._id.toString(),
      image: order.productImage,
    });

    return res.status(200).json({ message: "Payment failed. Order remains pending." });
  });
}
