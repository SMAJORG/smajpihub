import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { axiosClient } from "../lib/axiosClient";
import { ensurePiInitialized, withPiTimeout } from "../lib/piSdk";
import { piSignInErrorMessage } from "../lib/piSignInErrors";
import { clearSessionCredentials } from "../lib/sessionCredentials";
import "./pi-account-link.css";

type Review = { original: { uid: string; username: string; role: string }; incoming: { uid: string; username: string }; existingSecondaryAccount: boolean };
export default function PiAccountLinkPage() {
  const [code, setCode] = useState("");
  const [issued, setIssued] = useState<{ code: string; expiresAt: string; original: Review["original"] } | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const token = useRef("");
  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true); setMessage(""); setError(false);
    try { await action(); } catch (failure) { token.current = ""; setReview(null); setError(true); setMessage(piSignInErrorMessage(failure)); }
    finally { setBusy(false); }
  };
  const authenticate = async () => {
    if (!window.Pi) throw new Error("Open this page through your SMAJ PI HUB app in Pi Browser.");
    const sdk = await ensurePiInitialized();
    return (await withPiTimeout(sdk.authenticate(["username"], () => undefined), 60000, "Pi verification timed out. Reopen this Pi app and retry.")).accessToken;
  };
  const request = async (action: string, accessToken: string, extra = {}) => (await axiosClient.post(`/user/pi-identities/${action}`, { accessToken, ...extra }, { withCredentials: false, smajSkipReadRetry: true })).data;
  return <main className="pi-account-link">
    <h1>Use your original SMAJ PI HUB account</h1>
    <p>Verify your two Pi identities once. Your original profile, seller or administrator role, products, orders and history stay with your original account.</p>
    <section aria-labelledby="link-original">
      <h2 id="link-original">1. In your original Pi app</h2>
      <p>Open this page in Pi Browser through the app where you first created your SMAJ profile. Existing Testnet users should start in their original Testnet app. Authenticate to the Pi account that owns that profile.</p>
      <button disabled={busy} onClick={() => void run(async () => { setIssued(await request("start", await authenticate())); })}>Verify original identity</button>
      {issued && <div>
        <p>Original account: <strong>{issued.original.username}</strong> ({issued.original.role})</p>
        <label htmlFor="issued-link-code">Private one-time verification code</label>
        <input id="issued-link-code" readOnly value={issued.code} autoComplete="off" spellCheck={false} />
        <p>Expires at {new Date(issued.expiresAt).toLocaleTimeString()}. Keep this page private. Copy the code only into step 2 in your paired SMAJ app. Anyone with this code can connect another Pi identity to your account. Never send it in chat or to support.</p>
      </div>}
    </section>
    <section aria-labelledby="link-second">
      <h2 id="link-second">2. In your other Pi app</h2>
      <p>Open this page through the paired app in Pi Browser: Mainnet if you started in Testnet, or Testnet if you started in Mainnet. Enter your code, then authenticate with your second identity. Changing a payment network does not switch Pi apps.</p>
      <label htmlFor="incoming-link-code">Code from your original app</label>
      <input id="incoming-link-code" type="password" value={code} autoComplete="off" spellCheck={false} disabled={busy} onChange={event => { setCode(event.target.value.trim()); setReview(null); token.current = ""; }} />
      <button disabled={busy || !/^[A-Za-z0-9_-]{43}$/.test(code)} onClick={() => void run(async () => { token.current = await authenticate(); setReview(await request("preview", token.current, { code })); })}>Verify second identity</button>
      {review && <div>
        <p>Connect <strong>{review.incoming.username || review.incoming.uid}</strong> to original account <strong>{review.original.username}</strong> ({review.original.role})?</p>
        <p>Original UID: <code>{review.original.uid}</code><br />Second UID: <code>{review.incoming.uid}</code></p>
        {review.existingSecondaryAccount && <p>A separate newer record exists. It will be retained; its records will not be merged or deleted. Future login will open your original account.</p>}
        <button disabled={busy} onClick={() => void run(async () => {
          await request("complete", token.current, { code, confirmedOriginalUid: review.original.uid });
          await clearSessionCredentials();
          token.current = ""; setCode(""); setReview(null); setIssued(null);
          setMessage("Identities connected. Sign in with Pi again to open your original account from either app.");
        })}>Confirm connection to my original account</button>
      </div>}
    </section>
    {busy && <p role="status">Verifying securely…</p>}
    {message && <p role={error ? "alert" : "status"}>{message}</p>}
    <p>New to SMAJ PI HUB? <Link to="/">Continue to normal Pi sign-in</Link>. Only existing users need to connect two identities.</p>
  </main>;
}
