import { useCallback, useEffect, useRef, useState } from "react";
import { isAxiosError } from "axios";
import { axiosClient } from "../../lib/axiosClient";
import "./admin-analytics.css";
import "./testnet-payouts.css";

type Recipient = { uid: string; username: string; displayName: string; walletAddress: string; canReceive: boolean; status: string };
type Payment = { recipientUid: string; recipientWalletAddress?: string; amount: number; status: string; paymentId?: string; txid?: string; createdAt?: string };
type Snapshot = { wallet: { address: string; balance: number | null; spendable: number | null; ready: boolean; message: string }; records: Payment[]; successfulUniqueWallets: number; walletLocked: boolean; hasMore: boolean; appWalletConnection: string };
type Check = { checksPassed: boolean; recipientWalletAddress: string; senderWalletAddress: string };
const options = { timeout: 90000, smajSkipReadRetry: true, headers: { "X-SMAJ-Silent": "true" } };
const messageFor = (error: unknown) => isAxiosError<{ message?: string }>(error) ? error.response?.data?.message || "The request could not be confirmed. Refresh the records before taking further action." : "Payout service is unavailable.";
const amount = (value: number | null) => value === null ? "Unavailable" : `${value.toLocaleString(undefined, { maximumFractionDigits: 7 })} Test-Pi`;

