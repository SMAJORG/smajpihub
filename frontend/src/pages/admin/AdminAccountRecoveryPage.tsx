import { useEffect, useRef, useState } from "react";
import { isAxiosError } from "axios";
import { axiosClient } from "../../lib/axiosClient";
import "./admin-analytics.css";
import "./account-recovery.css";

type Account = { accountId: string; canonicalUid: string; username?: string; piUsername?: string; createdAt?: string; role?: string; roles?: string[]; verificationStatus?: string; sellerActive?: boolean; profilePresent: Record<string, boolean>; referenceCounts: Record<string, number>; serverVerifiedPiUid?: string; lastPiLogin?: { verifiedUid?: string; configuredAppId?: string; backendPaymentNetwork?: string } };
type Inspection = { database: string; reviewHash: string; accounts: Account[]; note: string };
type Recovery = { id: string; canonicalUserId: string; canonicalUid: string; incomingUid: string; originalAppId: string; incomingAppId: string; status: string; originalVerifiedAt?: string; incomingVerifiedAt?: string; expiresAt: string };
const options = { headers: { "X-SMAJ-Silent": "true" }, smajSkipReadRetry: true };
const message = (error: unknown) => isAxiosError<{ message?: string }>(error) ? error.response?.data?.message || "Account recovery is unavailable. Please retry." : "Account recovery is unavailable. Please retry.";

