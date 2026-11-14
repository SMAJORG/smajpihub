import { useEffect, useRef, useState } from "react";
import { isAxiosError } from "axios";
import { axiosClient } from "../../lib/axiosClient";
import "./admin-analytics.css";
import "./account-recovery.css";

type AppIdentity = { appId: string | null; status: string; source: string | null; message: string };
type Account = { accountId: string; uid: string; username: string; displayName: string; createdAt: string | null; role: string | null; roles: string[]; sellerActive: boolean; verificationStatus: string; blocked: boolean; appIdentity?: AppIdentity };
type Incoming = { identityId: string; uid: string; username: string; verifiedAt: string; source: string; configuredAppId: string | null; oauthClientHint: string | null; networkHint: string | null; appIdentity?: AppIdentity };
type SavedAccount = { accountId: string; canonicalUid: string; username?: string; piUsername?: string; role?: string; roles?: string[]; verificationStatus?: string; sellerActive?: boolean; createdAt?: string; profilePresent: Record<string, boolean>; referenceCounts: Record<string, number> };
type Inspection = { database: string; reviewHash: string; accounts: SavedAccount[]; selection?: { original: Account; incoming: Incoming } };
type Recovery = { id: string; canonicalUserId: string; canonicalUid: string; incomingUid: string; originalAppId: string | null; incomingAppId: string | null; originalAppIdentity: AppIdentity | null; incomingAppIdentity: AppIdentity | null; status: string; originalVerifiedAt?: string; incomingVerifiedAt?: string; expiresAt: string };
type Options = { database: string; accounts: Account[]; incoming: Incoming[]; page: number; hasMore: boolean };
const options = { headers: { "X-SMAJ-Silent": "true" }, smajSkipReadRetry: true };
const message = (error: unknown) => isAxiosError<{ message?: string }>(error) ? error.response?.data?.message || "Account recovery is unavailable. Please retry." : "Account recovery is unavailable. Please retry.";
const when = (value?: string | null) => value && Number.isFinite(new Date(value).getTime()) ? new Date(value).toLocaleString() : "Not recorded";
const accountName = (account: Account) => `${account.displayName || account.username || "Saved account"} · ${when(account.createdAt)} · …${account.uid.slice(-8)}`;
function IdentityDetails({ title, uid, app }: { title: string; uid: string; app?: AppIdentity | null }) {
  return <article className="recovery-record"><h3>{title}</h3><dl className="recovery-details"><dt>Pi UID</dt><dd>{uid}</dd><dt>Recorded app label</dt><dd>{app?.appId || "Not recorded"}</dd><dt>App identity status</dt><dd>{app?.message || "Historical app identity missing. App identity verification required."}</dd>{app?.source && <><dt>Source</dt><dd>{app.source}</dd></>}</dl></article>;
}

