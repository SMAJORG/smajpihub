import axios from "axios";
import { Keypair } from "stellar-sdk";
import { makeTestnetSdk } from "./testnetA2U";
export const testnetGet = async (path: string) => (await axios.get("https://api.testnet.minepi.com" + path, { timeout: 10000 })).data;

export async function testnetWalletSnapshot() {
  const result = { address: "", balance: null as number | null, spendable: null as number | null, ready: false, apiKeyAccepted: false, seedValid: false, incompletePayments: 0, message: "" };
  try { makeTestnetSdk(); result.address = Keypair.fromSecret(process.env.PI_TESTNET_WALLET_SEED!).publicKey(); result.seedValid = true; }
  catch { result.message = "Configure PI_TESTNET_API_KEY and a valid PI_TESTNET_WALLET_SEED on the backend."; return result; }
  const reads = await Promise.allSettled([
    axios.get("https://api.minepi.com/v2/payments/incomplete_server_payments", { headers: { Authorization: `Key ${process.env.PI_TESTNET_API_KEY}` }, timeout: 10000 }),
    testnetGet(`/accounts/${result.address}`), testnetGet("/ledgers?order=desc&limit=1"),
  ]);
  const [api, account, ledger] = reads;
  if (api.status === "fulfilled" && Array.isArray(api.value.data.incomplete_server_payments)) {
    result.apiKeyAccepted = true; result.incompletePayments = api.value.data.incomplete_server_payments.length;
  }
  if (account.status === "fulfilled" && ledger.status === "fulfilled") {
    const native = account.value.balances?.find((entry: any) => entry.asset_type === "native");
    const latest = ledger.value._embedded?.records?.[0];
    const reserve = Number(latest?.base_reserve_in_stroops) / 1e7, fee = Number(latest?.base_fee_in_stroops) / 1e7;
    const minimum = (2 + Number(account.value.subentry_count || 0) + Number(account.value.num_sponsoring || 0) - Number(account.value.num_sponsored || 0)) * reserve;
    const balance = Number(native?.balance), spendable = balance - Number(native?.selling_liabilities || 0) - minimum;
    if (native && Number.isFinite(balance) && Number.isFinite(spendable) && reserve > 0 && fee > 0) {
      result.balance = balance; result.spendable = spendable;
      result.ready = result.apiKeyAccepted && !result.incompletePayments && spendable >= 0.01 + fee;
    }
  }
  result.message = !result.apiKeyAccepted ? "Pi API key verification failed or Pi API is unavailable."
    : result.incompletePayments ? "An incomplete Pi payment needs reconciliation."
    : result.balance === null ? "Testnet wallet is not activated or its balance is unavailable."
    : !result.ready ? "Insufficient spendable Test-Pi after fees and reserve." : "Wallet checks passed. Select a recipient to check payout readiness.";
  return result;
}
