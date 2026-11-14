import { recoveryOptions, recoveryIncoming, recoveryAccount, recoveryAppIdentity, recoveryProjection } from "../services/piRecoveryOptions";
import { createHash, randomBytes } from "crypto";
import { ObjectId } from "mongodb";
import type { Request, Response, Router } from "express";
import { resolveCurrentUser } from "../services/auth";
import { getUserPlatformAPIClient } from "../services/platformAPIClient";
import { auditPiAccounts } from "../scripts/auditPiAccounts";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const text = (value: unknown, max = 200) => typeof value === "string" ? value.trim().slice(0, max) : "";
const fail = (message: string, status = 409) => Object.assign(new Error(message), { status });
const dbFor = (req: Request) => {
  const db = req.app.locals.piRecoveryDatabase;
  if (!db) throw fail("Account recovery storage is unavailable.", 503);
  return db;
};
// Snapshots intentionally exclude login timestamps/session counts, which change while
// proving ownership. Profiles, identity diagnostics and business history are reviewed.
const fingerprint = (report: any) => hash(JSON.stringify({ database: report.database,
  accounts: report.accounts.map((row: any) => ({ ...row, lastSeenAt: undefined, lastPiLogin: undefined,
    referenceCounts: { ...row.referenceCounts, deviceSessions: undefined } })).sort((a: any, b: any) => a.accountId.localeCompare(b.accountId)),
  links: report.approvedIdentityBindings,
}));
const inspect = async (req: Request, originalUid: string, incomingUid: string, username?: string) => {
  const report = await auditPiAccounts(dbFor(req), [originalUid, incomingUid].filter(Boolean), username || undefined);
  return { ...report, reviewHash: fingerprint(report) };
};
const selectionReport = async (req: Request, canonicalUserId: string, incomingIdentityId: string) => {
  if (!/^[a-f0-9]{24}$/.test(canonicalUserId)) throw fail("Select the original account from the saved account list.", 400);
  const db = dbFor(req);
  const [original, incoming] = await Promise.all([
    db.collection("users").findOne({ _id: new ObjectId(canonicalUserId) }, { projection: recoveryProjection }),
    recoveryIncoming(db, incomingIdentityId),
  ]);
  if (!original?.uid || original.blocked || !incoming || original.uid === incoming.uid) throw fail("Select an available original account and a different Pi-verified incoming identity.");
  const [report, originalAppIdentity, incomingAppIdentity] = await Promise.all([
    inspect(req, original.uid, incoming.uid),
    recoveryAppIdentity(db, original.uid, original),
    recoveryAppIdentity(db, incoming.uid, { lastPiLogin: { verifiedUid: incoming.uid, at: incoming.verifiedAt, configuredAppId: incoming.configuredAppId } }),
  ]);
  const selection = { original: { ...recoveryAccount(original), appIdentity: originalAppIdentity }, incoming: { ...incoming, appIdentity: incomingAppIdentity } };
  return { ...report, selection, reviewHash: hash(JSON.stringify([report.reviewHash, canonicalUserId, incomingIdentityId, originalAppIdentity.appId, incomingAppIdentity.appId])) };
};
const safeRequest = (row: any) => ({ id: String(row._id), canonicalUserId: row.canonicalUserId, canonicalUid: row.canonicalUid,
  incomingUid: row.incomingUid, originalAppId: row.originalAppId, incomingAppId: row.incomingAppId,
  incomingIdentityId: row.incomingIdentityId || null, selectionVersion: row.selectionVersion || 1,
  originalAppIdentity: row.originalAppIdentity || null, incomingAppIdentity: row.incomingAppIdentity || null,
  status: row.status, createdAt: row.createdAt, expiresAt: row.expiresAt, approvedAt: row.approvedAt,
  originalVerifiedAt: row.proofs?.original?.verifiedAt, incomingVerifiedAt: row.proofs?.incoming?.verifiedAt,
  reviewedDuplicateAccountIds: row.reviewedDuplicateAccountIds,
});

