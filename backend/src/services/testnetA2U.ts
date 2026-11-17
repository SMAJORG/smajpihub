import PiNetwork from "pi-backend";
import { reviewPiRecipient, persistPiRecipientReview } from "./piRecipientIdentity";
import { Collection } from "mongodb";
import { requireTestnetPayoutDeployment, verifyTestnetPayoutLedger } from "./testnetA2USafety";

export class PayoutError extends Error {
  constructor(public status: number, message: string, public code = "testnet_payout_error") { super(message); }
}
export type PayoutSdk = Pick<PiNetwork, "createPayment" | "getPayment" | "submitPayment" | "completePayment">;
export const makeTestnetSdk = (): PayoutSdk => {
  try { requireTestnetPayoutDeployment(); } catch (error: any) { throw new PayoutError(503, error.message, "testnet_deployment_required"); }
  const key = process.env.PI_TESTNET_API_KEY;
  const seed = process.env.PI_TESTNET_WALLET_SEED;
  if (!key || !seed) throw new PayoutError(503, "Testnet wallet credentials are not configured.");
  if (process.env.PI_MAINNET_API_KEY && key === process.env.PI_MAINNET_API_KEY) throw new PayoutError(503, "Testnet payouts must not reuse the Mainnet API key.");
  try { return new PiNetwork(key, seed); }
  catch { throw new PayoutError(503, "Testnet wallet seed must be a valid Stellar secret seed (S..., 56 characters)."); }
};
export const getVerifiedTestnetRecipient = async (user: any, collection?: any) => {
  const review = await reviewPiRecipient(user);
  await persistPiRecipientReview(collection, user, review);
  return review.recipient;
};
export const verifyTestnetRecipient = async (user: any, collection?: any) => Boolean(await getVerifiedTestnetRecipient(user, collection));
const validatePayment = (payment: any, uid: string, paymentId: string) => {
  if (payment.identifier !== paymentId || payment.network !== "Pi Testnet" || payment.direction !== "app_to_user"
      || payment.user_uid !== uid || payment.amount !== 0.01 || !/^G[A-Z2-7]{55}$/.test(payment.to_address)
      || payment.status?.cancelled || payment.status?.user_cancelled) {
    throw new PayoutError(409, "Payment details failed Testnet verification; reconciliation required.");
  }
};

