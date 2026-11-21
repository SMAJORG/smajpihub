import axios from "axios";
import { createPrivateKey, createPublicKey } from "node:crypto";

// Stellar StrKey encoding without loading stellar-sdk native dependencies.
const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function decodeBase32(value: string): Buffer {
  let bits = 0, accumulator = 0;
  const output: number[] = [];
  for (const char of value) {
    const digit = alphabet.indexOf(char);
    if (digit < 0) throw new Error("Invalid StrKey character");
    accumulator = (accumulator << 5) | digit;
    bits += 5;
    if (bits >= 8) { bits -= 8; output.push((accumulator >>> bits) & 255); }
  }
  if (bits && (accumulator & ((1 << bits) - 1))) throw new Error("Invalid StrKey padding");
  return Buffer.from(output);
}
function encodeBase32(data: Buffer): string {
  let bits = 0, accumulator = 0, output = "";
  for (const byte of data) {
    accumulator = (accumulator << 8) | byte;
    bits += 8;
    while (bits >= 5) { bits -= 5; output += alphabet[(accumulator >>> bits) & 31]; }
  }
  if (bits) output += alphabet[(accumulator << (5 - bits)) & 31];
  return output;
}
function crc16(data: Buffer): number {
  let crc = 0;
  for (const byte of data) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc;
}
function walletPublicKey(secret: string): string {
  if (!/^S[A-Z2-7]{55}$/.test(secret)) throw new Error("Invalid secret format");
  const decoded = decodeBase32(secret);
  if (decoded.length !== 35 || decoded[0] !== 0x90 || decoded.readUInt16LE(33) !== crc16(decoded.subarray(0, 33))) throw new Error("Invalid secret checksum");
  const pkcs8 = Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), decoded.subarray(1, 33)]);
  const publicDer = createPublicKey(createPrivateKey({ key: pkcs8, format: "der", type: "pkcs8" })).export({ format: "der", type: "spki" }) as Buffer;
  const raw = Buffer.concat([Buffer.from([0x30]), publicDer.subarray(-32)]);
  const checksum = crc16(raw);
  return encodeBase32(Buffer.concat([raw, Buffer.from([checksum & 255, checksum >>> 8])]));
}
export const testnetGet = async (path: string) => (await axios.get("https://api.testnet.minepi.com" + path, { timeout: 10000 })).data;
export async function testnetWalletSnapshot() {
  const result = { address: "", balance: null as number | null, spendable: null as number | null, ready: false, apiKeyAccepted: false, seedValid: false, incompletePayments: 0, message: "", code: "wallet_not_ready", apiStatus: null as number | null, seedConfigured: Boolean(process.env.PI_TESTNET_WALLET_SEED), apiKeyConfigured: Boolean(process.env.PI_TESTNET_API_KEY) };
  try { result.address = walletPublicKey(process.env.PI_TESTNET_WALLET_SEED || ""); result.seedValid = true; }
  catch { result.message = "PI_TESTNET_WALLET_SEED is missing or invalid. Use the connected wallet's 56-character secret seed starting with S, not its passphrase."; result.code = "testnet_seed_invalid"; return result; }
  if (!result.apiKeyConfigured) { result.message = "PI_TESTNET_API_KEY is missing. Store recovery uses a separate PI_API_KEY; the two settings are not interchangeable."; result.code = "testnet_api_key_missing"; return result; }
  const [api, account, ledger] = await Promise.allSettled([
    axios.get("https://api.minepi.com/v2/payments/incomplete_server_payments", { headers: { Authorization: `Key ${process.env.PI_TESTNET_API_KEY}` }, timeout: 10000 }),
    testnetGet(`/accounts/${result.address}`), testnetGet("/ledgers?order=desc&limit=1"),
  ]);
  if (api.status === "fulfilled" && Array.isArray(api.value.data.incomplete_server_payments)) {
    result.apiStatus = api.value.status || 200; result.apiKeyAccepted = true; result.incompletePayments = api.value.data.incomplete_server_payments.length;
  } else if (api.status === "rejected" && axios.isAxiosError(api.reason)) result.apiStatus = api.reason.response?.status || null;
  if (account.status === "fulfilled" && ledger.status === "fulfilled") {
    const native = account.value.balances?.find((entry: any) => entry.asset_type === "native");
    const latest = ledger.value._embedded?.records?.[0];
    const reserve = Number(latest?.base_reserve_in_stroops) / 1e7, fee = Number(latest?.base_fee_in_stroops) / 1e7;
    const minimum = (2 + Number(account.value.subentry_count || 0) + Number(account.value.num_sponsoring || 0) - Number(account.value.num_sponsored || 0)) * reserve;
    const balance = Number(native?.balance), spendable = balance - Number(native?.selling_liabilities || 0) - minimum;
    if (native && Number.isFinite(balance) && Number.isFinite(spendable) && reserve > 0 && fee > 0) { result.balance = balance; result.spendable = spendable; result.ready = result.apiKeyAccepted && !result.incompletePayments && spendable >= 0.01 + fee; }
  }
  result.code = !result.apiKeyAccepted ? result.apiStatus === 401 ? "testnet_api_key_rejected" : result.apiStatus === 403 ? "testnet_api_permission_denied" : "pi_api_unavailable" : result.incompletePayments ? "incomplete_payment" : result.balance === null ? "testnet_account_unavailable" : !result.ready ? "insufficient_test_pi" : "ready";
  result.message = result.code === "testnet_api_key_rejected" ? "Pi rejected PI_TESTNET_API_KEY (HTTP 401). Verify the Testnet app's server API key in Render; do not use a user access token."
    : result.code === "testnet_api_permission_denied" ? "Pi denied the Testnet app API request (HTTP 403). Check the app's A2U permissions in Pi Developer Portal."
    : !result.apiKeyAccepted ? "The Pi app API could not be verified. Check Pi API availability and the Testnet API key."
    : result.incompletePayments ? "An incomplete Pi payment needs reconciliation."
    : result.balance === null ? "Testnet wallet is not activated or its balance is unavailable."
    : !result.ready ? "Insufficient spendable Test-Pi after fees and reserve." : "Wallet checks passed. Select a recipient to check payout readiness.";
  return result;
}
