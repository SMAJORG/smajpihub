import axios from "axios";
import { Keypair } from "stellar-sdk";
import { getVerifiedTestnetRecipient, makeTestnetSdk, PayoutError } from "./testnetA2U";

const horizon = "https://api.testnet.minepi.com";
const get = async (path: string) => (await axios.get(horizon + path, { timeout: 10000 })).data;

// Every remote operation here is a GET. Never create, sign, submit or complete a payment.
export async function testnetA2UPreflight(locals: any, uid: string) {
  if (!locals.testnetA2UCollection || !locals.userCollection || locals.memoryDatabase) throw new PayoutError(503, "Persistent payout database unavailable.");
  const user = await locals.userCollection.findOne({ uid });
  const recipient = await getVerifiedTestnetRecipient(user);
  if (!recipient) throw new PayoutError(422, "Recipient UID requires a fresh verified Pi login.");
  if (!/^G[A-Z2-7]{55}$/.test(recipient.walletAddress)) throw new PayoutError(422, "Recipient must sign in again and grant wallet_address consent on the Testnet app.");
  makeTestnetSdk();
  const address = Keypair.fromSecret(process.env.PI_TESTNET_WALLET_SEED!).publicKey();
  let pending;
  try {
    pending = (await axios.get("https://api.minepi.com/v2/payments/incomplete_server_payments", {
      headers: { Authorization: `Key ${process.env.PI_TESTNET_API_KEY}` }, timeout: 10000,
    })).data.incomplete_server_payments;
    if (!Array.isArray(pending)) throw new Error();
  } catch { throw new PayoutError(503, "Pi API key verification failed or Pi API unavailable."); }
  if (pending.length) throw new PayoutError(409, "App has an incomplete Pi payment; reconcile it first.");
  let account: any, ledger: any;
  try {
    [account, ledger] = await Promise.all([get(`/accounts/${address}`), get("/ledgers?order=desc&limit=1"), get(`/accounts/${recipient.walletAddress}`)]);
  } catch { throw new PayoutError(422, "Sender or recipient Testnet wallet is not activated, or Testnet API unavailable."); }
  const native = account.balances?.find((balance: any) => balance.asset_type === "native");
  const latest = ledger._embedded?.records?.[0];
  const reserve = Number(latest?.base_reserve_in_stroops) / 1e7;
  const fee = Number(latest?.base_fee_in_stroops) / 1e7;
  const minimum = (2 + Number(account.subentry_count || 0) + Number(account.num_sponsoring || 0) - Number(account.num_sponsored || 0)) * reserve;
  const spendable = Number(native?.balance) - Number(native?.selling_liabilities || 0) - minimum;
  if (!native || !Number.isFinite(spendable) || !(reserve > 0) || !(fee > 0) || spendable < 0.01 + fee) throw new PayoutError(422, "App wallet lacks spendable Test-Pi for 0.01 plus fee and reserve, or balance could not be verified.");
  const [record, lock] = await Promise.all([
    locals.testnetA2UCollection.findOne({ _id: `recipient:${uid}` }),
    locals.testnetA2UCollection.findOne({ _id: "wallet-lock" }),
  ]);
  if (record || lock) throw new PayoutError(409, "Recipient already has a payout record or wallet is locked; inspect and reconcile first.");
  return {
    checksPassed: true, paymentSent: false, network: "Pi Testnet", amount: 0.01,
    recipientUid: recipient.uid, recipientWalletAddress: recipient.walletAddress, senderWalletAddress: address,
    apiKeyAccepted: true, seedValid: true, senderFunded: true, recipientActivated: true, walletConsentVerified: true,
    connectedAppWalletMatch: "Confirm senderWalletAddress matches the connected Testnet wallet in Pi Developer Portal; read-only API cannot establish this mapping.",
  };
}