// Mounted only AFTER the existing admin-auth middleware. All writes are additive
// recovery records/bindings; no user, profile, order or duplicate record is written.
export function mountAdminPiRecovery(router: Router) {
  router.get("/account-recovery/options", async (req, res) => {
    const parsed = Number(req.query.page || 1);
    const page = Number.isInteger(parsed) && parsed > 0 && parsed <= 10000 ? parsed : 1;
    return res.json(await recoveryOptions(dbFor(req), text(req.query.search), page));
  });
  router.get("/account-recovery/inspect", async (req, res) => {
    const query = text(req.query.search);
    if (!query) return res.status(400).json({ message: "Enter a Pi username or UID to inspect saved records." });
    return res.json(await inspect(req, query, "", query));
  });
  router.get("/account-recovery", async (req, res) => {
    const rows = await dbFor(req).collection("pi_account_recovery_requests").find({}).sort({ createdAt: -1 }).limit(50).toArray();
    return res.json({ requests: rows.map(safeRequest) });
  });
  router.post("/account-recovery", async (req, res) => {
    const db = dbFor(req), body = req.body || {};
    const canonicalUserId = text(body.canonicalUserId), incomingIdentityId = text(body.incomingIdentityId);
    if (body.recordsReviewed !== true) throw fail("Review the original account and all newer records first.", 400);
    // Only server-resolved selection IDs are accepted. Posted UIDs/app IDs are ignored.
    const report = await selectionReport(req, canonicalUserId, incomingIdentityId);
    const original = report.selection.original, incomingUid = report.selection.incoming.uid;
    const originalAppIdentity = report.selection.original.appIdentity, incomingAppIdentity = report.selection.incoming.appIdentity;
    const originalAppId = originalAppIdentity.appId, incomingAppId = incomingAppIdentity.appId;
    if (report.reviewHash !== text(body.reviewHash)) throw fail("Review the selected accounts before opening recovery.");
    if (report.accounts.filter((row: any) => row.canonicalUid === original.uid).length !== 1 || report.approvedIdentityBindings.length) throw fail("Existing bindings or duplicate original UIDs require a separate identity review.");
    const code = randomBytes(32).toString("hex"), now = new Date();
    const record = { _id: new ObjectId(), canonicalUserId, canonicalUid: original.uid, incomingUid, originalAppId, incomingAppId,
      incomingIdentityId, selectionVersion: 2, originalAppIdentity, incomingAppIdentity,
      status: "pending", challengeHash: hash(code), attempts: 0, createdAt: now, expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      createdBy: String((await resolveCurrentUser(req))!._id), reviewHash: report.reviewHash, reviewSnapshot: report,
      reviewedDuplicateAccountIds: report.accounts.filter((row: any) => row.canonicalUid === incomingUid).map((row: any) => row.accountId) };
    await db.collection("pi_account_recovery_requests").insertOne(record);
    return res.status(201).json({ request: safeRequest(record), recoveryCode: code });
  });
  router.get("/account-recovery/pair", async (req, res) => {
    return res.json(await selectionReport(req, text(req.query.canonicalUserId), text(req.query.incomingIdentityId)));
  });
  router.get("/account-recovery/:id/review", async (req, res) => {
    const id = text(req.params.id);
    if (!ObjectId.isValid(id)) throw fail("Recovery request not found.", 404);
    const row = await dbFor(req).collection("pi_account_recovery_requests").findOne({ _id: new ObjectId(id) });
    if (!row) throw fail("Recovery request not found.", 404);
    const report = row.selectionVersion === 2 ? await selectionReport(req, row.canonicalUserId, row.incomingIdentityId) : await inspect(req, row.canonicalUid, row.incomingUid);
    return res.json({ request: safeRequest(row), report });
  });
  router.post("/account-recovery/:id/approve", async (req, res) => {
    const db = dbFor(req), body = req.body || {}, id = text(req.params.id);
    if (!ObjectId.isValid(id)) throw fail("Recovery request not found.", 404);
    const requests = db.collection("pi_account_recovery_requests"), row = await requests.findOne({ _id: new ObjectId(id) });
    if (!row || row.status !== "pending" || new Date(row.expiresAt).getTime() <= Date.now()) throw fail("This request is unavailable or expired. Open a new reviewed request.");
    const proofReference = text(body.proofReference, 1000);
    if (!row.originalAppId || !row.incomingAppId || row.originalAppId === row.incomingAppId) throw fail("App identity verification required. Historical app metadata is missing or conflicting; no identity link was created. Verify the app history before opening a new reviewed request.");
    if (body.approved !== true || body.recordsReviewed !== true || body.appIdsVerified !== true || proofReference.length < 12) throw fail("Explicitly approve ownership, historical records, and both Developer Portal app IDs; include a private evidence reference.", 400);
    if (row.proofs?.original?.uid !== row.canonicalUid || row.proofs?.incoming?.uid !== row.incomingUid) throw fail("Both Pi identities must be verified before approval.");
    const report = row.selectionVersion === 2 ? await selectionReport(req, row.canonicalUserId, row.incomingIdentityId) : await inspect(req, row.canonicalUid, row.incomingUid);
    const links = db.collection("pi_account_identity_links");
    const existing = await links.findOne({ _id: row.incomingUid });
    if (existing?.recoveryRequestId === id) {
      await requests.updateOne({ _id: row._id, status: "pending" }, { $set: { status: "approved", approvedAt: existing.approvedAt, approvedBy: existing.approvedBy }, $unset: { challengeHash: "" } });
      return res.json({ message: "Recovery was already approved.", request: { ...safeRequest(row), status: "approved" } });
    }
    if (report.reviewHash !== row.reviewHash || report.reviewHash !== text(body.reviewHash)) throw fail("Saved records changed. Inspect them and open a new request; no identity link was changed.");
    const canonical = await db.collection("users").findOne({ _id: new ObjectId(row.canonicalUserId), uid: row.canonicalUid });
    if (!canonical || canonical.blocked) throw fail("The original account is unavailable for recovery.");
    const approvedAt = new Date(), approvedBy = String((await resolveCurrentUser(req))!._id);
    try {
      await links.insertOne({ _id: row.incomingUid, canonicalUserId: row.canonicalUserId, canonicalUid: row.canonicalUid,
        originalAppId: row.originalAppId, incomingAppId: row.incomingAppId, status: "approved", approvedAt, approvedBy,
        proofReference, recoveryRequestId: id, proofs: row.proofs, duplicatesReviewed: true,
        originalAppIdentity: row.originalAppIdentity || null, incomingAppIdentity: row.incomingAppIdentity || null,
        reviewedDuplicateAccountIds: row.reviewedDuplicateAccountIds });
    } catch (error: any) { if (error.code === 11000) throw fail("An identity binding already exists. It was not overwritten."); throw error; }
    await requests.updateOne({ _id: row._id, status: "pending" }, { $set: { status: "approved", approvedAt, approvedBy, proofReference }, $unset: { challengeHash: "" } });
    return res.json({ message: "Recovery approved. Sign in again to use the original account. All newer records were preserved." });
  });
}