export default function AdminTestnetPayoutsPage() {
  const [data, setData] = useState<Snapshot | null>(null), [recipients, setRecipients] = useState<Recipient[]>([]);
  const [page, setPage] = useState(1), [recipientPage, setRecipientPage] = useState(1), [moreRecipients, setMoreRecipients] = useState(false);
  const [search, setSearch] = useState(""), [query, setQuery] = useState("");
  const [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false), [usersLoading, setUsersLoading] = useState(false);
  const [selected, setSelected] = useState<Recipient | null>(null), [check, setCheck] = useState<Check | null>(null), [checking, setChecking] = useState(false);
  const [sending, setSending] = useState(false), [confirmedWallet, setConfirmedWallet] = useState(false), [dialogOpen, setDialogOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null), inFlight = useRef(false), selectionVersion = useRef(0);
  const load = useCallback(async () => {
    setLoading(true);
    try { const response = await axiosClient.get<Snapshot>("/admin/testnet/a2u/dashboard", { ...options, params: { page } }); setData(response.data); }
    catch (error) { setError(messageFor(error)); setData(null); }
    finally { setLoading(false); }
  }, [page]);
  const loadRecipients = useCallback(async () => {
    setUsersLoading(true);
    try {
      const response = await axiosClient.get<{ recipients: Recipient[]; hasMore: boolean }>("/admin/testnet/a2u/recipients", { ...options, params: { page: recipientPage, search: query } });
      setRecipients(response.data.recipients); setMoreRecipients(response.data.hasMore);
    } catch (error) { setError(messageFor(error)); setRecipients([]); }
    finally { setUsersLoading(false); }
  }, [recipientPage, query]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void loadRecipients(); }, [loadRecipients]);
  useEffect(() => { if (dialogOpen) dialog.current?.showModal(); else dialog.current?.close(); }, [dialogOpen]);
  const select = async (recipient: Recipient) => {
    const version = ++selectionVersion.current;
    setSelected(recipient); setCheck(null); setChecking(true); setError(""); setNotice("");
    try {
      const response = await axiosClient.get<Check>("/admin/testnet/a2u/preflight", { ...options, params: { uid: recipient.uid } });
      if (version === selectionVersion.current) setCheck(response.data);
    } catch (error) { if (version === selectionVersion.current) setError(messageFor(error)); }
    finally { if (version === selectionVersion.current) setChecking(false); }
  };
  const send = async () => {
    if (inFlight.current || !selected || !check?.checksPassed || !confirmedWallet) return;
    inFlight.current = true; setSending(true); setError("");
    try {
      const response = await axiosClient.post<{ payout: Payment }>("/admin/testnet/a2u", { uid: selected.uid, recipientWalletAddress: check.recipientWalletAddress, senderWalletAddress: check.senderWalletAddress }, options);
      if (response.data.payout.status !== "completed") throw new Error("Completion not confirmed");
      setNotice(`0.01 Test-Pi sent successfully. Payment ID: ${response.data.payout.paymentId}`);
    } catch (error) { setError(`${messageFor(error)} Do not resend an uncertain payment; check its recorded status.`); }
    finally {
      setCheck(null); setSelected(null); setDialogOpen(false); setSending(false); inFlight.current = false;
      void load(); void loadRecipients();
    }
  };
  const ready = Boolean(data?.wallet.ready && !data.walletLocked && selected?.canReceive && check?.checksPassed && !checking && !loading && !sending);
  return <main className="private-page admin-enterprise-page testnet-payouts">
    <header className="ea-page-head"><div><p className="ea-eyebrow">SMAJ PI HUB / PI PAYMENTS</p><h1>Testnet Payouts</h1><p>Send 0.01 Test-Pi to a verified Pi user.</p></div><button className="ea-button" disabled={loading || sending || usersLoading} onClick={() => { ++selectionVersion.current; setSelected(null); setCheck(null); setChecking(false); setError(""); void load(); void loadRecipients(); }}>Refresh</button></header>
    {error && <p className="tp-alert" role="alert">{error}</p>}{notice && <p className="tp-notice" role="status">{notice}</p>}
    {!data && loading && <p role="status">Checking Testnet wallet…</p>}
    {data && <>
      <section className="tp-summary" aria-label="Wallet and payment progress"><article className="ea-card tp-card"><h2>Testnet app wallet</h2><span className="tp-badge">{data.walletLocked ? "Reconciliation required" : data.wallet.ready ? "Wallet checks passed" : "Not ready"}</span><p>{data.wallet.message}</p><dl><dt>Configured wallet address</dt><dd className="tp-address">{data.wallet.address || "Not configured"}</dd><dt>Balance</dt><dd>{amount(data.wallet.balance)}</dd><dt>Available after reserve</dt><dd>{amount(data.wallet.spendable)}</dd></dl><p className="tp-hint">{data.appWalletConnection}</p></article>
      <article className="ea-card tp-card"><h2>Five-wallet goal</h2><strong className="tp-progress-count">{Math.min(5, data.successfulUniqueWallets)} / 5</strong><progress aria-label="Successful unique wallet payments" value={Math.min(5, data.successfulUniqueWallets)} max={5} /><p>{data.successfulUniqueWallets} unique wallets have received a verified successful payment.</p><p className="tp-hint">Each wallet counts once. Pending or failed payments do not count.</p></article></section>
    </>}
    <section className="ea-card tp-card"><h2>Select a recipient</h2><p>Users with a current Pi login and approved wallet sharing. Readiness is checked again before sending.</p>
      <form className="tp-search" onSubmit={event => { event.preventDefault(); ++selectionVersion.current; setSelected(null); setCheck(null); setRecipientPage(1); setQuery(search); }}><label>Find a user<input value={search} maxLength={80} onChange={event => setSearch(event.target.value)} placeholder="Name, Pi username or UID" /></label><button className="ea-button" disabled={sending}>Search</button></form>
      {usersLoading ? <p role="status">Verifying users and wallet consent…</p> : <div className="tp-recipients">{recipients.map(recipient => <button className="tp-recipient" key={recipient.uid} disabled={!recipient.canReceive || sending} aria-pressed={selected?.uid === recipient.uid} onClick={() => void select(recipient)}><strong>{recipient.displayName}</strong><span>@{recipient.username}</span><small className="tp-address">{recipient.walletAddress}</small><small>{recipient.canReceive ? "Select recipient" : "Already paid or reserved"}</small></button>)}{!recipients.length && <p>No eligible users on this page. Ask the recipient to sign out and sign in through this Testnet app, approving wallet sharing. Check other pages or search by username.</p>}</div>}
      <nav className="tp-pagination" aria-label="Recipient pages"><button className="ea-button" disabled={recipientPage <= 1 || usersLoading || sending} onClick={() => setRecipientPage(value => value - 1)}>Previous users</button><span>Page {recipientPage}</span><button className="ea-button" disabled={!moreRecipients || usersLoading || sending} onClick={() => setRecipientPage(value => value + 1)}>Next users</button></nav>
      {selected && <div className="tp-selected"><strong>Recipient: {selected.displayName}</strong><p className="tp-address">{check?.recipientWalletAddress || selected.walletAddress}</p><p role="status">{checking ? "Checking recipient readiness…" : check?.checksPassed ? "Recipient checks passed" : "Recipient is not ready"}</p></div>}
      <button className="private-primary-button tp-send" disabled={!ready} onClick={() => { setConfirmedWallet(false); setDialogOpen(true); }}>Send 0.01 Test-Pi</button>
    </section>
    <section className="ea-card tp-card"><h2>Payment history</h2>{data?.records.length ? <div className="tp-history">{data.records.map((record, index) => <article key={record.paymentId || record.recipientUid + index}><header><strong>0.01 Test-Pi</strong><span className="tp-badge">{record.status.replaceAll("_", " ")}</span></header><dl><dt>Recipient UID</dt><dd>{record.recipientUid}</dd><dt>Wallet address</dt><dd>{record.recipientWalletAddress || "Awaiting verification"}</dd><dt>Payment ID</dt><dd>{record.paymentId || "Not assigned"}</dd><dt>Transaction ID</dt><dd>{record.txid || "Not submitted"}</dd><dt>Created</dt><dd>{record.createdAt ? new Date(record.createdAt).toLocaleString() : "Unavailable"}</dd></dl></article>)}</div> : <p>No payments recorded on this page.</p>}<nav className="tp-pagination" aria-label="Payment history pages"><button className="ea-button" disabled={page <= 1 || loading || sending} onClick={() => setPage(value => value - 1)}>Previous payments</button><span>Page {page}</span><button className="ea-button" disabled={!data?.hasMore || loading || sending} onClick={() => setPage(value => value + 1)}>Next payments</button></nav></section>
    <dialog ref={dialog} className="tp-dialog" aria-labelledby="tp-confirm-title" onCancel={event => { if (sending) event.preventDefault(); else setDialogOpen(false); }} onClose={() => { if (!sending) setDialogOpen(false); }}><h2 id="tp-confirm-title">Confirm Testnet payout</h2><p>Send <strong>0.01 Test-Pi</strong> to <strong>{selected?.displayName}</strong>?</p><dl><dt>Recipient wallet</dt><dd>{check?.recipientWalletAddress}</dd><dt>App wallet</dt><dd>{check?.senderWalletAddress}</dd></dl><label className="tp-confirm"><input type="checkbox" checked={confirmedWallet} disabled={sending} onChange={event => setConfirmedWallet(event.target.checked)} />I confirm the app wallet matches the connected Testnet wallet in Pi Developer Portal.</label><p>This transfer cannot be reversed after submission.</p><footer><button className="ea-button" disabled={sending} onClick={() => setDialogOpen(false)}>Cancel</button><button className="private-primary-button" disabled={!confirmedWallet || sending} onClick={() => void send()}>{sending ? "Sending…" : "Confirm and send 0.01 Test-Pi"}</button></footer></dialog>
  </main>;
}
