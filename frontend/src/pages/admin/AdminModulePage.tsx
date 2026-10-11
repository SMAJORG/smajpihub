import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import DownloadOutlinedIcon from "@mui/icons-material/DownloadOutlined";
import { adminNavigation } from "../../content/adminNavigation";
import { axiosClient } from "../../lib/axiosClient";

type LiveRecord = { id: string; title: string; subtitle: string; status: string; updatedAt: string; href: string };
type AdminStats = Record<string, number>;
type ApiRow = Record<string, unknown>;

const text = (value: unknown) => typeof value === "string" ? value : typeof value === "number" ? String(value) : "";
const dateText = (value: unknown) => {
  const valueText = text(value);
  if (!valueText) return "Not available";
  const date = new Date(valueText);
  return Number.isNaN(date.getTime()) ? valueText : date.toLocaleString();
};

const AdminModulePage = () => {
  const location = useLocation();
  const group = adminNavigation.find((entry) => entry.items.some((item) => item.to === location.pathname));
  const item = group?.items.find((entry) => entry.to === location.pathname);
  const [records, setRecords] = useState<LiveRecord[]>([]);
  const [stats, setStats] = useState<AdminStats>({});
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!group || !item) return;
    setLoading(true);
    setError("");
    if ((group.number >= 6 && group.number <= 19) || item.label === "Fraud Alerts") {
      setRecords([]); setLoading(false); setError("This module requires its own admin management API. No unrelated platform records are shown."); return;
    }
    const storeOrders = group.number === 5 && ["Orders", "Payments", "Disputes"].includes(item.label);
    const source = group.number === 2
      ? { endpoint: "/admin/users", key: "users", href: "/admin/users" }
      : group.number === 3 || storeOrders
        ? { endpoint: "/admin/orders", key: "orders", href: "/admin/orders" }
        : group.number === 5
          ? { endpoint: "/admin/products", key: "products", href: "/admin/products" }
          : group.number === 20
            ? { endpoint: "/admin/reports", key: "reports", href: "/admin/reports" }
            : { endpoint: "/admin/activity", key: "activity", href: location.pathname };
    const [statsResult, recordsResult] = await Promise.all([
      axiosClient.get<{ stats: AdminStats }>("/admin/stats").catch(() => null),
      axiosClient.get<Record<string, unknown>>(source.endpoint).catch(() => null),
    ]);
    if (statsResult?.data.stats) setStats(statsResult.data.stats);
    if (!recordsResult) {
      setRecords([]);
      setError("Live records are temporarily unavailable. Use Refresh to try again.");
      setLoading(false);
      return;
    }
    const raw = recordsResult.data[source.key];
    const rows = Array.isArray(raw) ? raw as ApiRow[] : [];
    setRecords(rows.map((row, index) => {
      const rowStatus = text(row.status || row.paymentStatus || row.reviewStatus || row.verificationStatus) || (row.resolved === true ? "resolved" : row.blocked === true ? "blocked" : "active");
      return {
        id: text(row._id || row.uid || row.id) || String(index),
        title: text(row.displayName || row.productTitle || row.title || row.label || row.reason) || item.label + " record",
        subtitle: text(row.piUsername || row.sellerName || row.description || row.details || row.type) || group.label,
        status: rowStatus,
        updatedAt: dateText(row.updatedAt || row.createdAt || row.paidAt),
        href: source.href,
      };
    }));
    setLoading(false);
  }, [group, item, location.pathname]);

  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(initial);
  }, [load]);

  const statuses = useMemo(() => [...new Set(records.map((record) => record.status))], [records]);
  const visible = useMemo(() => records.filter((record) => {
    const matchesSearch = !query.trim() || [record.title, record.subtitle, record.status].some((value) => value.toLowerCase().includes(query.trim().toLowerCase()));
    return matchesSearch && (status === "all" || record.status === status);
  }), [query, records, status]);
  const attentionCount = records.filter((record) => ["pending", "failed", "blocked", "open", "rejected"].includes(record.status.toLowerCase())).length;

  const exportCsv = () => {
    const csv = [["Name", "Details", "Status", "Updated"], ...visible.map((record) => [record.title, record.subtitle, record.status, record.updatedAt])]
      .map((row) => row.map((cell) => JSON.stringify(cell)).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = (item?.label || "admin-records").toLowerCase().replace(/[^a-z0-9]+/g, "-") + ".csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  if (!group || !item) {
    return <main className="private-page"><section className="private-state"><h2>Admin module not found</h2><Link className="private-primary-button" to="/admin">Back to dashboard</Link></section></main>;
  }

  return (
    <main className="private-page admin-module-page admin-live-workspace">
      <header className="admin-module-head">
        <div><p className="private-kicker">{String(group.number).padStart(2, "0")} · {group.label}</p><h1>{item.label}</h1><p>Manage live {item.label.toLowerCase()} records across SMAJ PI HUB.</p></div>
        <div><button type="button" onClick={() => void load()} disabled={loading}><RefreshOutlinedIcon />{loading ? "Loading..." : "Refresh"}</button><button type="button" onClick={exportCsv} disabled={!visible.length}><DownloadOutlinedIcon />Export CSV</button></div>
      </header>
      {error ? <div className="private-alert error">{error}</div> : null}
      <section className="admin-workspace-kpis">
        <article><span>Records</span><strong>{records.length}</strong><small>Live {item.label.toLowerCase()}</small></article>
        <article><span>Needs attention</span><strong>{attentionCount}</strong><small>Pending or flagged</small></article>
        <article><span>Platform users</span><strong>{stats.totalUsers || 0}</strong><small>SMAJ PI HUB</small></article>
        <article><span>Marketplace orders</span><strong>{stats.totalOrders || 0}</strong><small>Store records</small></article>
      </section>
      <section className="admin-workspace-table">
        <header><div><h2>{item.label}</h2><p>{visible.length} of {records.length} records</p></div><div className="admin-workspace-tools"><label><SearchOutlinedIcon /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={"Search " + item.label.toLowerCase()} /></label><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All statuses</option>{statuses.map((value) => <option value={value} key={value}>{value}</option>)}</select></div></header>
        {loading ? <div className="private-state compact"><h3>Loading live records…</h3></div> : visible.length ? <div className="admin-workspace-rows">
          <div className="heading"><span>Name</span><span>Details</span><span>Status</span><span>Updated</span><span>Action</span></div>
          {visible.map((record) => <article key={record.id}><div><strong>{record.title}</strong><small>#{record.id.slice(-8)}</small></div><span>{record.subtitle}</span><em className={record.status.toLowerCase()}>{record.status}</em><time>{record.updatedAt}</time><Link to={record.href}>Open</Link></article>)}
        </div> : <div className="private-state compact"><h3>No records found</h3><p>{error ? "The workspace remains available while live data reconnects." : "No live records match the current search and status filter."}</p></div>}
      </section>
    </main>
  );
};

export default AdminModulePage;
