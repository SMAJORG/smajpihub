import { Request, Response } from "express";
import env from "../environments";
import { resolveCurrentUser } from "../services/auth";
import { makeTestnetSdk, PayoutError, sendTestnetPayout, verifyTestnetRecipient } from "../services/testnetA2U";

export async function testnetA2UHandler(req: Request, res: Response) {
  try {
    // Require an explicit bearer credential in addition to the existing admin middleware.
    // Cookie-only requests cannot initiate a payout.
    if (!/^Bearer\s+\S+$/i.test(req.get("authorization") || "")) return res.status(401).json({ message: "Admin bearer authentication required." });
    const admin = await resolveCurrentUser(req);
    if (!admin) return res.status(401).json({ message: "Authentication required." });
    const configuredAdmin = [admin.username, (admin as any).piUsername].some(value => env.admin_pi_usernames.includes(String(value || "").trim().replace(/^@+/, "").toLowerCase()));
    if (admin.role !== "admin" && !configuredAdmin) return res.status(403).json({ message: "Admin access required." });
    const uid = req.body?.uid;
    if (typeof uid !== "string" || !/^[a-zA-Z0-9_-]{1,200}$/.test(uid) || Object.keys(req.body).some(key => key !== "uid")) {
      return res.status(400).json({ message: "Supply only a verified Pi user uid; amount is fixed at 0.01 Test-Pi." });
    }
    const collection = req.app.locals.testnetA2UCollection;
    if (!collection) return res.status(503).json({ message: "Payout database unavailable." });
    const recipient = await req.app.locals.userCollection.findOne({ uid });
    if (!await verifyTestnetRecipient(recipient)) return res.status(422).json({ message: "Recipient must have a currently verified Pi login." });
    const payout = await sendTestnetPayout(collection, uid, admin.uid, makeTestnetSdk());
    return res.status(200).json({ payout });
  } catch (error) {
    return res.status(error instanceof PayoutError ? error.status : 503).json({ message: error instanceof PayoutError ? error.message : "Testnet payout unavailable." });
  }
}
