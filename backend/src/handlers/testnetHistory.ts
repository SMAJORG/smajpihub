import { Router } from "express";
import { resolveCurrentUser } from "../services/auth";

const sources: Record<string, { collection: string; fields: string[] }> = {
  orders: { collection: "orders", fields: ["buyerId", "sellerId"] },
  products: { collection: "products", fields: ["sellerId"] },
  jobs: { collection: "job_billing", fields: ["employerId"] },
  education: { collection: "course_payments", fields: ["user_id"] },
  university: { collection: "university_payments", fields: ["user_id"] },
  transport: { collection: "transport_bookings", fields: ["userId"] },
};
export default function mountTestnetHistory(router: Router) {
  router.all("/:source", async (req, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.setHeader("Allow", "GET, HEAD");
      return res.status(405).json({ error: "history_read_only" });
    }
    try {
      const user = await resolveCurrentUser(req);
      if (!user) return res.status(401).json({ error: "unauthorized" });
      const source = sources[req.params.source];
      if (!source) return res.status(404).json({ error: "not_found" });
      const db = req.app.locals.testnetHistoryDb;
      if (!db) return res.status(503).json({ error: "history_unavailable" });
      const offset = Number(req.query.offset || 0);
      if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100000) return res.status(400).json({ error: "invalid_page" });
      const identities = [user.uid, String(user._id)];
      const rows = await db.collection(source.collection).find({ $or: source.fields.map(field => ({ [field]: { $in: identities } })) }, {
        projection: { _id: 1, productTitle: 1, title: 1, status: 1, paymentStatus: 1, pricePi: 1, priceUsdt: 1, amountPi: 1, amount_pi: 1, createdAt: 1, created_at: 1, paidAt: 1, paymentId: 1, paymentTxid: 1 },
      }).sort({ _id: -1 }).skip(offset).limit(100).maxTimeMS(8000).toArray();
      return res.json({ network: "Pi Testnet", readOnly: true, offset, records: rows });
    } catch { return res.status(503).json({ error: "history_unavailable" }); }
  });
}