// The unpredictable, expiring case code authorizes proof submission only, never
// account access. Pi bearer tokens stay in request memory and are never persisted.
export async function provePiRecovery(req: Request, res: Response) {
  res.setHeader("Cache-Control", "no-store");
  try {
    const code = text(req.body?.recoveryCode, 65), side = req.body?.side;
    const token = text(req.body?.accessToken, 8193);
    if (!/^[a-f0-9]{64}$/.test(code) || !["original", "incoming"].includes(side) || !token || token.length > 8192 || req.body?.consent !== true) throw fail("Check your recovery code and try again.", 400);
    const requests = dbFor(req).collection("pi_account_recovery_requests");
    const query = { challengeHash: hash(code), status: "pending", expiresAt: { $gt: new Date() }, attempts: { $lt: 30 } };
    const row = await requests.findOne(query);
    if (!row || !(await requests.updateOne({ ...query, _id: row._id }, { $inc: { attempts: 1 } })).matchedCount) throw fail("This recovery code is unavailable or expired. Ask your administrator for a new request.");
    let identity: any;
    try { identity = (await getUserPlatformAPIClient().get("/v2/me", { headers: { Authorization: "Bearer " + token }, timeout: 10000 })).data; }
    catch { throw fail("Pi could not verify this sign-in. Open the correct Pi app and try again.", 401); }
    const expectedUid = side === "original" ? row.canonicalUid : row.incomingUid;
    const validUntil = identity?.credentials?.valid_until?.timestamp;
    if (!identity?.uid || identity.uid !== expectedUid || (validUntil && validUntil * 1000 <= Date.now())) throw fail("Please use the Pi account and app specified by your administrator.", 403);
    const saved = await requests.updateOne({ _id: row._id, challengeHash: hash(code), status: "pending", expiresAt: { $gt: new Date() } },
      { $set: { [`proofs.${side}`]: { uid: identity.uid, verifiedAt: new Date(), consentedAt: new Date(), credentialHash: hash(token) } } });
    if (!saved.matchedCount) throw fail("This request changed or expired. Ask your administrator to review it.");
    return res.json({ message: "Pi identity verified. Complete the other app sign-in, then wait for administrator approval." });
  } catch (error: any) { return res.status(error.status || 503).json({ message: error.status ? error.message : "Recovery is temporarily unavailable. Please try again." }); }
}
