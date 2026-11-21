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
  // Run read-only database checks sequentially. Parallel wallet/ledger calls and
  // an unbounded distinct() can overwhelm the small isolated Testnet instance.
  const records = await collection.find(filter).project(safePaymentFields)
    .sort({ createdAt: -1 }).skip((page - 1) * 20).limit(20).toArray();
  const total = await collection.countDocuments(filter);
  const completedWallets = await collection.aggregate([
    { $match: { network: "Pi Testnet", status: "completed", ledgerVerified: true,
      "piStatus.transaction_verified": true, "piStatus.developer_completed": true,
      txid: { $type: "string" }, recipientWalletAddress: { $regex: "^G[A-Z2-7]{55}$" } } },
    { $group: { _id: "$recipientWalletAddress" } },
    { $count: "total" },
  ]).toArray();
  const lock = await collection.findOne({ _id: "wallet-lock" });
  // Read-only wallet status uses Node's crypto-based StrKey derivation.
  // Never enable payout readiness unless Pi API, ledger and balance checks pass.
  let wallet: Awaited<ReturnType<typeof testnetWalletSnapshot>>;
  try {
    wallet = await testnetWalletSnapshot();
  } catch {
    wallet = { address: "", balance: null, spendable: null, ready: false,
      apiKeyAccepted: false, seedValid: false, incompletePayments: 0,
      message: "Wallet verification failed; payouts are not ready.",
      code: "wallet_status_unavailable", apiStatus: null,
      seedConfigured: Boolean(process.env.PI_TESTNET_WALLET_SEED),
      apiKeyConfigured: Boolean(process.env.PI_TESTNET_API_KEY) };
  }
  return { backendRevision: process.env.RENDER_GIT_COMMIT || process.env.GITHUB_SHA || null,
    wallet, records, page, hasMore: page * 20 < total, total,
    successfulUniqueWallets: completedWallets[0]?.total || 0,
    target: 5, walletLocked: Boolean(lock),
    appWalletConnection: "Compare this configured wallet address with the connected Testnet App Wallet in Pi Developer Portal. Pi verifies the sender during payout." };
}
export async function testnetRecipients(locals: any, page: number, search: string) {
  const collection = collectionFor(locals);
  // Search all existing non-blocked users, including older accounts without wallet sharing.
  // Never treat a matching username as authorization to send a payout.
  const query: any = { blocked: { $ne: true } };
  const normalized = search.trim().replace(/^@+/, "");
  const walletSearch = piWalletPattern.test(normalized.toUpperCase()) ? normalized.toUpperCase() : "";
  const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (normalized) query.$and = [{ $or: walletSearch
    ? ["piWalletAddress", "wallet_address", "walletAddress"].map(field => ({ [field]: walletSearch }))
    : ["username", "piUsername", "displayName", "uid"].map(field => ({ [field]: { $regex: escaped, $options: "i" } })) }];
  const users = await locals.userCollection.find(query).project({ uid: 1, username: 1, piUsername: 1, displayName: 1, accessToken: 1, accessTokenRevokedAt: 1, blocked: 1, piVerifiedUid: 1, piIdentityVerifiedAt: 1, piWalletAddress: 1, piWalletVerifiedAt: 1 }).sort({ lastSeenAt: -1, _id: -1 }).skip((page - 1) * 20).limit(21).toArray();
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
        return { uid: user.uid, username: user.piUsername || user.username || "", displayName: user.displayName || user.piUsername || user.username || "Pi user", walletAddress: "", canReceive: false, status: review.reason };
      }
      if (walletSearch && verified.walletAddress !== walletSearch) return { uid: user.uid, username: user.piUsername || user.username || "", displayName: user.displayName || user.piUsername || user.username || "Pi user", walletAddress: "", canReceive: false, status: "wallet_not_verified_for_account" };
      const [uidRecord, walletRecord, previous] = await Promise.all([
        collection.findOne({ _id: `recipient:${user.uid}` }), collection.findOne({ _id: `wallet:${verified.walletAddress}` }),
        collection.findOne({ recipientWalletAddress: verified.walletAddress, status: { $in: ["completed", "submitting", "submitted", "reconciliation_required"] } }),
      ]);
      return { uid: verified.uid, username: user.username || "", displayName: user.displayName || user.username || "Pi user", walletAddress: verified.walletAddress, canReceive: !uidRecord && !walletRecord && !previous, status: uidRecord?.status || (walletRecord || previous ? "wallet_already_reserved" : "eligible") };
    }));
    eligible.push(...batch.filter(Boolean));
  }
  return { recipients: eligible, page, hasMore: users.length > 20, checked: candidates.length, diagnostics, walletSearch: Boolean(walletSearch), message: walletSearch ? "Wallet search includes stored wallet references for diagnosis. Only server-verified Pi identity and wallet consent enable payouts; an unverified wallet match cannot be paid." : "Previously verified Pi recipients remain eligible without logging in again. Unverified recipient identity or wallet information must still be established before payment." };
}