// One test payout per UID. The fixed wallet lock serializes SDK calls across replicas.
// Neither lock nor payout reservations expire: ambiguous transfers must never be resent.
export async function sendTestnetPayout(collection: Collection<any>, uid: string, adminUid: string, sdk: PayoutSdk, expected: { recipientWalletAddress?: string; senderWalletAddress?: string } = {}, verifyLedger = verifyTestnetPayoutLedger) {
  const id = `recipient:${uid}`;
  const existing = await collection.findOne({ _id: id });
  if (existing) {
    if (existing.status === "completed") return existing;
    throw new PayoutError(409, "Payout already reserved; inspect its record and reconcile before further action.");
  }
  try { await collection.insertOne({ _id: "wallet-lock", recipientUid: uid, createdAt: new Date() }); }
  catch (error: any) {
    if (error.code === 11000) throw new PayoutError(409, "Testnet wallet is busy or requires reconciliation.");
    throw error;
  }
  let reserved = false;
  try {
    if (await collection.countDocuments({ network: "Pi Testnet", status: "completed", ledgerVerified: true }) >= 5) {
      await collection.deleteOne({ _id: "wallet-lock", recipientUid: uid });
      throw new PayoutError(409, "Five verified Testnet payouts are already complete. No further qualification payout is allowed.");
    }
    await collection.insertOne({ _id: id, recipientUid: uid, adminUid, amount: 0.01, network: "Pi Testnet", status: "creating", createdAt: new Date() });
    reserved = true;
    const save = async (fields: object) => {
      const result = await collection.updateOne({ _id: id }, { $set: { ...fields, updatedAt: new Date() } });
      if (result.matchedCount !== 1) throw new Error("Payout persistence failed");
    };
    const paymentId = await sdk.createPayment({ uid, amount: 0.01, memo: "SMAJ PI HUB Testnet payout", metadata: { testnetPayoutId: id } });
    if (!paymentId) throw new Error("Missing payment ID");
    await save({ paymentId, status: "created" });
    const payment = await sdk.getPayment(paymentId);
    validatePayment(payment, uid, paymentId);
    if (payment.to_address === payment.from_address) throw new Error("App wallet cannot pay itself");
    if ((expected.recipientWalletAddress && payment.to_address !== expected.recipientWalletAddress) || (expected.senderWalletAddress && payment.from_address !== expected.senderWalletAddress)) throw new Error("Confirmed wallet changed");
    if (payment.transaction) throw new Error("Unexpected existing transaction");
    const walletId = `wallet:${payment.to_address}`;
    if (await collection.findOne({ _id: walletId }) || await collection.findOne({ recipientWalletAddress: payment.to_address, status: { $in: ["completed", "submitting", "submitted", "reconciliation_required"] } })) {
      throw new Error("Recipient wallet already reserved or paid");
    }
    await collection.insertOne({ _id: walletId, recipientUid: uid, createdAt: new Date(), type: "wallet_reservation" });
    await save({ recipientWalletAddress: payment.to_address, senderWalletAddress: payment.from_address, status: "submitting" });
    const txid = await sdk.submitPayment(paymentId);
    if (!txid) throw new Error("Missing transaction ID");
    await save({ txid, status: "submitted" });
    const completed = await sdk.completePayment(paymentId, txid);
    validatePayment(completed, uid, paymentId);
    if (completed.to_address !== payment.to_address || completed.from_address !== payment.from_address || completed.transaction?.txid !== txid
        || !completed.transaction.verified || !completed.status.transaction_verified || !completed.status.developer_completed) {
      throw new Error("Payment completion unverified");
    }
    const ledgerProof = await verifyLedger(completed, txid);
    await save({ status: "completed", piStatus: completed.status, ledgerVerified: true, ledgerProof, completedAt: new Date() });
    await collection.deleteOne({ _id: "wallet-lock", recipientUid: uid });
    return await collection.findOne({ _id: id });
  } catch (error) {
    if (!reserved && error instanceof PayoutError) throw error;
    if (reserved) await collection.updateOne({ _id: id }, { $set: { status: "reconciliation_required", updatedAt: new Date() } });
    // Keep the wallet lock even on timeouts/restarts; never guess whether money moved.
    throw new PayoutError(409, "Payout stopped; administrator reconciliation required. No automatic resend.");
  }
}

// Read-only on Pi/chain: repair local evidence only after Pi already completed it.
// An uncertain or uncompleted transfer is never created, signed or submitted here.
export async function reconcileTestnetPayout(collection: Collection<any>, uid: string, sdk: PayoutSdk, verifyLedger = verifyTestnetPayoutLedger) {
  const record = await collection.findOne({ _id: `recipient:${uid}` });
  if (!record?.paymentId || !record.recipientWalletAddress || !record.senderWalletAddress) throw new PayoutError(409, "Payment evidence is incomplete. Inspect the Pi portal and Testnet ledger; no resend is permitted.");
  const payment = await sdk.getPayment(record.paymentId);
  validatePayment(payment, uid, record.paymentId);
  const txid = payment.transaction?.txid;
  if (!txid || (record.txid && record.txid !== txid) || payment.to_address !== record.recipientWalletAddress || payment.from_address !== record.senderWalletAddress
      || (payment.metadata as any)?.testnetPayoutId !== record._id || !payment.transaction?.verified || !payment.status.transaction_verified || !payment.status.developer_completed) throw new PayoutError(409, "Pi has not confirmed this exact transfer as completed. Keep the reservation; no payment was sent or resent.");
  const ledgerProof = await verifyLedger(payment, txid);
  const saved = await collection.updateOne({ _id: record._id, paymentId: record.paymentId }, { $set: { txid, status: "completed", piStatus: payment.status, ledgerVerified: true, ledgerProof, completedAt: new Date(), updatedAt: new Date() } });
  if (saved.matchedCount !== 1) throw new PayoutError(503, "Verified evidence could not be saved. Keep the reservation and retry verification only.");
  await collection.deleteOne({ _id: "wallet-lock", recipientUid: uid });
  return collection.findOne({ _id: record._id });
}
