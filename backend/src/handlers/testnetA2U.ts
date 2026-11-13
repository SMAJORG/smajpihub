import { payoutPage, testnetDashboard, testnetRecipients } from "../services/testnetA2UDashboard";
import { Request, Response } from "express";
import env from "../environments";
import { resolveHubAccessUser } from "../services/persistentSessions";
import { testnetA2UPreflight } from "../services/testnetA2UPreflight";
import { makeTestnetSdk, PayoutError, sendTestnetPayout, verifyTestnetRecipient } from "../services/testnetA2U";

async function requirePayoutAdmin(req: Request, res: Response) {
  res.setHeader("Cache-Control", "no-store");
  const token = req.get("authorization")?.match(/^Bearer (hub_access\.[^\s]+)$/i)?.[1];
  if (!token) { res.status(401).json({ message: "A valid admin Hub bearer token is required; cookies are not sufficient." }); return null; }
  // Validate this credential directly, independently of the shared cookie/session cache.
  const admin = await resolveHubAccessUser(req, token);
  if (!admin) { res.status(401).json({ message: "Admin bearer token is invalid, expired or revoked." }); return null; }
  const configuredAdmin = [admin.username, admin.piUsername].some(value => env.admin_pi_usernames.includes(String(value || "").trim().replace(/^@+/, "").toLowerCase()));
  if (admin.role !== "admin" && !configuredAdmin) { res.status(403).json({ message: "Admin access required." }); return null; }
  return admin;
}
const validUid = (uid: unknown): uid is string => typeof uid === "string" && /^[a-zA-Z0-9_-]{1,200}$/.test(uid);
const fail = (res: Response, error: unknown) => res.status(error instanceof PayoutError ? error.status : 503).json({ message: error instanceof PayoutError ? error.message : "Testnet payout unavailable." });

export async function testnetA2UPreflightHandler(req: Request, res: Response) {
  try {
    if (!await requirePayoutAdmin(req, res)) return;
    const uid = req.query.uid;
    if (!validUid(uid)) return res.status(400).json({ message: "Supply a verified recipient uid." });
    return res.json(await testnetA2UPreflight(req.app.locals, uid));
  } catch (error) { return fail(res, error); }
}

export async function testnetA2UHandler(req: Request, res: Response) {
  try {
    const admin = await requirePayoutAdmin(req, res);
    if (!admin) return;
    const uid = req.body?.uid;
    const confirmed = { recipientWalletAddress: req.body?.recipientWalletAddress, senderWalletAddress: req.body?.senderWalletAddress };
    if (!validUid(uid) || Object.keys(req.body).some(key => !["uid", "recipientWalletAddress", "senderWalletAddress"].includes(key)) || Object.values(confirmed).some(address => address !== undefined && (typeof address !== "string" || !/^G[A-Z2-7]{55}$/.test(address)))) {
      return res.status(400).json({ message: "Supply a verified Pi user uid and optional confirmed wallet addresses; amount is fixed at 0.01 Test-Pi." });
    }
    const collection = req.app.locals.testnetA2UCollection;
    if (!collection) return res.status(503).json({ message: "Payout database unavailable." });
    // Preserve idempotent completed responses, but verify current recipient identity first.
    const recipient = await req.app.locals.userCollection.findOne({ uid });
    if (!await verifyTestnetRecipient(recipient)) return res.status(422).json({ message: "Recipient must have a currently verified Pi login." });
    const existing = await collection.findOne({ _id: `recipient:${uid}` });
    if (existing?.status !== "completed") {
      const preflight = await testnetA2UPreflight(req.app.locals, uid);
      if ((confirmed.recipientWalletAddress && confirmed.recipientWalletAddress !== preflight.recipientWalletAddress) || (confirmed.senderWalletAddress && confirmed.senderWalletAddress !== preflight.senderWalletAddress)) {
        return res.status(409).json({ message: "A wallet address changed. Refresh and select the recipient again before confirming." });
      }
      confirmed.recipientWalletAddress = preflight.recipientWalletAddress;
      confirmed.senderWalletAddress = preflight.senderWalletAddress;
    }
    const payout = await sendTestnetPayout(collection, uid, admin.uid, makeTestnetSdk(), confirmed);
    return res.status(200).json({ payout });
  } catch (error) { return fail(res, error); }
}

export async function testnetDashboardHandler(req: Request, res: Response) {
  try {
    if (!await requirePayoutAdmin(req, res)) return;
    return res.json(await testnetDashboard(req.app.locals, payoutPage(req.query.page)));
  } catch (error) { return fail(res, error); }
}
export async function testnetRecipientsHandler(req: Request, res: Response) {
  try {
    if (!await requirePayoutAdmin(req, res)) return;
    return res.json(await testnetRecipients(req.app.locals, payoutPage(req.query.page), String(req.query.search || "").trim().slice(0, 80)));
  } catch (error) { return fail(res, error); }
}
