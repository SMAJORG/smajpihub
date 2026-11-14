import { piWalletPattern, reviewPiRecipient, persistPiRecipientReview } from "./piRecipientIdentity";
import { PayoutError } from "./testnetA2U";
import { testnetWalletSnapshot } from "./testnetA2UWallet";

const safePaymentFields = { _id: 0, recipientUid: 1, recipientWalletAddress: 1, amount: 1, network: 1, status: 1, paymentId: 1, txid: 1, createdAt: 1, completedAt: 1 };
export const payoutPage = (value: unknown) => Math.min(10000, Math.max(1, Math.floor(Number(value) || 1)));
const collectionFor = (locals: any) => {
  if (!locals.testnetA2UCollection || locals.memoryDatabase) throw new PayoutError(503, "Persistent payout database unavailable.");
  return locals.testnetA2UCollection;
};
export async function testnetDashboard(locals: any, page: number) {
  const collection = collectionFor(locals);
  const filter = { network: "Pi Testnet" };
  const [wallet, records, total, completedWallets, lock] = await Promise.all([
    testnetWalletSnapshot(), collection.find(filter).project(safePaymentFields).sort({ createdAt: -1 }).skip((page - 1) * 20).limit(20).toArray(),
    collection.countDocuments(filter),
    collection.distinct("recipientWalletAddress", { network: "Pi Testnet", status: "completed", "piStatus.transaction_verified": true, "piStatus.developer_completed": true, txid: { $type: "string" }, recipientWalletAddress: { $regex: "^G[A-Z2-7]{55}$" } }),
    collection.findOne({ _id: "wallet-lock" }),
  ]);
  return { backendRevision: process.env.RENDER_GIT_COMMIT || process.env.GITHUB_SHA || null, wallet, records, page, hasMore: page * 20 < total, total, successfulUniqueWallets: completedWallets.length, target: 5, walletLocked: Boolean(lock), appWalletConnection: "Compare this configured wallet address with the connected Testnet App Wallet in Pi Developer Portal. Pi verifies the sender during payout." };
}
export async function testnetRecipients(locals: any, page: number, search: string) {
  const collection = collectionFor(locals);
  const query: any = { blocked: { $ne: true },
    $or: [{ accessToken: { $type: "string" } }, { piWalletVerifiedAt: { $type: "date" } }, { piVerifiedUid: { $type: "string" } }, { "lastPiLogin.verifiedUid": { $type: "string" } }] };
  const normalized = search.trim().replace(/^@+/, "");
  const walletSearch = piWalletPattern.test(normalized.toUpperCase()) ? normalized.toUpperCase() : "";
  const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (normalized) query.$and = [{ $or: walletSearch
    ? ["piWalletAddress", "wallet_address", "walletAddress"].map(field => ({ [field]: walletSearch }))
    : ["username", "piUsername", "displayName", "uid"].map(field => ({ [field]: { $regex: escaped, $options: "i" } })) }];
  const users = await locals.userCollection.find(query).project({ uid: 1, username: 1, displayName: 1, accessToken: 1, accessTokenRevokedAt: 1, blocked: 1, piVerifiedUid: 1, piIdentityVerifiedAt: 1, piWalletAddress: 1, piWalletVerifiedAt: 1 }).sort({ lastSeenAt: -1, _id: -1 }).skip((page - 1) * 20).limit(21).toArray();
  const diagnostics: Record<string, number> = {};
  const eligible: any[] = [];
  const candidates = users.slice(0, 20);
  for (let i = 0; i < candidates.length; i += 4) {
    const batch = await Promise.all(candidates.slice(i, i + 4).map(async (user: any) => {
      const review = await reviewPiRecipient(user);
      await persistPiRecipientReview(locals.userCollection, user, review);
      const verified = review.recipient;
      if (!verified) {
        diagnostics[review.reason] = (diagnostics[review.reason] || 0) + 1;
        return walletSearch ? null : { uid: user.uid, username: user.username || "", displayName: user.displayName || user.username || "Pi user", walletAddress: "", canReceive: false, status: review.reason };
      }
      if (walletSearch && verified.walletAddress !== walletSearch) return null;
      const [uidRecord, walletRecord, previous] = await Promise.all([
        collection.findOne({ _id: `recipient:${user.uid}` }), collection.findOne({ _id: `wallet:${verified.walletAddress}` }),
        collection.findOne({ recipientWalletAddress: verified.walletAddress, status: { $in: ["completed", "submitting", "submitted", "reconciliation_required"] } }),
      ]);
      return { uid: verified.uid, username: user.username || "", displayName: user.displayName || user.username || "Pi user", walletAddress: verified.walletAddress, canReceive: !uidRecord && !walletRecord && !previous, status: uidRecord?.status || (walletRecord || previous ? "wallet_already_reserved" : "eligible") };
    }));
    eligible.push(...batch.filter(Boolean));
  }
  return { recipients: eligible, page, hasMore: users.length > 20, checked: candidates.length, diagnostics, walletSearch: Boolean(walletSearch), message: walletSearch ? "Wallet lookup only covers users who authenticated with this app and whose wallet was server-verified. Search their Pi username first to verify an older login, or ask them to sign in with wallet sharing." : "Only server-verified Pi users with wallet sharing are eligible. Upstream failures and expired logins without saved consent are reported separately." };
}
