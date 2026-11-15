import "dotenv/config";
import { MongoClient } from "mongodb";

// Read-only incident report. Never fetch credentials, update documents or create indexes.
const projection = { uid: 1, username: 1, piUsername: 1, displayName: 1, country: 1, contactPhone: 1, avatar: 1, bio: 1, role: 1, roles: 1, sellerActive: 1, verificationStatus: 1, verificationLevel: 1, createdAt: 1, lastSeenAt: 1, piVerifiedUid: 1, lastPiLogin: 1 };
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export async function auditPiAccounts(db: any, uids: string[], username?: string, all = false) {
  const clauses: any[] = uids.length ? [{ uid: { $in: uids } }] : [];
  if (username) { const regex = new RegExp("^" + escapeRegex(username.trim().replace(/^@+/, "")) + "$", "i"); clauses.push({ username: regex }, { piUsername: regex }); }
  if (!clauses.length && !all) throw new Error("Supply --all, --uid or --username; a username only locates review candidates, never proves ownership.");
  const totalUsers = await db.collection("users").countDocuments({});
  const accounts = await db.collection("users").find(all ? {} : { $or: clauses }).project(projection).limit(101).toArray();
  if (accounts.length > 100) throw new Error("More than 100 candidates. Narrow the read-only search using verified UIDs.");
  const rows: Array<{ accountId: string; canonicalUid: string; [key: string]: any }> = [];
  for (const user of accounts) {
    const [buyerOrders, sellerOrders, products, messages, sessions, activeSessions] = await Promise.all([
      db.collection("orders").countDocuments({ buyerId: user.uid }), db.collection("orders").countDocuments({ sellerId: user.uid }),
      db.collection("products").countDocuments({ sellerId: user.uid }), db.collection("messages").countDocuments({ senderId: user.uid }),
      db.collection("device_sessions").countDocuments({ userId: user.uid }),
      db.collection("device_sessions").countDocuments({ userId: user.uid, active: true, revokedAt: null, expiresAt: { $gt: new Date() } }),
    ]);
    rows.push({ accountId: String(user._id), canonicalUid: user.uid, username: user.username, piUsername: user.piUsername, serverVerifiedPiUid: user.piVerifiedUid || null,
      createdAt: user.createdAt, lastSeenAt: user.lastSeenAt, lastPiLogin: user.lastPiLogin ? { verifiedUid: user.lastPiLogin.verifiedUid, configuredAppId: user.lastPiLogin.configuredAppId, backendPaymentNetwork: user.lastPiLogin.backendPaymentNetwork, clientSandboxHint: user.lastPiLogin.clientSandboxHint, clientIdHint: user.lastPiLogin.clientIdHint, scopes: user.lastPiLogin.scopes, at: user.lastPiLogin.at } : null,
      profilePresent: { displayName: Boolean(user.displayName), country: Boolean(user.country), phone: Boolean(user.contactPhone), avatar: Boolean(user.avatar), bio: Boolean(user.bio) },
      role: user.role, roles: user.roles, sellerActive: user.sellerActive, verificationStatus: user.verificationStatus, verificationLevel: user.verificationLevel,
      referenceCounts: { buyerOrders, sellerOrders, products, messages, deviceSessions: sessions, activeDeviceSessions: activeSessions } });
  }
  const incoming = [...new Set([...uids, ...accounts.map((user: any) => user.uid)])];
  // Links are keyed by incoming UID. Looking up only that key hides bindings
  // when auditing an original account, falsely reporting it as unmapped.
  const links = incoming.length ? await db.collection("pi_account_identity_links").find({ $or: [{ _id: { $in: incoming } }, { canonicalUid: { $in: incoming } }] }).project({ canonicalUserId: 1, canonicalUid: 1, status: 1, proofMethod: 1, verifiedAt: 1, originalVerifiedAt: 1, secondaryAccountId: 1 }).toArray() : [];
  const verifiedBindings = links.filter((link: any) => link.status === "verified" && ["dual_pi_me", "hub_session_pi_me"].includes(link.proofMethod) && link.verifiedAt && rows.some(user => user.accountId === link.canonicalUserId && user.canonicalUid === link.canonicalUid));
  return { readOnly: true, database: db.databaseName, totalUsers, auditedAccounts: rows.length, recordedVerifiedBindings: verifiedBindings.length,
    note: "Matching usernames, wallet addresses and configuration hints are not cross-app ownership proof. Recorded bindings and active sessions do not establish that a production Mainnet login was tested. No migration or account link was applied.", accounts: rows, approvedIdentityBindings: verifiedBindings, unverifiedBindingRecords: links.filter((link: any) => !verifiedBindings.includes(link)) };
}

async function main() {
  const args = process.argv.slice(2), uids: string[] = []; let username: string | undefined;
  const all = args.includes("--all");
  for (let i = 0; i < args.length;) {
    if (args[i] === "--all") { i++; continue; }
    if (!args[i + 1] || !["--uid", "--username"].includes(args[i])) throw new Error("Usage: node build/scripts/auditPiAccounts.js --all | --uid VERIFIED_UID [--uid OTHER_VERIFIED_UID] [--username REVIEW_CANDIDATE]");
    if (args[i] === "--uid") uids.push(args[i + 1]); else username = args[i + 1];
    i += 2;
  }
  const database = process.env.MONGODB_DATABASE_NAME || "smajpihub";
  const host = process.env.MONGO_HOST;
  const credentials = process.env.MONGODB_USERNAME && process.env.MONGODB_PASSWORD ? `${encodeURIComponent(process.env.MONGODB_USERNAME)}:${encodeURIComponent(process.env.MONGODB_PASSWORD)}@` : "";
  const uri = process.env.MONGODB_URI || (host ? `mongodb://${credentials}${host}/${database}${credentials ? "?authSource=admin" : ""}` : "");
  if (!uri) throw new Error("Run this read-only report in the existing backend environment with its existing MongoDB settings. Do not paste credentials into arguments.");
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
  try { await client.connect(); console.log(JSON.stringify(await auditPiAccounts(client.db(database), uids, username, all), null, 2)); }
  finally { await client.close(); }
}
if (require.main === module) void main().catch(error => {
  const message = String(error?.message || "");
  console.error(/^(Supply --uid|Usage: node build|Run this read-only|More than 100)/.test(message) ? message : "Account audit failed. Check backend database access; no data was changed. Connection strings and credentials are intentionally omitted.");
  process.exitCode = 1;
});
