import { getVerifiedTestnetRecipient, PayoutError } from "./testnetA2U";
import { testnetGet, testnetWalletSnapshot } from "./testnetA2UWallet";

// Every remote operation here is a GET. Never create, sign, submit or complete a payment.
export async function testnetA2UPreflight(locals: any, uid: string) {
  if (!locals.testnetA2UCollection || !locals.userCollection || locals.memoryDatabase) throw new PayoutError(503, "Persistent payout database unavailable.");
  const user = await locals.userCollection.findOne({ uid });
  const recipient = await getVerifiedTestnetRecipient(user);
  if (!recipient) throw new PayoutError(422, "Recipient UID requires a fresh verified Pi login.");
  if (!/^G[A-Z2-7]{55}$/.test(recipient.walletAddress)) throw new PayoutError(422, "Recipient must sign in again and grant wallet_address consent on the Testnet app.");
  const wallet = await testnetWalletSnapshot();
  if (!wallet.ready) throw new PayoutError(wallet.incompletePayments ? 409 : 422, wallet.message);
  const address = wallet.address;
  try { await testnetGet(`/accounts/${recipient.walletAddress}`); }
  catch { throw new PayoutError(422, "Recipient Testnet wallet is not activated or Testnet API is unavailable."); }
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
