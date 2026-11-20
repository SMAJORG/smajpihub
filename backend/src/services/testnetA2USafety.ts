import { createHmac, timingSafeEqual } from "crypto";
import env from "../environments";
import { testnetGet } from "./testnetA2UWallet";

export function requireIsolatedTestnetDeployment() {
  if (process.env.PI_NETWORK !== "Pi Testnet" || process.env.PI_COMMERCE_MODE !== "testnet-development" || process.env.PI_MAINNET_ACCOUNT_MODE === "fresh") throw new Error("Payouts require an isolated Testnet development backend; Mainnet is never supported.");
  const isolated = process.env.PI_TESTNET_PAYOUT_DATABASE_NAME;
  if (!isolated || isolated === "smajpihub" || isolated !== env.mongo_db_name || !isolated.endsWith("_testnet_a2u")) throw new Error("Configure a separate *_testnet_a2u database, matching MONGODB_DATABASE_NAME and PI_TESTNET_PAYOUT_DATABASE_NAME. Production data must not be used.");
}
export function requireTestnetPayoutDeployment() {
  requireIsolatedTestnetDeployment();
  if (process.env.PI_TESTNET_PAYOUTS_ENABLED !== "true") throw new Error("Testnet payouts are disabled. Enable only on the isolated Testnet backend after reviewing the app wallet.");
}
export type ApprovedPayout = { recipientUid: string; recipientWalletAddress: string; senderWalletAddress: string };
const signature = (body: string) => createHmac("sha256", env.session_secret).update("testnet-a2u-approval:" + body).digest();
export function payoutApproval(adminUid: string, check: ApprovedPayout) {
  const body = Buffer.from(JSON.stringify({ ...check, adminUid, network: "Pi Testnet", amount: "0.01", expires: Date.now() + 300000 })).toString("base64url");
  return body + "." + signature(body).toString("base64url");
}
export function validPayoutApproval(token: unknown, adminUid: string, expected: ApprovedPayout) {
  try {
    if (typeof token !== "string" || token.length > 4096) return false;
    const [body, signed, extra] = token.split(".");
    if (!body || !signed || extra) return false;
    const actual = Buffer.from(signed, "base64url"), correct = signature(body);
    if (actual.length !== correct.length || !timingSafeEqual(actual, correct)) return false;
    const value = JSON.parse(Buffer.from(body, "base64url").toString());
    return value.adminUid === adminUid && value.network === "Pi Testnet" && value.amount === "0.01" && value.expires > Date.now()
      && value.recipientUid === expected.recipientUid && value.recipientWalletAddress === expected.recipientWalletAddress && value.senderWalletAddress === expected.senderWalletAddress;
  } catch { return false; }
}
// Official backend SDK uses one native payment operation and a text payment-ID memo.
// Read only from Pi Testnet; never trust a client-supplied explorer URL or proof.
export async function verifyTestnetPayoutLedger(payment: any, txid: string) {
  if (!/^[a-f0-9]{64}$/i.test(txid)) throw new Error("Invalid Testnet transaction ID");
  const [transaction, operations] = await Promise.all([
    testnetGet(`/transactions/${txid}`), testnetGet(`/transactions/${txid}/operations?limit=2`),
  ]);
  const records = operations?._embedded?.records;
  const operation = records?.[0];
  if (transaction.hash !== txid || transaction.successful !== true || transaction.source_account !== payment.from_address
      || transaction.memo_type !== "text" || transaction.memo !== payment.identifier || transaction.operation_count !== 1
      || !Number.isSafeInteger(transaction.ledger) || !Array.isArray(records) || records.length !== 1
      || operation.type !== "payment" || operation.transaction_successful !== true || operation.transaction_hash !== txid
      || operation.asset_type !== "native" || operation.from !== payment.from_address || operation.to !== payment.to_address
      || !/^0\.0100000$/.test(operation.amount)) throw new Error("Testnet ledger proof did not match this payout");
  return { txid, ledger: transaction.ledger, verifiedAt: new Date(), network: "Pi Testnet" };
}
