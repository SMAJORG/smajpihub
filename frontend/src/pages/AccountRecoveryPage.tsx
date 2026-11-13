import { useEffect, useRef, useState } from "react";
import axios, { isAxiosError } from "axios";
import { getBaseURL } from "../lib/axiosClient";
import { isPiSandboxMode, withPiTimeout } from "../lib/piSdk";
import "./admin/admin-analytics.css";
import "./admin/account-recovery.css";

export default function AccountRecoveryPage() {
  const [code, setCode] = useState(() => window.location.hash.slice(1));
  const [side, setSide] = useState("original"), [sandbox, setSandbox] = useState(isPiSandboxMode);
  const [consent, setConsent] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [error, setError] = useState("");
  const inFlight = useRef(false);
  useEffect(() => { if (window.location.hash) window.history.replaceState(null, "", window.location.pathname + window.location.search); }, []);
  const verify = async () => {
    if (inFlight.current || !consent) return;
    inFlight.current = true; setBusy(true); setError(""); setMessage("");
    try {
      const sdk = window.Pi;
      if (!sdk) throw new Error("Open this page through the Pi app specified by your administrator in Pi Browser.");
      // Recovery alone may use the administrator-confirmed original app mode.
      // No global SDK configuration or payment settings are changed.
      await sdk.init({ version: "2.0", sandbox });
      const auth = await withPiTimeout(sdk.authenticate(["username"], () => undefined), 60000, "Pi sign-in timed out. Please try again.");
      const { data } = await axios.post<{ message: string }>(`${getBaseURL().replace(/\/$/, "")}/user/recovery/prove`, { recoveryCode: code.trim(), side, consent, accessToken: auth.accessToken }, { withCredentials: false, timeout: 15000 });
      setMessage(data.message);
    } catch (error) { setError(isAxiosError<{ message?: string }>(error) ? error.response?.data?.message || "Recovery could not be confirmed. Please try again." : (error as Error).message); }
    finally { inFlight.current = false; setBusy(false); }
  };
  return <main className="private-page admin-enterprise-page account-recovery"><header className="ea-page-head"><div><h1>Recover your account</h1><p>Keep your original profile, verification, seller information and account history.</p></div></header>
    <section className="ea-card recovery-card"><p>Your administrator will review your saved accounts. Sign in once through the original Pi app and once through the new Pi app. Neither sign-in creates or merges an account.</p>
      <form className="recovery-fields" onSubmit={event => { event.preventDefault(); void verify(); }}>
        <label>Recovery code<input type="password" autoComplete="off" required value={code} maxLength={64} disabled={busy} onChange={event => setCode(event.target.value)} /></label>
        <label>Current Pi app<select value={side} disabled={busy} onChange={event => setSide(event.target.value)}><option value="original">Original Testnet app</option><option value="incoming">New Mainnet app</option></select></label>
        <label className="recovery-check"><input type="checkbox" checked={sandbox} disabled={busy} onChange={event => setSandbox(event.target.checked)} /> Use Pi Sandbox only if your administrator confirms this app requires it. Testnet alone does not mean Sandbox.</label>
        <label className="recovery-check"><input type="checkbox" checked={consent} disabled={busy} onChange={event => setConsent(event.target.checked)} /> I own both Pi identities and request reconnection to my original SMAJ account. Newer records must be preserved.</label>
        <button className="ea-button" disabled={busy || !consent || !/^[a-f0-9]{64}$/.test(code.trim())}>{busy ? "Verifying with Pi…" : "Verify this Pi identity"}</button>
      </form>
      {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}<p>After both sign-ins, wait for your administrator to approve recovery, then sign in normally. Never share your password, wallet seed or access token.</p><a href="/">Return to SMAJ PI HUB</a>
    </section></main>;
}
