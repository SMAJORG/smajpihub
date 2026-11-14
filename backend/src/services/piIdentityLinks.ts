import { createHash, randomBytes } from "crypto";
import { ObjectId } from "mongodb";
import { getUserPlatformAPIClient } from "./platformAPIClient";

export class IdentityLinkError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
const reject = (message: string) => { throw new IdentityLinkError(409, "pi_identity_link_conflict", message); };
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
export async function verifyLinkIdentity(token: unknown) {
  if (typeof token !== "string" || !token.trim() || token.length > 8192) throw new IdentityLinkError(400, "pi_token_missing", "Authenticate with Pi in this app first.");
  let data: any;
  try { data = (await getUserPlatformAPIClient().get("/v2/me", { headers: { Authorization: `Bearer ${token}` }, timeout: 20000 })).data; }
  catch (error: any) {
    const status = error.response?.status;
    throw new IdentityLinkError(status === 401 || status === 403 ? 401 : 503, "pi_identity_verification_failed", "Pi could not verify this identity. Authenticate again and retry.");
  }
  if (typeof data?.uid !== "string" || !data.uid.trim() || (data.credentials?.valid_until?.timestamp && data.credentials.valid_until.timestamp * 1000 <= Date.now())) throw new IdentityLinkError(401, "pi_identity_invalid", "Pi returned an invalid or expired identity.");
  return { uid: data.uid as string, username: typeof data.username === "string" ? data.username : "" };
}

// UID is the only lookup key. A binding is usable only after both Pi /me proofs.
export async function resolveLinkedPiAccount(locals: any, uid: string, options: any = {}) {
  const links = locals.piIdentityLinkCollection;
  const binding = await links?.findOne({ _id: uid }, options);
  const first = await locals.userCollection.findOne({ uid }, options);
  const exact = first ? await locals.userCollection.find({ uid }, options).limit(2).toArray() : [];
  if (exact.length > 1) reject("Multiple records use this UID. An account review is required.");
  // Legacy recovery requests are not verified links and cannot change login.
  if (!binding || binding.proofMethod !== "dual_pi_me") return exact[0] || null;
  if (binding.status !== "verified" || binding.proofMethod !== "dual_pi_me" || !ObjectId.isValid(binding.canonicalUserId) || !binding.verifiedAt || exact[0]?.blocked) reject("This identity binding is unavailable. Contact support.");
  if (await links.findOne({ _id: binding.canonicalUid }, options)) reject("Chained identity bindings are not permitted.");
  const canonical = await locals.userCollection.findOne({ _id: new ObjectId(binding.canonicalUserId), uid: binding.canonicalUid }, options);
  if (!canonical) reject("The original account is unavailable. Contact support.");
  const canonicalPeers = await locals.userCollection.find({ uid: binding.canonicalUid }, options).limit(2).toArray();
  if (canonicalPeers.length !== 1) reject("The original account UID needs review.");
  return canonical;
}

export async function startIdentityLink(locals: any, identity: { uid: string }) {
  const account = await resolveLinkedPiAccount(locals, identity.uid);
  if (!account || account.blocked || account.uid !== identity.uid) reject("Start verification from the original account's Pi app.");
  const code = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  await locals.piIdentityChallengeCollection.insertOne({ _id: digest(code), canonicalUserId: String(account._id), canonicalUid: account.uid, createdAt: new Date(), expiresAt, consumedAt: null });
  return { code, expiresAt, original: { username: account.piUsername || account.username, uid: account.uid, role: account.role } };
}

async function review(locals: any, code: unknown, identity: { uid: string; username: string }, options: any = {}) {
  if (typeof code !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(code)) throw new IdentityLinkError(400, "pi_link_code_invalid", "Enter the verification code from the original app.");
  const challenge = await locals.piIdentityChallengeCollection.findOne({ _id: digest(code), consumedAt: null, expiresAt: { $gt: new Date() } }, options);
  if (!challenge) reject("This code expired or was already used. Generate a new code in the original app.");
  const canonical = await resolveLinkedPiAccount(locals, challenge.canonicalUid, options);
  if (!canonical || canonical.blocked || String(canonical._id) !== challenge.canonicalUserId || canonical.uid !== challenge.canonicalUid) reject("The original account is unavailable.");
  if (canonical.uid === identity.uid) reject("Both proofs identify the same Pi UID. Open the paired app to verify the other identity.");
  if (await locals.piIdentityLinkCollection.findOne({ _id: identity.uid }, options)) reject("This Pi identity already has a binding. Sign in normally or contact support.");
  // Never turn an existing primary account into an alias or build a link chain.
  if (await locals.piIdentityLinkCollection.findOne({ canonicalUid: identity.uid }, options)) reject("This identity already owns linked identities.");
  const peers = await locals.userCollection.find({ uid: identity.uid }, options).limit(2).toArray();
  if (peers.length > 1 || peers[0]?.blocked) reject("The second identity needs an account review.");
  const duplicate = peers[0];
  if (duplicate && (!(canonical.createdAt instanceof Date) || !(duplicate.createdAt instanceof Date) || canonical.createdAt > duplicate.createdAt)) reject("Keep the older account as primary. Start verification from its app.");
  return { challenge, canonical, duplicate };
}
export async function previewIdentityLink(locals: any, code: unknown, identity: { uid: string; username: string }) {
  const { canonical, duplicate } = await review(locals, code, identity);
  return { original: { username: canonical.piUsername || canonical.username, uid: canonical.uid, role: canonical.role }, incoming: identity, existingSecondaryAccount: Boolean(duplicate) };
}
export async function completeIdentityLink(locals: any, code: unknown, identity: { uid: string; username: string }, confirmedUid: unknown) {
  if (!locals.mongoClient) throw new IdentityLinkError(503, "pi_link_transactions_required", "Secure account linking requires the production database.");
  const session = locals.mongoClient.startSession();
  try {
    await session.withTransaction(async () => {
      const options = { session };
      const { challenge, canonical, duplicate } = await review(locals, code, identity, options);
      if (confirmedUid !== canonical.uid) reject("Review and confirm the original account before linking.");
      // Serialize competing links involving either existing account. Transaction
      // retries re-read bindings and reject reversed links rather than form cycles.
      const locked = await locals.userCollection.updateOne({ _id: canonical._id, uid: canonical.uid, blocked: { $ne: true } }, { $inc: { piIdentityLinkVersion: 1 } }, options);
      if (locked.matchedCount !== 1) reject("The original account changed. Retry verification.");
      if (duplicate) await locals.userCollection.updateOne({ _id: duplicate._id }, { $inc: { piIdentityLinkVersion: 1 } }, options);
      const consumed = await locals.piIdentityChallengeCollection.updateOne({ _id: challenge._id, consumedAt: null, expiresAt: { $gt: new Date() } }, { $set: { consumedAt: new Date(), incomingUid: identity.uid } }, options);
      if (consumed.matchedCount !== 1) reject("This code expired or was already used.");
      await locals.piIdentityLinkCollection.insertOne({ _id: identity.uid, canonicalUserId: String(canonical._id), canonicalUid: canonical.uid, status: "verified", proofMethod: "dual_pi_me", verifiedAt: new Date(), originalVerifiedAt: challenge.createdAt, challengeId: challenge._id, secondaryAccountId: duplicate ? String(duplicate._id) : null }, options);
      // Retained secondary records must not keep active device credentials after
      // the user has explicitly switched future access to the original account.
      await locals.deviceSessionCollection?.updateMany({ userId: identity.uid }, { $set: { active: false, revokedAt: new Date() } }, options);
    }, { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } });
  } finally { await session.endSession(); }
  return { linked: true };
}
