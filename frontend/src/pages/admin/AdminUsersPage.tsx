import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, X, UserRound, ShieldCheck, MessageSquare, Ban, Search, RefreshCw, UsersRound, Store } from "lucide-react";
import { isAxiosError } from "axios";
import { axiosClient } from "../../lib/axiosClient";
import PrivateSkeleton from "../../components/PrivateSkeleton";
import type { User } from "../../types/pi";
import "./admin-accounts.css";
import SmajVerifiedBadge from "../../components/SmajVerifiedBadge";
import type { SmajVerification } from "../../lib/smajVerification";

type Account = User & { _id: string; email?: string; lastSeenAt?: string; smajVerificationStatus?: SmajVerification["status"]; verificationExpiresAt?: string; verificationReason?: string };
type Tab = "profile" | "access" | "verification";
const name = (user: Account) => user.displayName || user.piUsername || user.username || "User account";
const apiError = (error: unknown) => isAxiosError<{ message?: string }>(error) ? error.response?.data?.message || "Request failed. Try again." : "Request failed. Try again.";

function Panel({ title, children, busy, onClose }: { title: string; children: ReactNode; busy?: boolean; onClose: () => void }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
      if (event.key !== "Tab") return;
      const elements = Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]') || []);
      const first = elements[0], last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    window.addEventListener("keydown", keydown);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", keydown); if (previousFocus?.isConnected) previousFocus.focus(); };
  }, [busy, onClose]);
  return createPortal(<div className="admin-account-overlay" onMouseDown={() => { if (!busy) onClose(); }}><section ref={ref} className="admin-account-panel" role="dialog" aria-modal="true" aria-labelledby="admin-account-panel-title" onMouseDown={event => event.stopPropagation()}><header><h2 id="admin-account-panel-title">{title}</h2><button type="button" aria-label="Close panel" disabled={busy} onClick={onClose}><X size={20} /></button></header>{children}</section></div>, document.querySelector(".admin-shell") || document.body);
}

