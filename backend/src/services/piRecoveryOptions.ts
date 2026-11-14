import { createHash } from "crypto";
import { ObjectId } from "mongodb";

const dateExists = (value: unknown) => Boolean(value && Number.isFinite(new Date(value as string).getTime()));
const label = (value: unknown) => typeof value === "string" && value.trim() ? value.trim().slice(0, 200) : null;
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export const recoveryProjection = { uid: 1, username: 1, piUsername: 1, displayName: 1, createdAt: 1, role: 1, roles: 1, blocked: 1, sellerActive: 1, verificationStatus: 1, piVerifiedUid: 1, piIdentityVerifiedAt: 1, lastPiLogin: 1 };
export const recoveryAccount = (user: any) => ({ accountId: String(user._id), uid: typeof user.uid === "string" ? user.uid : "", username: user.piUsername || user.username || "", displayName: user.displayName || "", createdAt: user.createdAt || null, role: user.role || null, roles: Array.isArray(user.roles) ? user.roles : [], sellerActive: Boolean(user.sellerActive), verificationStatus: user.verificationStatus || "none", blocked: Boolean(user.blocked) });

// Called only after /v2/me verifies the submitted token. No tokens or wallet data.
// Keep separate app contexts instead of overwriting historical account identity.
export async function recordVerifiedPiLogin(collection: any, verified: { uid: string; username: string }, context: any) {
  if (!collection) return;
  const key = createHash("sha256").update(JSON.stringify([verified.uid, context.configuredAppId, context.clientIdHint, context.clientSandboxHint])).digest("hex");
  await collection.updateOne({ _id: key }, { $set: { uid: verified.uid, username: verified.username, context, lastVerifiedAt: new Date() }, $setOnInsert: { firstVerifiedAt: new Date(), source: "pi_me" } }, { upsert: true });
}
const incomingFromLogin = (row: any) => row?.source === "pi_me" && label(row.uid) && dateExists(row.lastVerifiedAt)
  ? { identityId: "login:" + row._id, uid: row.uid, username: row.username || "", verifiedAt: row.lastVerifiedAt, source: "Pi-verified login", configuredAppId: label(row.context?.configuredAppId), oauthClientHint: label(row.context?.clientIdHint), networkHint: label(row.context?.backendPaymentNetwork) } : null;
const incomingFromUser = (row: any, lastLogin: boolean) => {
  if (!row) return null;
  const context = row.lastPiLogin;
  const uid = lastLogin ? context?.verifiedUid : row.piVerifiedUid;
  const verifiedAt = lastLogin ? context?.at : row.piIdentityVerifiedAt;
  if (!label(uid) || !dateExists(verifiedAt) || (!lastLogin && uid !== row.uid)) return null;
  return { identityId: (lastLogin ? "context:" : "account:") + row._id, uid, username: row.piUsername || row.username || "", verifiedAt, source: lastLogin ? "Saved Pi-verified login context" : "Saved server-verified Pi identity", configuredAppId: context?.verifiedUid === uid && dateExists(context?.at) ? label(context?.configuredAppId) : null, oauthClientHint: context?.verifiedUid === uid ? label(context?.clientIdHint) : null, networkHint: context?.verifiedUid === uid ? label(context?.backendPaymentNetwork) : null };
};
export async function recoveryIncoming(db: any, id: string) {
  if (/^login:[a-f0-9]{64}$/.test(id)) return incomingFromLogin(await db.collection("pi_verified_logins").findOne({ _id: id.slice(6) }));
  const match = /^(account|context):([a-f0-9]{24})$/.exec(id);
  if (!match) return null;
  return incomingFromUser(await db.collection("users").findOne({ _id: new ObjectId(match[2]) }, { projection: recoveryProjection }), match[1] === "context");
}
export async function recoveryAppIdentity(db: any, uid: string, user?: any) {
  const contexts = await db.collection("pi_verified_logins").find({ uid, source: "pi_me" }).project({ context: 1 }).limit(101).toArray();
  const values = new Set<string>();
  if (user?.lastPiLogin?.verifiedUid === uid && dateExists(user.lastPiLogin.at)) {
    const value = label(user.lastPiLogin.configuredAppId); if (value) values.add(value);
  }
  for (const row of contexts) { const value = label(row.context?.configuredAppId); if (value) values.add(value); }
  const appId = contexts.length <= 100 && values.size === 1 ? [...values][0] : null;
  return { appId, status: appId ? "recorded_configuration" : "verification_required", source: appId ? "Server configuration recorded during a Pi-verified login; not attested by Pi" : null,
    message: appId ? "Recorded app label — administrator must verify the app registration." : values.size > 1 || contexts.length > 100 ? "Conflicting app history. App identity verification required." : "Historical app identity missing. App identity verification required." };
}
export async function recoveryOptions(db: any, search: string, page: number) {
  const pattern = search ? new RegExp(escape(search.replace(/^@+/, "")), "i") : null;
  const query = pattern ? { $or: [{ uid: pattern }, { username: pattern }, { piUsername: pattern }, { displayName: pattern }] } : {};
  const loginQuery = pattern ? { source: "pi_me", $or: [{ uid: pattern }, { username: pattern }] } : { source: "pi_me" };
  const offset = (page - 1) * 20;
  const [users, logins, legacy] = await Promise.all([
    db.collection("users").find(query).project(recoveryProjection).sort({ createdAt: 1, _id: 1 }).skip(offset).limit(21).toArray(),
    db.collection("pi_verified_logins").find(loginQuery).sort({ lastVerifiedAt: -1, _id: 1 }).skip(offset).limit(21).toArray(),
    db.collection("users").find({ $and: [query, { $or: [{ piIdentityVerifiedAt: { $exists: true } }, { "lastPiLogin.at": { $exists: true } }] }] }).project(recoveryProjection).sort({ piIdentityVerifiedAt: -1, _id: 1 }).skip(offset).limit(21).toArray(),
  ]);
  const candidates = [...logins.slice(0, 20).map(incomingFromLogin), ...legacy.slice(0, 20).flatMap((row: any) => [incomingFromUser(row, true), incomingFromUser(row, false)])].filter(Boolean);
  const seen = new Set<string>();
  const incoming = candidates.filter((row: any) => { const key = JSON.stringify([row.uid, row.configuredAppId]); if (seen.has(key)) return false; seen.add(key); return true; });
  return { database: db.databaseName, accounts: users.slice(0, 20).map(recoveryAccount), incoming, page, hasMore: users.length > 20 || logins.length > 20 || legacy.length > 20 };
}
