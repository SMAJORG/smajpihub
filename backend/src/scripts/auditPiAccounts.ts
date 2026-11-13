import "dotenv/config";
import { MongoClient } from "mongodb";

// Read-only incident report. Never fetch credentials, update documents or create indexes.
const projection = { uid: 1, username: 1, piUsername: 1, displayName: 1, country: 1, contactPhone: 1, avatar: 1, bio: 1, role: 1, roles: 1, sellerActive: 1, verificationStatus: 1, verificationLevel: 1, createdAt: 1, lastSeenAt: 1, piVerifiedUid: 1, lastPiLogin: 1 };
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export async function auditPiAccounts(db: any, uids: string[], username?: string) {
  const clauses: any[] = uids.length ? [{ uid: { $in: uids } }] : [];
  if (username) { const regex = new RegExp("^" + escapeRegex(username.trim().replace(/^@+/, "")) + "$", "i"); clauses.push({ username: regex }, { piUsername: regex }); }
  if (!clauses.length) throw new Error("Supply --uid or --username; a username only locates review candidates, never proves ownership.");
  const accounts = await db.collection("users").find({ $or: clauses }).project(projection).limit(101).toArray();
  if (accounts.length > 100) throw new Error("More than 100 candidates. Narrow the read-only search using verified UIDs.");
  const rows = [];
  for (const user of accounts) {
    const [buyerOrders, sellerOrders, products, messages, sessions] = await Promise.all([
      db.collection("orders").countDocuments({ buyerId: user.uid }), db.collection("orders").countDocuments({ sellerId: user.uid }),
      db.collection("products").countDocuments({ sellerId: user.uid }), db.collection("messages").countDocuments({ senderId: user.uid }),
      db.collection("device_sessions").countDocuments({ userId: user.uid }),
    ]);
    rows.push({ accountId: String(user._id), canonicalUid: user.uid, username: user.username, piUsername: user.piUsername, serverVerifiedPiUid: user.piVerifiedUid || null,
      createdAt: user.createdAt, lastSeenAt: user.lastSeenAt, lastPiLogin: user.lastPiLogin ? { verifiedUid: user.lastPiLogin.verifiedUid, configuredAppId: user.lastPiLogin.configuredAppId, backendPaymentNetwork: user.lastPiLogin.backendPaymentNetwork, clientSandboxHint: user.lastPiLogin.clientSandboxHint, clientIdHint: user.lastPiLogin.clientIdHint, scopes: user.lastPiLogin.scopes, at: user.lastPiLogin.at } : null,
      profilePresent: { displayName: Boolean(user.displayName), country: Boolean(user.country), phone: Boolean(user.contactPhone), avatar: Boolean(user.avatar), bio: Boolean(user.bio) },
      role: user.role, roles: user.roles, sellerActive: user.sellerActive, verificationStatus: user.verificationStatus, verificationLevel: user.verificationLevel,
      referenceCounts: { buyerOrders, sellerOrders, products, messages, deviceSessions: sessions } });
  }
  const incoming = [...new Set([...uids, ...accounts.map((user: any) => user.uid)])];
  const links = incoming.length ? await db.collection("pi_account_identity_links").find({ _id: { $in: incoming } }).project({ canonicalUserId: 1, canonicalUid: 1, status: 1, originalAppId: 1, incomingAppId: 1, approvedBy: 1, approvedAt: 1, proofReference: 1, duplicatesReviewed: 1, reviewedDuplicateAccountIds: 1 }).toArray() : [];
  return { readOnly: true, database: db.databaseName, note: "Matching usernames, wallet addresses and configuration hints are not cross-app ownership proof. No migration or account link was applied.", accounts: rows, approvedIdentityBindings: links };
}

async function main() {
  const args = process.argv.slice(2), uids: string[] = []; let username: string | undefined;
  for (let i = 0; i < args.length; i += 2) {
    if (!args[i + 1] || !["--uid", "--username"].includes(args[i])) throw new Error("Usage: node build/scripts/auditPiAccounts.js --uid VERIFIED_UID [--uid OTHER_VERIFIED_UID] [--username REVIEW_CANDIDATE]");
    if (args[i] === "--uid") uids.push(args[i + 1]); else username = args[i + 1];
  }
  const database = process.env.MONGODB_DATABASE_NAME || "smajpihub";
  const host = process.env.MONGO_HOST;
  const credentials = process.env.MONGODB_USERNAME && process.env.MONGODB_PASSWORD ? `${encodeURIComponent(process.env.MONGODB_USERNAME)}:${encodeURIComponent(process.env.MONGODB_PASSWORD)}@` : "";
  const uri = process.env.MONGODB_URI || (host ? `mongodb://${credentials}${host}/${database}${credentials ? "?authSource=admin" : ""}` : "");
  if (!uri) throw new Error("Run this read-only report in the existing backend environment with its existing MongoDB settings. Do not paste credentials into arguments.");
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
  try { await client.connect(); console.log(JSON.stringify(await auditPiAccounts(client.db(database), uids, username), null, 2)); }
  finally { await client.close(); }
}
if (require.main === module) void main().catch(error => {
  const message = String(error?.message || "");
  console.error(/^(Supply --uid|Usage: node build|Run this read-only|More than 100)/.test(message) ? message : "Account audit failed. Check backend database access; no data was changed. Connection strings and credentials are intentionally omitted.");
  process.exitCode = 1;
});
