import { reviewPiRecipient, persistPiRecipientReview } from "./piRecipientIdentity";
import { PayoutError } from "./testnetA2U";
import { testnetGet, testnetWalletSnapshot } from "./testnetA2UWallet";

// Every remote operation here is a GET. Never create, sign, submit or complete a payment.
export async function testnetA2UPreflight(locals: any, uid: string) {
  if (!locals.testnetA2UCollection || !locals.userCollection || locals.memoryDatabase) throw new PayoutError(503, "Persistent payout database unavailable.");
  const user = await locals.userCollection.findOne({ uid });
  const review = await reviewPiRecipient(user);
  await persistPiRecipientReview(locals.userCollection, user, review);
  const recipient = review.recipient;
  if (!recipient) {
    const unavailable = review.reason === "pi_api_unavailable";
    const message = unavailable ? "Pi identity verification is unavailable. Retry this check later; no payment was created."
      : review.reason === "wallet_consent_required" ? "The recipient must approve wallet sharing (wallet_address) during Pi login."
      : "Recipient UID requires a fresh verified Pi login with wallet sharing; the previous token expired, permissions were denied, or identity did not match.";
    throw new PayoutError(unavailable ? 503 : 422, message, review.reason);
  }
  if (!/^G[A-Z2-7]{55}$/.test(recipient.walletAddress)) throw new PayoutError(422, "Recipient must sign in again and grant wallet_address consent on the Testnet app.");
  const wallet = await testnetWalletSnapshot();
  if (!wallet.ready) throw new PayoutError(wallet.incompletePayments ? 409 : 422, wallet.message);
  const address = wallet.address;
  try { await testnetGet(`/accounts/${recipient.walletAddress}`); }
  catch (error: any) {
    const status = error.response?.status;
    throw new PayoutError(status === 404 ? 422 : 503, status === 404 ? "Recipient Testnet wallet is not activated." : `Testnet wallet lookup is unavailable${status ? ` (HTTP ${status})` : ""}. No payment was created.`, status === 404 ? "testnet_wallet_unactivated" : "testnet_api_unavailable");
  }
  const [record, lock, walletReservation, previousWalletPayment] = await Promise.all([
    locals.testnetA2UCollection.findOne({ _id: `recipient:${uid}` }),
    locals.testnetA2UCollection.findOne({ _id: "wallet-lock" }),
    locals.testnetA2UCollection.findOne({ _id: `wallet:${recipient.walletAddress}` }),
    locals.testnetA2UCollection.findOne({ recipientWalletAddress: recipient.walletAddress, status: { $in: ["completed", "submitting", "submitted", "reconciliation_required"] } }),
  ]);
  if (record || lock || walletReservation || previousWalletPayment) throw new PayoutError(409, "Recipient already has a payout record or wallet is locked; inspect and reconcile first.");
  return {
    checksPassed: true, paymentSent: false, network: "Pi Testnet", amount: 0.01,
    recipientUid: recipient.uid, recipientWalletAddress: recipient.walletAddress, senderWalletAddress: address,
    apiKeyAccepted: true, seedValid: true, senderFunded: true, recipientActivated: true, walletConsentVerified: true,
    connectedAppWalletMatch: "Confirm senderWalletAddress matches the connected Testnet wallet in Pi Developer Portal; read-only API cannot establish this mapping.",
  };
}