function AccountMenu({ user, onManage, onMessage, canMessage }: { user: Account; onManage: (tab: Tab) => void; onMessage: () => void; canMessage: boolean }) {
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!position) return;
    menu.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const close = () => setPosition(null);
    const outside = (event: MouseEvent) => { if (!menu.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) close(); };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { close(); trigger.current?.focus(); }
      if (event.key === "Tab") close();
      if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault(); const items = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") || []); const index = items.indexOf(document.activeElement as HTMLButtonElement);
        items[event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
      }
    };
    document.addEventListener("mousedown", outside); window.addEventListener("keydown", key); window.addEventListener("resize", close); document.addEventListener("scroll", close, true);
    return () => { document.removeEventListener("mousedown", outside); window.removeEventListener("keydown", key); window.removeEventListener("resize", close); document.removeEventListener("scroll", close, true); };
  }, [position]);
  const choose = (action: () => void) => { setPosition(null); action(); };
  return <><button ref={trigger} className="admin-account-action-trigger" type="button" aria-label={"Actions for " + name(user)} aria-haspopup="menu" aria-expanded={Boolean(position)} onClick={() => { if (position) return setPosition(null); const rect = trigger.current!.getBoundingClientRect(); setPosition({ left: Math.max(12, Math.min(rect.right - 220, innerWidth - 232)), top: rect.bottom + 8 + 235 > innerHeight ? Math.max(12, rect.top - 243) : rect.bottom + 8 }); }}>Actions<ChevronDown size={15} /></button>{position ? createPortal(<div ref={menu} className="admin-account-menu" role="menu" aria-label={"Account actions for " + name(user)} style={position}><button role="menuitem" onClick={() => choose(() => onManage("profile"))}><UserRound size={16} />Manage account</button><button role="menuitem" onClick={() => choose(() => onManage("access"))}><Ban size={16} />Role & account access</button><button role="menuitem" onClick={() => choose(() => onManage("verification"))}><ShieldCheck size={16} />Manage verification</button><button role="menuitem" disabled={!canMessage} onClick={() => choose(onMessage)}><MessageSquare size={16} />Message user</button></div>, document.querySelector(".admin-shell") || document.body) : null}</>;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<Account[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "sellers" | "buyers" | "verified">("all");
  const [currentUid, setCurrentUid] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [selected, setSelected] = useState<Account | null>(null);
  const [tab, setTab] = useState<Tab>("profile");
  const [edit, setEdit] = useState<Account | null>(null);
  const [audience, setAudience] = useState<Account[] | null>(null);
  const [text, setText] = useState("");
  const [requestId, setRequestId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const load = useCallback(async () => {
    try { const response = await axiosClient.get<{ users: Account[]; currentUserUid: string }>("/admin/users"); setUsers(response.data.users); setCurrentUid(response.data.currentUserUid); setLoadError(""); }
    catch (error) { setLoadError(apiError(error)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const verified = (user: Account) => user.smajVerification?.status === "approved" || user.smajVerificationStatus === "approved";
  const seller = (user: Account) => user.role === "seller";
  const filteredUsers = users.filter(user => {
    const match = [name(user), user.piUsername, user.username, user.uid].some(value => String(value || "").toLowerCase().includes(query.trim().toLowerCase()));
    return match && (filter === "all" || filter === "sellers" && seller(user) || filter === "buyers" && !seller(user) || filter === "verified" && verified(user));
  });
  const recipients = Array.from(new Map(users.filter(user => user.uid && user.uid !== currentUid).map(user => [user.uid, user])).values());
  const close = useCallback(() => { setSelected(null); setEdit(null); setAudience(null); }, []);
  const manage = (user: Account, target: Tab) => { setSelected(user); setEdit({ ...user }); setTab(target); setError(""); setSuccess(""); };
  const compose = (accounts: Account[]) => { setSelected(null); setEdit(null); setAudience(accounts); setText(""); setRequestId(crypto.randomUUID()); setError(""); setSuccess(""); };
  const change = (values: Partial<Account>) => { setEdit(previous => previous ? { ...previous, ...values } : null); setSuccess(""); };
  const save = async () => {
    if (!selected || !edit || busy) return;
    setBusy(true); setError(""); setSuccess("");
    const expiration = edit.verificationExpiresAt ?? edit.smajVerification?.expiresAt?.slice(0, 10) ?? "";
    const body = tab === "profile" ? { displayName: edit.displayName || "", country: edit.country || "", email: edit.email || "", contactPhone: edit.contactPhone || "", bio: edit.bio || "" } : tab === "access" ? { role: edit.role, blocked: Boolean(edit.blocked), sellerActive: Boolean(edit.sellerActive) } : { verificationLevel: edit.verificationLevel || "basic", smajVerificationStatus: edit.smajVerificationStatus || edit.smajVerification?.status || "none", verificationExpiresAt: expiration ? `${expiration}T23:59:59.999Z` : null, verificationReason: edit.verificationReason || "Administrator account review", expectedVerificationRevision: selected.smajVerification?.revision || 0 };
    try { const response = await axiosClient.patch<{ user: Account }>("/admin/users/" + selected._id, body); setSelected(response.data.user); setEdit(response.data.user); setUsers(previous => previous.map(user => user._id === selected._id ? response.data.user : user)); window.dispatchEvent(new Event("smaj:verification-changed")); setSuccess("Account changes saved."); }
    catch (error) { setError(apiError(error)); }
    finally { setBusy(false); }
  };
  const send = async () => {
    if (!audience || busy || !text.trim() || text.trim().length > 1000) return;
    setBusy(true); setError(""); setSuccess(""); let sent = 0; const failed: Account[] = [];
    try {
      for (let offset = 0; offset < audience.length; offset += 10) {
        const batch = audience.slice(offset, offset + 10);
        try { const response = await axiosClient.post<{ results: { userId: string; sent: boolean }[] }>("/admin/users/messages", { userIds: batch.map(user => user._id), message: text.trim(), requestId }, { timeout: 60_000 }); for (const user of batch) { if (response.data.results.find(result => result.userId === user._id)?.sent) sent++; else failed.push(user); } }
        catch { failed.push(...batch); }
      }
      setSuccess("Delivered to " + sent + " account(s)."); setAudience(failed);
      if (failed.length) setError(failed.length + " account(s) could not receive the message. Retry sends only to these accounts; keep the same text.");
    } finally { setBusy(false); }
  };
  const notices = <>{error ? <p className="admin-account-notice error" role="alert">{error}</p> : null}{success ? <p className="admin-account-notice success" role="status">{success}</p> : null}</>;
  return <main className="private-page admin-accounts-page"><section className="private-page-head admin-accounts-heading"><div><h1>User accounts</h1><p>Manage community profiles, account access, verification and messages.</p></div><button className="private-primary-button" type="button" disabled={loading || !recipients.length || busy} onClick={() => compose(recipients)}><MessageSquare size={18} /> Message all users</button></section>
    <section className="admin-account-stats" aria-label="Account summary"><div><UsersRound size={22} /><strong>{users.length}</strong><span>Total users</span></div><div><ShieldCheck size={22} /><strong>{users.filter(verified).length}</strong><span>Verified</span></div><div><Store size={22} /><strong>{users.filter(seller).length}</strong><span>Sellers</span></div></section>
    <div className="admin-account-search-row"><label className="admin-account-search"><Search size={19} /><span className="sr-only">Search accounts</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search name or Pi username" /></label><button className="admin-account-refresh" type="button" disabled={loading} onClick={() => void load()}><RefreshCw size={17} /> Refresh</button></div>
    <div className="admin-account-filters" role="group" aria-label="Filter accounts">{(["all", "sellers", "buyers", "verified"] as const).map(value => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>{value === "all" ? "All" : value === "sellers" ? "Sellers" : value === "buyers" ? "Buyers" : "Verified"}</button>)}</div>
    <div className="admin-accounts-toolbar"><span>{filteredUsers.length} of {users.length} accounts</span></div>{loadError ? <p role="alert">{loadError}</p> : null}
    {loading ? <PrivateSkeleton variant="list" count={5} /> : <div className="admin-account-grid">{filteredUsers.map(user => <article className="admin-account-card" key={user._id}><div className="admin-account-card-top"><div className="admin-account-avatar" aria-hidden="true">{name(user).slice(0, 2).toUpperCase()}</div><div className="admin-account-card-identity"><button className="admin-account-name" type="button" onClick={() => manage(user, "profile")}>{name(user)} <SmajVerifiedBadge userId={user._id} /></button><small>@{user.piUsername || user.username || "Not linked"}</small></div><AccountMenu user={user} canMessage={Boolean(user.uid && user.uid !== currentUid)} onManage={target => manage(user, target)} onMessage={() => compose([user])} /></div><div className="admin-account-card-bottom"><div className="admin-account-tags"><span className="admin-account-role">{seller(user) ? "Seller" : user.role || "Buyer"}</span><span className={"admin-account-status " + (user.blocked ? "blocked" : "")}>{user.blocked ? "Blocked" : "Active"}</span><span className="admin-account-verification">{verified(user) ? "Verified" : (user.verificationStatus || "Unverified").replaceAll("_", " ")}</span></div><button className="admin-account-view" type="button" onClick={() => manage(user, "profile")}>View profile</button></div></article>)}{!filteredUsers.length ? <p className="private-state compact">{users.length ? "No accounts match your search or filter." : "No accounts yet."}</p> : null}</div>}
    {selected && edit ? <Panel title={name(selected)} busy={busy} onClose={close}><div className="admin-account-panel-body"><nav className="admin-account-tabs" aria-label="Account management">{(["profile", "access", "verification"] as const).map(value => <button type="button" key={value} disabled={busy} aria-pressed={tab === value} onClick={() => { setTab(value); setEdit({ ...selected }); setError(""); setSuccess(""); }}>{value === "profile" ? "Profile" : value === "access" ? "Account access" : "Verification"}</button>)}</nav><form id="admin-account-edit" onSubmit={event => { event.preventDefault(); void save(); }}><fieldset disabled={busy}>
      {tab === "profile" ? <><label>Display name<input required maxLength={100} value={edit.displayName || ""} onChange={event => change({ displayName: event.target.value })} /></label><label>Email<input type="email" maxLength={254} value={edit.email || ""} onChange={event => change({ email: event.target.value })} /></label><label>Country<input maxLength={100} value={edit.country || ""} onChange={event => change({ country: event.target.value })} /></label><label>Phone<input type="tel" maxLength={40} value={edit.contactPhone || ""} onChange={event => change({ contactPhone: event.target.value })} /></label><label>Bio<textarea rows={4} maxLength={1000} value={edit.bio || ""} onChange={event => change({ bio: event.target.value })} /></label><dl>{[["Pi username", selected.piUsername || selected.username], ["User ID", selected.uid], ["Account ID", selected._id], ["Joined", selected.createdAt ? new Date(selected.createdAt).toLocaleString() : "Not recorded"], ["Last seen", selected.lastSeenAt ? new Date(selected.lastSeenAt).toLocaleString() : "Not recorded"]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || "Not linked"}</dd></div>)}</dl></> : tab === "access" ? <><label>Account role<select value={edit.role || "buyer"} onChange={event => change({ role: event.target.value as Account["role"] })}><option value="buyer">Buyer</option><option value="seller">Seller</option><option value="admin">Admin</option></select></label><p>Admins can manage platform accounts and operations. Sellers can manage their seller account.</p><label className="admin-account-check"><input type="checkbox" checked={Boolean(edit.sellerActive)} onChange={event => change({ sellerActive: event.target.checked })} />Seller account enabled</label><label className="admin-account-check"><input type="checkbox" checked={Boolean(edit.blocked)} onChange={event => change({ blocked: event.target.checked })} />Block account access</label>{selected.uid === currentUid ? <p>These changes apply to your own account and can change your access.</p> : null}</> : <><label>Verification level<select value={edit.verificationLevel || "basic"} onChange={event => change({ verificationLevel: event.target.value as Account["verificationLevel"] })}><option value="basic">Basic</option><option value="pi_verified">SMAJ Verified</option><option value="seller_verified">Seller Verified</option><option value="trusted_seller">Trusted Seller</option></select></label><label>SMAJ identity verification<select value={edit.smajVerificationStatus || edit.smajVerification?.status || "none"} onChange={event => change({ smajVerificationStatus: event.target.value as SmajVerification["status"] })}><option value="none">No badge</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="suspended">Suspended</option><option value="expired">Expired</option><option value="revoked">Revoked</option></select></label><label>Expires on (end of day UTC, optional)<input type="date" value={edit.verificationExpiresAt ?? edit.smajVerification?.expiresAt?.slice(0, 10) ?? ""} onChange={event => change({ verificationExpiresAt: event.target.value })} /></label><label>Review reason<textarea maxLength={500} value={edit.verificationReason || ""} onChange={event => change({ verificationReason: event.target.value })} /></label><p>SMAJ Verified identifies the account only. Product, professional and institutional approvals are separate.</p><p>Requested level: {(selected.verificationRequestType || "none").replaceAll("_", " ")}</p></>}
    </fieldset></form>{notices}</div><footer><button type="button" disabled={busy} onClick={close}>Close</button><button className="primary" type="submit" form="admin-account-edit" disabled={busy}>{busy ? "Saving..." : "Save changes"}</button></footer></Panel> : null}
    {audience !== null ? <Panel title={audience.length === 1 ? "Message " + name(audience[0]) : "Message users"} busy={busy} onClose={close}><div className="admin-account-panel-body"><p>{audience.length ? "Send to " + audience.length + " account(s). Messages appear in their inbox and users can reply." : "Message delivery complete."}</p><label>Message<textarea rows={7} maxLength={1000} disabled={busy || !audience.length} value={text} onChange={event => setText(event.target.value)} /></label><small>{text.length}/1,000 characters</small>{notices}</div><footer><button type="button" disabled={busy} onClick={close}>Close</button><button type="button" className="primary" disabled={busy || !audience.length || !text.trim()} onClick={() => void send()}>{busy ? "Sending..." : "Send message"}</button></footer></Panel> : null}
  </main>;
}