export default function AdminAccountRecoveryPage() {
  const [search, setSearch] = useState(""), [results, setResults] = useState<Options | null>(null);
  const [original, setOriginal] = useState<Account | null>(null), [incoming, setIncoming] = useState<Incoming | null>(null);
  const [report, setReport] = useState<Inspection | null>(null), [requests, setRequests] = useState<Recovery[]>([]), [selected, setSelected] = useState<Recovery | null>(null);
  const [reviewed, setReviewed] = useState(false), [ownershipReviewed, setOwnershipReviewed] = useState(false), [proofReference, setProofReference] = useState("");
  const [step, setStep] = useState(1), [code, setCode] = useState(""), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(true), [inspecting, setInspecting] = useState(false);
  const inFlight = useRef(false);
  const loadRequests = async () => {
    const { data } = await axiosClient.get<{ requests: Recovery[] }>("/admin/account-recovery", options);
    setRequests(data.requests);
  };
  const loadOptions = async (page = 1) => setResults((await axiosClient.get<Options>("/admin/account-recovery/options", { ...options, params: { search, page } })).data);
  const perform = async (action: () => Promise<void>) => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(""); setNotice("");
    try { await action(); } catch (error) { setError(message(error)); }
    finally { inFlight.current = false; setBusy(false); }
  };
  useEffect(() => {
    let active = true;
    void Promise.all([axiosClient.get<Options>("/admin/account-recovery/options", options), axiosClient.get<{ requests: Recovery[] }>("/admin/account-recovery", options)])
      .then(([choices, cases]) => { if (active) { setResults(choices.data); setRequests(cases.data.requests); } }).catch(error => { if (active) setError(message(error)); }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, []);
  const originalId = original?.accountId, incomingId = incoming?.identityId, requestId = selected?.id;
  useEffect(() => {
    if (!originalId || !incomingId || requestId) return;
    const controller = new AbortController();
    setInspecting(true); setError("");
    void axiosClient.get<Inspection>("/admin/account-recovery/pair", { ...options, params: { canonicalUserId: originalId, incomingIdentityId: incomingId }, signal: controller.signal })
      .then(({ data }) => { if (!controller.signal.aborted) setReport(data); })
      .catch(error => { if (!controller.signal.aborted) setError(message(error)); })
      .finally(() => { if (!controller.signal.aborted) setInspecting(false); });
    return () => { controller.abort(); };
  }, [originalId, incomingId, requestId]);
  const resetReview = () => { setReport(null); setReviewed(false); setOwnershipReviewed(false); setProofReference(""); setError(""); };
  const startNew = () => { setSelected(null); setOriginal(null); setIncoming(null); setCode(""); setNotice(""); setStep(1); resetReview(); setInspecting(false); };
  const reviewCase = async (id: string, refresh = false) => {
    const { data } = await axiosClient.get<{ request: Recovery; report: Inspection }>(`/admin/account-recovery/${id}/review`, options);
    if (!refresh) { setCode(""); setReviewed(false); setOwnershipReviewed(false); setProofReference(""); setStep(1); }
    else if (report?.reviewHash !== data.report.reviewHash) setReviewed(false);
    setSelected(data.request); setReport(data.report); setOriginal(data.report.selection?.original || null); setIncoming(data.report.selection?.incoming || null); await loadRequests();
  };
  const originalApp = report?.selection?.original.appIdentity || selected?.originalAppIdentity;
  const incomingApp = report?.selection?.incoming.appIdentity || selected?.incomingAppIdentity;
  const originalUid = original?.uid || selected?.canonicalUid || "", incomingUid = incoming?.uid || selected?.incomingUid || "";
  // Legacy cases retain their stored app labels, explicitly labelled as admin records.
  const legacyApp = (id: string | null | undefined): AppIdentity | null => id ? { appId: id, status: "recorded_configuration", source: "Legacy administrator-reviewed recovery record; not attested by Pi", message: "Administrator verification required." } : null;
  const originalDetails = originalApp || legacyApp(selected?.originalAppId), incomingDetails = incomingApp || legacyApp(selected?.incomingAppId);
  const appHistoryReady = Boolean(originalDetails?.appId && incomingDetails?.appId && originalDetails.appId !== incomingDetails.appId);
  const proofsReady = Boolean(selected?.originalVerifiedAt && selected?.incomingVerifiedAt);
  const pending = selected?.status === "pending" && new Date(selected.expiresAt).getTime() > Date.now();
  const locked = busy || inspecting;
  const accountChoices = original && !results?.accounts.some(row => row.accountId === original.accountId) ? [original, ...(results?.accounts || [])] : results?.accounts || [];
  const incomingChoices = incoming && !results?.incoming.some(row => row.identityId === incoming.identityId) ? [incoming, ...(results?.incoming || [])] : results?.incoming || [];
  const recoveryUrl = `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, "")}/account-recovery#${code}`;
  return <main className="private-page admin-enterprise-page account-recovery">
    <header className="ea-page-head"><div><h1>Account recovery</h1><p>Select saved accounts, verify ownership, then approve access to the original profile.</p></div><button className="ea-button" disabled={locked} onClick={startNew}>Start another recovery</button></header>
    {error && <p className="recovery-status" role="alert">{error}</p>}{notice && <p className="recovery-status" role="status">{notice}</p>}
    <nav aria-label="Recovery steps"><ol className="recovery-steps">{["Review", "Verify Ownership", "Approve Recovery"].map((title, index) => <li key={title}><button className="ea-button" aria-current={step === index + 1 ? "step" : undefined} disabled={locked || (index > 0 && !selected)} onClick={() => setStep(index + 1)}>{index + 1}. {title}</button></li>)}</ol></nav>
    {step === 1 && <section className="ea-card recovery-card"><h2>Review accounts</h2><p>Account details come from MongoDB. Incoming choices come only from server-verified Pi logins. Names help find records and never establish ownership.</p>
      {!selected && <><form className="recovery-fields" onSubmit={event => { event.preventDefault(); void perform(() => loadOptions()); }}><label>Find accounts by name<input value={search} maxLength={200} disabled={locked} onChange={event => setSearch(event.target.value)} placeholder="Search Pi username or display name" /></label><button className="ea-button" disabled={locked}>Find accounts</button></form>
        <div className="recovery-fields"><label>Original account<select value={original?.accountId || ""} disabled={locked} onChange={event => { resetReview(); setOriginal(accountChoices.find(row => row.accountId === event.target.value) || null); }}><option value="">Select the original saved account</option>{accountChoices.map(row => <option key={row.accountId} value={row.accountId} disabled={row.blocked || !row.uid}>{accountName(row)}{row.blocked ? " · Blocked" : !row.uid ? " · Pi UID missing" : ""}</option>)}</select></label>
          <label>Verified incoming account<select value={incoming?.identityId || ""} disabled={locked} onChange={event => { resetReview(); setIncoming(incomingChoices.find(row => row.identityId === event.target.value) || null); }}><option value="">Select a verified incoming login</option>{incomingChoices.map(row => <option key={row.identityId} value={row.identityId} disabled={row.uid === original?.uid}>{row.username || "Pi user"} · …{row.uid.slice(-8)} · {row.configuredAppId || "App history missing"}</option>)}</select></label></div>
        {!incomingChoices.length && <p className="recovery-status">No verified incoming login found. Ask the owner to sign in through the new Pi app, then refresh this list. A blocked sign-in still records the verified identity without creating an account.</p>}
        <div className="recovery-actions"><button className="ea-button" disabled={locked || !results || results.page <= 1} onClick={() => void perform(() => loadOptions((results?.page || 1) - 1))}>Previous accounts</button><span>Page {results?.page || 1}</span><button className="ea-button" disabled={locked || !results?.hasMore} onClick={() => void perform(() => loadOptions((results?.page || 1) + 1))}>More accounts</button></div>
      </>}
      {original && <article className="recovery-record"><h3>Original profile to preserve</h3><p>{original.displayName || original.username} · created {when(original.createdAt)}</p><p>Role: {original.role || "Not recorded"}; roles: {original.roles.join(", ") || "Not recorded"}; verification: {original.verificationStatus}; seller: {original.sellerActive ? "Yes" : "No"}</p></article>}
      {incoming && <article className="recovery-record"><h3>Incoming login</h3><p>{incoming.username || "Pi user"} · verified {when(incoming.verifiedAt)}</p><p>Source: {incoming.source}</p>{incoming.oauthClientHint && <p>Recorded OAuth client hint (not app identity proof): {incoming.oauthClientHint}</p>}{incoming.networkHint && <p>Backend payment network at login (not identity proof): {incoming.networkHint}</p>}</article>}
      {inspecting && <p role="status">Retrieving identity and account history…</p>}
      {report && <><p>Database: {report.database}</p><div className="recovery-records"><IdentityDetails title="Original identity" uid={originalUid} app={originalDetails} /><IdentityDetails title="Incoming identity" uid={incomingUid} app={incomingDetails} /></div>
        {!appHistoryReady && <p className="recovery-status">App identity verification required. Missing or conflicting history is never invented. Ownership checks can continue, but approval stays blocked until verified app history is available in the backend records.</p>}
        <div className="recovery-records">{report.accounts.map(row => <article className="recovery-record" key={row.accountId}><h3>{row.piUsername || row.username || "Saved account"}</h3><p>Record: {row.accountId}</p><p>UID: {row.canonicalUid}</p><p>Created: {when(row.createdAt)}; role: {row.role}; roles: {row.roles?.join(", ") || "Not recorded"}; verification: {row.verificationStatus || "none"}; seller: {row.sellerActive ? "Yes" : "No"}</p><p>Profile fields: {Object.entries(row.profilePresent).filter(([, value]) => value).map(([key]) => key).join(", ") || "Incomplete"}</p><p>History: {Object.entries(row.referenceCounts).map(([key, value]) => `${key}: ${value}`).join("; ")}</p></article>)}</div>
        <label className="recovery-check"><input type="checkbox" checked={reviewed} disabled={locked} onChange={event => setReviewed(event.target.checked)} /> I reviewed the original account and all newer records. Preserve every record and its data.</label>
        <button className="ea-button" disabled={locked || !reviewed || Boolean(selected && !pending)} onClick={() => selected ? setStep(2) : void perform(async () => {
          const { data } = await axiosClient.post<{ request: Recovery; recoveryCode: string }>("/admin/account-recovery", { canonicalUserId: original?.accountId, incomingIdentityId: incoming?.identityId, recordsReviewed: reviewed, reviewHash: report.reviewHash }, options);
          setSelected(data.request); setCode(data.recoveryCode); setStep(2); setInspecting(false); await loadRequests();
        })}>Continue to Verify Ownership</button>
      </>}
    </section>}
    {step === 2 && selected && <section className="ea-card recovery-card"><h2>Verify ownership</h2><p>The owner must verify both Pi identities. No identity link is created at this step.</p><div className="recovery-records"><article className="recovery-record"><h3>Original identity</h3><p>{selected.originalVerifiedAt ? `Verified ${when(selected.originalVerifiedAt)}` : "Waiting for owner verification"}</p></article><article className="recovery-record"><h3>Incoming identity</h3><p>{selected.incomingVerifiedAt ? `Verified ${when(selected.incomingVerifiedAt)}` : "Waiting for owner verification"}</p></article></div>
      {code && <div className="recovery-record"><p>Privately share this recovery link or code with the owner. It expires {when(selected.expiresAt)}.</p><code>{code}</code><p><a className="ea-button" href={recoveryUrl} target="_blank" rel="noreferrer">Open owner verification</a></p></div>}
      {!code && !proofsReady && <p>The private code was shown when this request was opened. If it is unavailable, start another reviewed recovery.</p>}
      <p>Have the owner open the recovery page through the original Pi app and then the new Pi app, using the same recovery code. Do not ask for their Pi access tokens or wallet seed.</p>
      {!pending && <p className="recovery-status">This request is {selected.status === "pending" ? "expired" : selected.status}. {selected.status !== "approved" && "Start another reviewed recovery."}</p>}
      <div className="recovery-actions"><button className="ea-button" disabled={locked} onClick={() => void perform(() => reviewCase(selected.id, true))}>Refresh ownership status</button><button className="ea-button" disabled={locked || !proofsReady || !pending} onClick={() => setStep(3)}>Continue to Approve Recovery</button></div>
    </section>}
    {step === 3 && selected && <section className="ea-card recovery-card"><h2>Approve recovery</h2><div className="recovery-records"><IdentityDetails title="Original identity" uid={originalUid} app={originalDetails} /><IdentityDetails title="Incoming identity" uid={incomingUid} app={incomingDetails} /></div>
      {!appHistoryReady && <p className="recovery-status" role="status">App identity verification required. Approval is unavailable until missing or conflicting app history is verified. No manual UID or app-ID entry is required in this form.</p>}
      {!proofsReady && <p>Both owner verifications are required before approval.</p>}{!reviewed && <p>Return to Review to confirm the current saved records.</p>}
      <label className="recovery-check"><input type="checkbox" checked={ownershipReviewed} disabled={locked || !appHistoryReady} onChange={event => setOwnershipReviewed(event.target.checked)} /> I independently verified both identities belong to this owner, the original account history, and the recorded app registrations.</label>
      <label>Private evidence or support case reference<textarea disabled={locked} maxLength={1000} value={proofReference} onChange={event => setProofReference(event.target.value)} placeholder="Reference ownership checks; never paste credentials." /></label>
      <button className="ea-button" disabled={locked || !pending || !reviewed || !appHistoryReady || !proofsReady || !ownershipReviewed || proofReference.trim().length < 12 || !report} onClick={() => {
        if (!window.confirm("Approve access to the original account? All original and newer records will remain preserved.")) return;
        void perform(async () => { const { data } = await axiosClient.post<{ message: string }>(`/admin/account-recovery/${selected.id}/approve`, { approved: true, recordsReviewed: reviewed, appIdsVerified: ownershipReviewed, proofReference, reviewHash: report?.reviewHash }, options); setNotice(data.message); setSelected({ ...selected, status: "approved" }); setCode(""); await loadRequests(); });
      }}>Approve Recovery</button>
    </section>}
    <section className="ea-card recovery-card"><header className="recovery-actions"><h2>Recovery requests</h2><button className="ea-button" disabled={locked} onClick={() => void perform(loadRequests)}>Refresh requests</button></header>{!requests.length && <p>No requests yet.</p>}{requests.map(row => <article className="recovery-record" key={row.id}><p>Original …{row.canonicalUid.slice(-8)} ← incoming …{row.incomingUid.slice(-8)}</p><p>{row.status}; expires {when(row.expiresAt)}; original ownership: {row.originalVerifiedAt ? "Verified" : "Pending"}; incoming ownership: {row.incomingVerifiedAt ? "Verified" : "Pending"}</p><button className="ea-button" disabled={locked} onClick={() => void perform(() => reviewCase(row.id))}>Review request</button></article>)}</section>
  </main>;
}
