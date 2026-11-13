import PiNetwork from "pi-backend";
import axios from "axios";
import { Collection } from "mongodb";

export class PayoutError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export type PayoutSdk = Pick<PiNetwork, "createPayment" | "getPayment" | "submitPayment" | "completePayment">;
export const makeTestnetSdk = (): PayoutSdk => {
  const key = process.env.PI_TESTNET_API_KEY;
  const seed = process.env.PI_TESTNET_WALLET_SEED;
  if (!key || !seed) throw new PayoutError(503, "Testnet wallet credentials are not configured.");
  try { return new PiNetwork(key, seed); }
  catch { throw new PayoutError(503, "Testnet wallet seed must be a valid Stellar secret seed (S..., 56 characters)."); }
};
export const getVerifiedTestnetRecipient = async (user: any) => {
  if (!user || user.blocked || !user.accessToken || user.accessTokenRevokedAt) return null;
  try {
    const { data } = await axios.get("https://api.minepi.com/v2/me", {
      headers: { Authorization: `Bearer ${user.accessToken}` }, timeout: 6000,
    });
    if (data.uid !== user.uid || (data.credentials?.valid_until?.timestamp && data.credentials.valid_until.timestamp * 1000 <= Date.now())) return null;
    return { uid: data.uid as string, walletAddress: typeof data.wallet_address === "string" ? data.wallet_address : "" };
  } catch { return null; }
};
export const verifyTestnetRecipient = async (user: any) => Boolean(await getVerifiedTestnetRecipient(user));
const validatePayment = (payment: any, uid: string, paymentId: string) => {
  if (payment.identifier !== paymentId || payment.network !== "Pi Testnet" || payment.direction !== "app_to_user"
      || payment.user_uid !== uid || payment.amount !== 0.01 || !/^G[A-Z2-7]{55}$/.test(payment.to_address)
      || payment.status?.cancelled || payment.status?.user_cancelled) {
    throw new PayoutError(409, "Payment details failed Testnet verification; reconciliation required.");
  }
};

// One test payout per UID. The fixed wallet lock serializes SDK calls across replicas.
// Neither lock nor payout reservations expire: ambiguous transfers must never be resent.
export async function sendTestnetPayout(collection: Collection<any>, uid: string, adminUid: string, sdk: PayoutSdk, expected: { recipientWalletAddress?: string; senderWalletAddress?: string } = {}) {
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
    if ((expected.recipientWalletAddress && payment.to_address !== expected.recipientWalletAddress) || (expected.senderWalletAddress && payment.from_address !== expected.senderWalletAddress)) throw new Error("Confirmed wallet changed");
    if (payment.transaction) throw new Error("Unexpected existing transaction");
    const walletId = `wallet:${payment.to_address}`;
    if (await collection.findOne({ _id: walletId }) || await collection.findOne({ recipientWalletAddress: payment.to_address, status: { $in: ["completed", "submitting", "submitted", "reconciliation_required"] } })) {
      throw new Error("Recipient wallet already reserved or paid");
    }
    await collection.insertOne({ _id: walletId, recipientUid: uid, createdAt: new Date(), type: "wallet_reservation" });
    await save({ recipientWalletAddress: payment.to_address, status: "submitting" });
    const txid = await sdk.submitPayment(paymentId);
    if (!txid) throw new Error("Missing transaction ID");
    await save({ txid, status: "submitted" });
    const completed = await sdk.completePayment(paymentId, txid);
    validatePayment(completed, uid, paymentId);
    if (completed.to_address !== payment.to_address || completed.transaction?.txid !== txid
        || !completed.transaction.verified || !completed.status.transaction_verified || !completed.status.developer_completed) {
      throw new Error("Payment completion unverified");
    }
    await save({ status: "completed", piStatus: completed.status, completedAt: new Date() });
    await collection.deleteOne({ _id: "wallet-lock", recipientUid: uid });
    return await collection.findOne({ _id: id });
  } catch {
    if (reserved) await collection.updateOne({ _id: id }, { $set: { status: "reconciliation_required", updatedAt: new Date() } });
    // Keep the wallet lock even on timeouts/restarts; never guess whether money moved.
    throw new PayoutError(409, "Payout stopped; administrator reconciliation required. No automatic resend.");
  }
}
