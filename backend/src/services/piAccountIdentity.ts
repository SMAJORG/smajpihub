import { ObjectId } from "mongodb";

export class PiAccountIdentityError extends Error {
  constructor(public code: string, message: string) { super(message); }
}
export const PI_LOGIN_IDENTITY_MESSAGE = "Please sign in through the Pi app you previously used for SMAJ PI HUB. Your saved account is unchanged.";
const recovery = () => new PiAccountIdentityError("pi_app_identity_unrecognized", PI_LOGIN_IDENTITY_MESSAGE);
const normalize = (value: string) => value.trim().replace(/^@+/, "").toLowerCase();
const escaped = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Never select a profile by username or wallet. A collision can only stop signup.
// Cross-app reconnection requires a privileged, explicitly approved UID binding.
// This resolver has no account merge/delete/write operation.
export async function resolvePiAccount(users: any, links: any, verified: { uid: string; username: string }, expectedAccountUid?: string) {
  const matches = await users.find({ uid: verified.uid }).limit(101).toArray();
  if (matches.length > 100) throw new PiAccountIdentityError("pi_duplicate_uid", "This Pi identity has too many duplicate records for automatic resolution. A database review is required.");
  // Recovery is optional. Pending/incomplete recovery records must never veto
  // an authenticated user's unique existing UID, regardless of profile completeness.
  try {
    const binding = links ? await links.findOne({ _id: verified.uid, status: "approved" }) : null;
    if (binding?.status === "approved") {
      if (typeof binding.approvedBy !== "string" || !binding.approvedBy.trim() || !Number.isFinite(new Date(binding.approvedAt || "").getTime()) || typeof binding.proofReference !== "string" || !binding.proofReference.trim() || typeof binding.originalAppId !== "string" || !binding.originalAppId.trim() || typeof binding.incomingAppId !== "string" || !binding.incomingAppId.trim() || typeof binding.canonicalUserId !== "string" || !ObjectId.isValid(binding.canonicalUserId)) throw recovery();
      const account = await users.findOne({ _id: new ObjectId(binding.canonicalUserId) });
      if (!account || account.uid !== binding.canonicalUid) throw recovery();
      const canonicalPeers = await users.find({ uid: account.uid }).limit(2).toArray();
      if (canonicalPeers.length !== 1 || String(canonicalPeers[0]._id) !== String(account._id)) throw new PiAccountIdentityError("pi_duplicate_uid", "The original canonical UID is not unique. A database review is required before issuing a session; no account was changed.");
      const duplicates = matches.filter((user: any) => String(user._id) !== String(account._id));
      if (duplicates.length && (binding.duplicatesReviewed !== true || !Array.isArray(binding.reviewedDuplicateAccountIds) || duplicates.some((user: any) => !binding.reviewedDuplicateAccountIds.includes(String(user._id))))) {
        throw new PiAccountIdentityError("pi_duplicate_account_review_required", "A separate account already exists for this Pi identity. Its profile and data must be reviewed before reconnection. No records were merged or removed.");
      }
      return { account, linked: account.uid !== verified.uid, bindingId: binding._id };
    }
  } catch (error) {
    // An unavailable or invalid optional mapping cannot remove access to this
    // identity's own unique account. It never authorizes a different account.
    if (matches.length !== 1) throw error;
  }
  if (matches.length > 1) throw new PiAccountIdentityError("pi_duplicate_uid", "Multiple saved accounts use this Pi UID. Sign-in is stopped for a safe account review; no profile was selected or changed.");
  const account = matches[0] || null;
  if (account) return { account, linked: false, bindingId: null };
  // These guards apply only to provisioning an unknown UID. They cannot block
  // an existing exact-UID login and never grant access by username/browser hints.
  if (expectedAccountUid && expectedAccountUid !== verified.uid) throw recovery();
  if (expectedAccountUid) throw new PiAccountIdentityError("pi_account_record_missing", "Your previously signed-in account was not found in this backend database. No replacement profile was created. Ask support to verify the database and original Pi app identity.");
  const name = new RegExp("^" + escaped(normalize(verified.username)) + "$", "i");
  const collision = await users.find({ $or: [{ username: name }, { piUsername: name }] }).limit(1).project({ _id: 1 }).toArray();
  if (collision.length) throw recovery();
  return { account: null, linked: false, bindingId: null };
}

export const piLoginContext = (body: any, verified: { uid: string; credentials?: { scopes?: unknown } }) => ({
  verifiedUid: verified.uid,
  // /me does not attest a developer-project ID. Hints are diagnostic, not proof.
  configuredAppId: String(process.env.PI_LOGIN_APP_ID || "").slice(0, 120) || null,
  backendPaymentNetwork: process.env.PI_NETWORK || "Pi Testnet",
  clientSandboxHint: typeof body?.sandbox === "boolean" ? body.sandbox : null,
  clientIdHint: typeof body?.loginContext?.clientId === "string" ? body.loginContext.clientId.slice(0, 120) : null,
  scopes: Array.isArray(verified.credentials?.scopes) ? verified.credentials!.scopes.filter((scope: unknown) => typeof scope === "string").slice(0, 20) : [],
  at: new Date(),
});

// Call only after validating a Hub signature/device or a refresh-token hash.
export const resolvePiSessionAccount = (users: any, links: any, uid: string) => resolvePiAccount(users, links, { uid, username: "" });
