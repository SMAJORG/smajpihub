import { Router } from "express";
import { verificationStatuses } from "../services/smajVerification";

export default function mountSmajVerification(router: Router) {
  router.post("/verification-status", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const ids = req.body?.userIds;
    if (!Array.isArray(ids) || !ids.length || ids.length > 100 || ids.some(id => typeof id !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(id))) {
      return res.status(400).json({ message: "Provide 1 to 100 account identifiers." });
    }
    try { return res.json({ statuses: await verificationStatuses(req.app.locals.userCollection, [...new Set<string>(ids)]) }); }
    catch { return res.status(503).json({ message: "Verification status is temporarily unavailable." }); }
  });
}
