import axios from "axios";
export const piWalletPattern = /^G[A-Z2-7]{55}$/;

// Written only from Pi's server response, never frontend authResult.user.
export const verifiedPiIdentityFields = (data: { uid: string; wallet_address?: unknown }, previous?: any) => {
  const wallet = typeof data.wallet_address === "string" && piWalletPattern.test(data.wallet_address) ? data.wallet_address : "";
  return { piVerifiedUid: data.uid, piIdentityVerifiedAt: new Date(),
    // A username-only authentication does not revoke earlier wallet sharing.
    ...(wallet ? { piWalletAddress: wallet, piWalletVerifiedAt: new Date() } : data.wallet_address === undefined && previous?.piVerifiedUid === data.uid ? {} : { piWalletAddress: "", piWalletVerifiedAt: null }) };
};
type Recipient = { uid: string; walletAddress: string; source: "pi_api" | "verified_login" };
export type RecipientReview = { recipient: Recipient | null; reason: string; upstreamStatus?: number };
const storedRecipient = (user: any): Recipient | null => user.piVerifiedUid === user.uid && user.piIdentityVerifiedAt && user.piWalletVerifiedAt && piWalletPattern.test(user.piWalletAddress || "")
  ? { uid: user.uid, walletAddress: user.piWalletAddress, source: "verified_login" } : null;

// A2U uses app credentials and an app-local UID, not a live recipient OAuth session.
// Saved server-verified consent may survive OAuth expiry. Pi's payment DTO still
// enforces current UID/consent/address before any signing or submission.
export async function reviewPiRecipient(user: any): Promise<RecipientReview> {
  if (!user || user.blocked) return { recipient: null, reason: "account_unavailable" };
  const stored = storedRecipient(user);
  if (!user.accessToken || user.accessTokenRevokedAt) return { recipient: stored, reason: stored ? "eligible" : "pi_login_required" };
  try {
    const { data } = await axios.get("https://api.minepi.com/v2/me", { headers: { Authorization: `Bearer ${user.accessToken}` }, timeout: 6000 });
    if (data.uid !== user.uid) return { recipient: null, reason: "pi_uid_mismatch" };
    if (data.credentials?.valid_until?.timestamp && data.credentials.valid_until.timestamp * 1000 <= Date.now()) return { recipient: stored, reason: stored ? "eligible" : "pi_login_expired" };
    if (!piWalletPattern.test(data.wallet_address || "")) {
      // An omitted field in a narrower token is not an explicit consent revocation.
      if (data.wallet_address === undefined && stored) return { recipient: stored, reason: "eligible" };
      return { recipient: null, reason: "wallet_consent_required" };
    }
    return { recipient: { uid: data.uid, walletAddress: data.wallet_address, source: "pi_api" }, reason: "eligible" };
  } catch (error) {
    const status = axios.isAxiosError(error) ? error.response?.status : undefined;
    if (status === 403) return { recipient: null, reason: "pi_permission_denied", upstreamStatus: status };
    if (stored) return { recipient: stored, reason: "eligible" };
    return { recipient: null, reason: status === 401 ? "pi_login_expired" : "pi_api_unavailable", upstreamStatus: status };
  }
}

export async function persistPiRecipientReview(collection: any, user: any, review: RecipientReview) {
  if (!collection?.updateOne || !user?.uid) return;
  if (review.recipient?.source === "pi_api") {
    await collection.updateOne({ _id: user._id, uid: user.uid }, { $set: verifiedPiIdentityFields({ uid: user.uid, wallet_address: review.recipient.walletAddress }) });
  } else if (["wallet_consent_required", "pi_permission_denied", "pi_uid_mismatch"].includes(review.reason)) {
    await collection.updateOne({ _id: user._id, uid: user.uid }, { $set: { piWalletAddress: "", piWalletVerifiedAt: null } });
  }
}
