import { useRef, useState } from "react";
import { axiosClient } from "../lib/axiosClient";
import { ensurePiInitialized, withPiTimeout } from "../lib/piSdk";
import { payoutErrorMessage } from "../pages/admin/testnetPayoutErrors";

export default function TestnetWalletConsent({ onSaved, disabled = false }: { onSaved?: () => void; disabled?: boolean }) {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [error, setError] = useState("");
  const inFlight = useRef(false);
  const verify = async () => {
    if (inFlight.current || disabled) return;
    inFlight.current = true; setBusy(true); setMessage(""); setError("");
    try {
      const sdk = await ensurePiInitialized();
      const auth = await withPiTimeout(sdk.authenticate(["username", "wallet_address"], () => undefined), 60000, "Pi sign-in timed out. Please approve wallet sharing and retry.");
      const { data } = await axiosClient.post<{ walletAddress: string; walletConsentSaved: boolean }>("/user/testnet/wallet-consent", { accessToken: auth.accessToken }, { timeout: 20000, headers: { "X-SMAJ-Silent": "true" } });
      if (!data.walletConsentSaved) throw new Error("Wallet sharing was not confirmed by the server.");
      setMessage(`Wallet sharing saved for ${data.walletAddress}. Testnet payout readiness is checked separately. No payment was sent.`);
      onSaved?.();
    } catch (error) { setError(payoutErrorMessage(error)); }
    finally { inFlight.current = false; setBusy(false); }
  };
  return <section className="private-state"><h2>Testnet wallet sharing</h2><p>Open this page through the same Testnet Pi app used for your account. Verify your own wallet sharing without signing out or sending a payment.</p><button type="button" className="private-secondary-button" disabled={busy || disabled} onClick={() => void verify()}>{busy ? "Verifying wallet sharing…" : "Verify my Testnet wallet sharing"}</button>{message && <p role="status">{message}</p>}{error && <p role="alert">{error}</p>}</section>;
}
