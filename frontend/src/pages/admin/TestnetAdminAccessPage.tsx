import { useEffect, useState, type FormEvent } from "react";
import { isAxiosError } from "axios";
import AdminTestnetPayoutsPage from "./AdminTestnetPayoutsPage";
import { setTestnetAdminToken, testnetAdminClient, TESTNET_ADMIN_SESSION_ENDED } from "../../lib/testnetAdminClient";
import "./testnet-admin-access.css";

export default function TestnetAdminAccessPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [session, setSession] = useState<{ username: string; expiresAt: string } | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const expired = () => { setSession(null); setError("Administrator session expired. Sign in again."); };
    window.addEventListener(TESTNET_ADMIN_SESSION_ENDED, expired);
    return () => { window.removeEventListener(TESTNET_ADMIN_SESSION_ENDED, expired); setTestnetAdminToken(""); };
  }, []);
  useEffect(() => {
    if (!session) return;
    const timer = window.setTimeout(() => { setTestnetAdminToken(""); setSession(null); }, Math.max(0, Date.parse(session.expiresAt) - Date.now()));
    return () => window.clearTimeout(timer);
  }, [session]);
  const login = async (event: FormEvent) => {
    event.preventDefault();
    if (pending) return;
    setPending(true); setError("");
    try {
      const { data } = await testnetAdminClient.post("/admin/testnet/auth/login", { username, password });
      if (!/^testnet_admin\.[a-f0-9]{64}$/.test(data.token) || !Number.isFinite(Date.parse(data.expiresAt)) || data.scope !== "testnet-payouts") throw new Error("Invalid administrator session response.");
      setTestnetAdminToken(data.token);
      setSession({ username: data.username, expiresAt: data.expiresAt });
    } catch (error) {
      setError(isAxiosError(error) ? error.response?.data?.message || "Testnet administrator server is unavailable." : "Administrator login failed.");
    } finally { setPassword(""); setPending(false); }
  };
  const logout = async () => {
    setPending(true);
    try { await testnetAdminClient.post("/admin/testnet/auth/logout"); }
    finally { setTestnetAdminToken(""); setSession(null); setPending(false); }
  };
  return <div className="testnet-admin-access">
    <header><div><strong>SMAJ PI HUB</strong><span>Testnet administrator</span></div>{session && <button type="button" disabled={pending} onClick={() => void logout().catch(() => setError("Signed out locally. The remote session will expire automatically."))}>Sign out</button>}</header>
    {!session ? <main className="testnet-admin-login">
      <h1>Testnet administrator sign-in</h1>
      <p>Use your Testnet administrator credentials to access the payment dashboard.</p>
      <form onSubmit={event => void login(event)}>
        <label>Administrator username<input name="username" autoComplete="username" value={username} maxLength={100} required disabled={pending} onChange={event => setUsername(event.target.value)} /></label>
        <label>Password<input name="password" type="password" autoComplete="current-password" value={password} maxLength={1024} required disabled={pending} onChange={event => setPassword(event.target.value)} /></label>
        {error && <p role="alert">{error}</p>}
        <button type="submit" disabled={pending}>{pending ? "Signing in…" : "Sign in to Testnet dashboard"}</button>
      </form>
      <p className="testnet-admin-note">This access is limited to Testnet payments. Recipient Pi identity, wallet consent, and transaction verification are still required.</p>
    </main> : <><p className="testnet-admin-identity">Signed in as {session.username} · Test Pi only</p><AdminTestnetPayoutsPage client={testnetAdminClient} showWalletConsent={false} /></>}
  </div>;
}
