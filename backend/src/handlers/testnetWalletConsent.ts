import type { Request, Response } from "express";
import { resolveHubAccessUser } from "../services/persistentSessions";
import { getUserPlatformAPIClient } from "../services/platformAPIClient";
import { piWalletPattern, verifiedPiIdentityFields } from "../services/piRecipientIdentity";

// Consent-only: no SDK payment or blockchain mutation is permitted here.
export async function saveTestnetWalletConsent(req: Request, res: Response) {
  res.setHeader("Cache-Control", "no-store");
  try {
    const hubToken = req.get("authorization")?.match(/^Bearer (hub_access\.[^\s]+)$/i)?.[1];
    const user = hubToken ? await resolveHubAccessUser(req, hubToken) : null;
    if (!user) return res.status(401).json({ code: "hub_session_required", message: "Sign in to SMAJ PI HUB before verifying Testnet wallet sharing." });
    const accessToken = req.body?.accessToken;
    if (typeof accessToken !== "string" || !accessToken || accessToken.length > 8192) return res.status(400).json({ code: "pi_login_required", message: "Approve wallet sharing in the Testnet Pi app first." });
    let identity: any;
    try { identity = (await getUserPlatformAPIClient().get("/v2/me", { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 10000 })).data; }
    catch (error: any) {
      const status = error.response?.status;
      if (status === 403) await req.app.locals.userCollection.updateOne({ _id: user._id, uid: user.uid }, { $set: { piWalletAddress: "", piWalletVerifiedAt: null } });
      return res.status(status === 401 || status === 403 ? 422 : 503).json({ code: status === 403 ? "pi_permission_denied" : status === 401 ? "pi_login_expired" : "pi_api_unavailable", message: status === 401 ? "Pi sign-in expired. Verify wallet sharing again; your Hub login remains active." : status === 403 ? "Pi denied wallet sharing. Renew this Testnet app's permissions." : "Pi identity verification is unavailable. No wallet evidence was changed." });
    }
    if (identity?.uid !== user.uid) return res.status(422).json({ code: "pi_uid_mismatch", message: "This Pi identity differs from your signed-in account. Use the same Testnet Pi app and account; no account or wallet was changed." });
    if (identity.credentials?.valid_until?.timestamp && identity.credentials.valid_until.timestamp * 1000 <= Date.now()) return res.status(422).json({ code: "pi_login_expired", message: "Pi sign-in expired. Verify wallet sharing again." });
    if (!piWalletPattern.test(identity.wallet_address || "")) return res.status(422).json({ code: "wallet_consent_required", message: "Pi did not return a verified wallet address. Approve wallet_address sharing through this Testnet app." });
    const saved = await req.app.locals.userCollection.updateOne({ _id: user._id, uid: identity.uid, blocked: { $ne: true } }, { $set: { ...verifiedPiIdentityFields(identity), accessToken, accessTokenRevokedAt: null } });
    if (!saved.matchedCount) return res.status(409).json({ code: "account_changed", message: "Your account changed. Sign in again before verifying wallet sharing." });
    return res.json({ uid: identity.uid, walletAddress: identity.wallet_address, walletConsentSaved: true, paymentSent: false });
  } catch { return res.status(503).json({ code: "consent_unavailable", message: "Wallet consent could not be saved. Please retry; no payment was sent." }); }
}