export default function AdminAccountRecoveryPage() {
  const [search, setSearch] = useState(""), [report, setReport] = useState<Inspection | null>(null);
  const [requests, setRequests] = useState<Recovery[]>([]), [selected, setSelected] = useState<Recovery | null>(null);
  const [canonicalUserId, setCanonicalUserId] = useState(""), [originalUid, setOriginalUid] = useState(""), [incomingUid, setIncomingUid] = useState("");
  const [originalAppId, setOriginalAppId] = useState(""), [incomingAppId, setIncomingAppId] = useState("");
  const [reviewed, setReviewed] = useState(false), [appsVerified, setAppsVerified] = useState(false), [proofReference, setProofReference] = useState("");
  const [code, setCode] = useState(""), [error, setError] = useState(""), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const load = async () => setRequests((await axiosClient.get<{ requests: Recovery[] }>("/admin/account-recovery", options)).data.requests);
  useEffect(() => { void load().catch(error => setError(message(error))); }, []);
  const perform = async (action: () => Promise<void>) => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(""); setNotice("");
    try { await action(); } catch (error) { setError(message(error)); }
    finally { inFlight.current = false; setBusy(false); }
  };
  const resetReview = () => { setReviewed(false); setAppsVerified(false); setProofReference(""); setReport(null); };
  const inspectPair = async (original = originalUid, incoming = incomingUid) => {
    const { data } = await axiosClient.get<Inspection>("/admin/account-recovery/pair", { ...options, params: { originalUid: original, incomingUid: incoming } });
    setReport(data); setReviewed(false); return data;
  };
  const choose = (row: Recovery) => {
    setSelected(row); setCanonicalUserId(row.canonicalUserId); setOriginalUid(row.canonicalUid); setIncomingUid(row.incomingUid);
    setOriginalAppId(row.originalAppId); setIncomingAppId(row.incomingAppId); setCode(""); resetReview();
    void perform(async () => { await inspectPair(row.canonicalUid, row.incomingUid); });
  };
  const recoveryUrl = `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, "")}/account-recovery#${code}`;
  return <main className="private-page admin-enterprise-page account-recovery">
    <header className="ea-page-head"><div><h1>Account recovery</h1><p>Reconnect verified Pi identities to the original account. Preserve every profile and newer record.</p></div><button className="ea-button" disabled={busy} onClick={() => void perform(load)}>Refresh requests</button></header>
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    <section className="ea-card recovery-card"><h2>1. Inspect saved records</h2><p>Search only finds candidates. Matching usernames never establish ownership.</p>
      <form className="recovery-fields" onSubmit={event => { event.preventDefault(); setSelected(null); setCode(""); resetReview(); void perform(async () => setReport((await axiosClient.get<Inspection>("/admin/account-recovery/inspect", { ...options, params: { search } })).data)); }}>
        <label>Pi username or UID<input value={search} maxLength={200} onChange={event => setSearch(event.target.value)} required /></label><button className="ea-button" disabled={busy}>Inspect records</button>
      </form>
      {report && <><p>Database: {report.database}</p>{!report.accounts.length && <p>No saved records found. Check the original database before continuing.</p>}<div className="recovery-records">{report.accounts.map(account => <article className="recovery-record" key={account.accountId}>
        <label><input type="radio" name="canonical" checked={canonicalUserId === account.accountId} disabled={Boolean(selected) || busy} onChange={() => { setCanonicalUserId(account.accountId); setOriginalUid(account.canonicalUid); setReviewed(false); }} /> Original account: {account.piUsername || account.username}</label>
        <p>Record: <code>{account.accountId}</code><br />UID: <code>{account.canonicalUid}</code><br />Created: {account.createdAt || "Unknown"}</p>
        <p>Role: {account.role}; roles: {account.roles?.join(", ") || "None"}; seller: {account.sellerActive ? "Yes" : "No"}; verification: {account.verificationStatus || "None"}</p>
        <p>Profile: {Object.entries(account.profilePresent).filter(([, value]) => value).map(([key]) => key).join(", ") || "Incomplete"}</p>
        <p>History: {Object.entries(account.referenceCounts).map(([key, value]) => `${key}: ${value}`).join("; ")}</p>
        <p>Historical verified UID: {account.serverVerifiedPiUid || account.lastPiLogin?.verifiedUid || "Not recorded"}; configured app: {account.lastPiLogin?.configuredAppId || "Not recorded"}</p>
      </article>)}</div></>}
    </section>
    <section className="ea-card recovery-card"><h2>2. Verify both Pi identities</h2>
      <div className="recovery-fields"><label>Original account UID<input value={originalUid} readOnly /></label><label>Incoming app UID<input value={incomingUid} disabled={Boolean(selected) || busy} maxLength={200} onChange={event => { setIncomingUid(event.target.value); setReport(null); setReviewed(false); }} /></label>
        <label>Original Developer Portal app ID<input value={originalAppId} disabled={Boolean(selected) || busy} maxLength={200} onChange={event => setOriginalAppId(event.target.value)} /></label><label>Incoming Developer Portal app ID<input value={incomingAppId} disabled={Boolean(selected) || busy} maxLength={200} onChange={event => setIncomingAppId(event.target.value)} /></label>
      </div><button className="ea-button" disabled={busy || !originalUid || !incomingUid} onClick={() => void perform(async () => { await inspectPair(); })}>Inspect both UIDs together</button>
      <label className="recovery-check"><input type="checkbox" checked={reviewed} onChange={event => setReviewed(event.target.checked)} /> I inspected the original account, all newer records and their history above. Newer data must remain untouched.</label>
      {!selected && <button className="ea-button" disabled={busy || !reviewed || !report || !canonicalUserId || !originalAppId || !incomingAppId} onClick={() => void perform(async () => {
        const { data } = await axiosClient.post<{ request: Recovery; recoveryCode: string }>("/admin/account-recovery", { canonicalUserId, incomingUid, originalAppId, incomingAppId, reviewHash: report?.reviewHash, recordsReviewed: reviewed }, options);
        setSelected(data.request); setCode(data.recoveryCode); setNotice("Recovery request opened. No identity link has been created."); await load();
      })}>Open recovery request</button>}
      {code && <div className="recovery-record"><p>Share this expiring recovery code privately with the account owner. It appears here once and expires after 24 hours.</p><code>{code}</code><p><a href={recoveryUrl} target="_blank" rel="noreferrer">Open recovery page</a></p><p>Have the owner open the recovery page through each original and incoming Pi app, using this code for both sign-ins. Do not request access tokens, passwords or wallet seeds.</p></div>}
      {selected && <p>Original identity: {selected.originalVerifiedAt ? "Verified by Pi" : "Awaiting owner"}. Incoming identity: {selected.incomingVerifiedAt ? "Verified by Pi" : "Awaiting owner"}. Refresh requests and select Review to reload proof status.</p>}
    </section>
    {selected?.status === "pending" && <section className="ea-card recovery-card"><h2>3. Approve recovery</h2><p>Pi verifies each UID. You must independently confirm the owner, historical account and both app registrations; Pi /me does not attest Developer Portal app IDs.</p>
      <label className="recovery-check"><input type="checkbox" checked={appsVerified} onChange={event => setAppsVerified(event.target.checked)} /> I verified ownership of both identities, the original account history and both Developer Portal app IDs.</label>
      <label>Private evidence or support case reference<textarea maxLength={1000} value={proofReference} onChange={event => setProofReference(event.target.value)} placeholder="Reference the ownership checks; never paste credentials." /></label>
      <button className="ea-button" disabled={busy || !reviewed || !appsVerified || proofReference.trim().length < 12 || !selected.originalVerifiedAt || !selected.incomingVerifiedAt || !report} onClick={() => {
        if (!window.confirm("Approve reconnection to the original account? Newer records will remain untouched.")) return;
        void perform(async () => { const { data } = await axiosClient.post<{ message: string }>(`/admin/account-recovery/${selected.id}/approve`, { approved: true, recordsReviewed: reviewed, appIdsVerified: appsVerified, proofReference, reviewHash: report?.reviewHash }, options); setNotice(data.message); setSelected(null); setCode(""); resetReview(); await load(); });
      }}>Approve identity reconnection</button>
    </section>}
    <section className="ea-card recovery-card"><h2>Recovery requests</h2>{!requests.length && <p>No requests yet.</p>}{requests.map(row => <article className="recovery-record" key={row.id}><p>{row.canonicalUid} ← {row.incomingUid}</p><p>{row.status}; expires {new Date(row.expiresAt).toLocaleString()}; original proof: {row.originalVerifiedAt ? "Verified" : "Pending"}; incoming proof: {row.incomingVerifiedAt ? "Verified" : "Pending"}</p><button className="ea-button" disabled={busy} onClick={() => choose(row)}>Review</button></article>)}</section>
  </main>;
}
