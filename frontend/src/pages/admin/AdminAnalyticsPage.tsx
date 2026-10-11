import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Activity, ArrowDownRight, ArrowUpRight, BadgeCheck, BarChart3, CircleHelp, CreditCard, RefreshCw, ShieldCheck, Users, X } from "lucide-react";
import { axiosClient } from "../../lib/axiosClient";
import PrivateSkeleton from "../../components/PrivateSkeleton";
import type { ChartPoint } from "./AdminAnalyticsChart";
import "./admin-utilities.css";
import "./admin-analytics.css";
const AnalyticsChart = lazy(() => import("./AdminAnalyticsChart"));
type ChartMetric = "growth" | "active" | "payments" | "orders" | "status" | "usage";
type Series = { available: boolean; reason: string | null; data: ChartPoint[] };
type Service = { id: string; name: string; available: boolean; reason: string | null; count: number | null; previous: number | null; unit: string };
type RecordRow = { id: string; title: string; time: string; value: number; service: string; status: string; href: string; unit: string };
type Snapshot = { updatedAt: string; kpis: Record<string, number | null>; charts: Record<Exclude<ChartMetric, "usage">, Series>; services: Service[]; contributions: { service: string; name: string; value: number; previous: number }[]; definitions: Record<string, string>; unavailable: Record<string, string>; range: { from: string; to: string; previousFrom: string; timezone: string } };
const periods = ["Live", "24H", "7D", "30D", "90D", "Custom"] as const;
type Period = typeof periods[number];
const number = (value: number | null | undefined, unit = "") => value == null ? "Unavailable" : value.toLocaleString(undefined, { maximumFractionDigits: unit ? 7 : 0 }) + (unit ? " " + unit : "");
const serviceManagement: Record<string, { label: string; href: string }[]> = {
  store: [{ label: "Products & sellers", href: "/admin/products" }, { label: "Orders & disputes", href: "/admin/orders" }],
  stream: [{ label: "Stream overview", href: "/admin/stream" }, { label: "Media library", href: "/admin/stream/catalog" }, { label: "Moderation", href: "/admin/stream/moderation" }],
  jobs: [{ label: "Jobs, companies & applications", href: "/admin/jobs" }],
  edu: [{ label: "Courses", href: "/admin/courses" }, { label: "Institutions", href: "/admin/education/institutions" }, { label: "Teacher verification", href: "/admin/education/teachers" }],
};
const kpis = [
  ["totalUsers", "Total Users", "/admin/users", Users, "All registered accounts"],
  ["activeUsers", "Active Users", "/admin/users", Activity, "Activity within 15 minutes"],
  ["verifiedUsers", "Verified Users", "/admin/users", BadgeCheck, "Approved verification"],
  ["totalTransactions", "Total Pi Transactions", "/admin/analytics#payments", CreditCard, "Verified Testnet ledger | all time"],
  ["newUsersToday", "New Users Today", "/admin/users", Users, "Today in selected timezone"],
  ["trustedSellers", "Trusted Sellers / Providers", "/admin/users", ShieldCheck, "Approved trusted-seller badges"],
  ["piVolume", "Pi Transaction Volume", "/admin/analytics#payments", CreditCard, "Verified Testnet | selected period"],
  ["successfulPayments", "Successful Payments", "/admin/analytics#status", BadgeCheck, "Verified Testnet | selected period"],
  ["pendingVerifications", "Pending Verifications", "/admin/users", ShieldCheck, "Awaiting account verification"],
  ["openDisputes", "Open Disputes", "/admin/orders", CircleHelp, "Store and Jobs open cases"],
  ["fraudAlerts", "Fraud Alerts", "/admin/modules/20-trust-and-safety/fraud-alerts", ShieldCheck, "Requires fraud alert event API"],
  ["activeServices", "Active Services", "#services", BarChart3, "Services with recorded actions | selected period"],
] as const;
export default function AdminAnalyticsPage() {
  const { service } = useParams<{ service?: string }>();
  const timezoneDefault = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const [period, setPeriod] = useState<Period>("30D");
  const [timezone, setTimezone] = useState(timezoneDefault);
  const [compare, setCompare] = useState(true);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<"analytics" | "management">("analytics");
  const [samples, setSamples] = useState<ChartPoint[]>([]);
  const [inspection, setInspection] = useState<{ metric: ChartMetric; title: string; from: string; to: string; service?: string; status?: string } | null>(null);
  const [rows, setRows] = useState<RecordRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [recordsError, setRecordsError] = useState("");
  const [recordsLoading, setRecordsLoading] = useState(false);
  const snapshotRef = useRef<Snapshot | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const load = useCallback(async (manual = false) => {
    if (period === "Custom" && (!from || !to)) { setLoading(false); setError("Select both custom dates to load analytics."); return; }
    controllerRef.current?.abort();
    const controller = new AbortController(); controllerRef.current = controller;
    const end = period === "Custom" ? new Date(to).getTime() : Date.now();
    const start = period === "Custom" ? new Date(from).getTime() : end - ({ Live: 3600_000, "24H": 86_400_000, "7D": 7 * 86_400_000, "30D": 30 * 86_400_000, "90D": 90 * 86_400_000 }[period]);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end || end - start > 180 * 86_400_000 || end > Date.now() + 60_000) { setLoading(false); setError("Choose dates in order, up to 180 days, ending no later than now."); return; }
    if (manual) setRefreshing(true);
    try {
      const response = await axiosClient.get<Snapshot>("/admin/analytics", { params: { from: new Date(start).toISOString(), to: new Date(end).toISOString(), timezone, live: String(period === "Live"), service }, signal: controller.signal });
      if (controller.signal.aborted) return;
      setData(response.data); snapshotRef.current = response.data; setError("");
      const observed = response.data.charts.active.data[0];
      if (period === "Live" && observed) setSamples(previous => [...previous.filter(point => point.time !== observed.time), observed].slice(-60));
    } catch { if (!controller.signal.aborted) setError("Analytics could not refresh. Previous data is shown with its original timestamp. Check admin access and retry."); }
    finally { if (!controller.signal.aborted) { setLoading(false); setRefreshing(false); if (controllerRef.current === controller) controllerRef.current = null; } }
  }, [period, from, to, timezone, service]);
  useEffect(() => {
    setData(null); snapshotRef.current = null; setLoading(true); setSamples([]); setInspection(null);
    void load();
    const timer = window.setInterval(() => { if (!document.hidden && !controllerRef.current) void load(); }, 15_000);
    return () => { window.clearInterval(timer); controllerRef.current?.abort(); };
  }, [load]);
  useEffect(() => {
    if (!inspection) return;
    const controller = new AbortController();
    setRecordsLoading(true); setRecordsError("");
    void axiosClient.get<{ records: RecordRow[]; total: number }>("/admin/analytics/records", { params: { ...inspection, timezone, live: String(inspection.metric === "active"), page }, signal: controller.signal }).then(response => { if (!controller.signal.aborted) { setRows(response.data.records); setTotal(response.data.total); } }).catch(() => { if (!controller.signal.aborted) setRecordsError("Records could not load. Close and inspect again to retry."); }).finally(() => { if (!controller.signal.aborted) setRecordsLoading(false); });
    return () => controller.abort();
  }, [inspection, page, timezone]);
  useEffect(() => {
    if (!inspection) return;
    const previous = document.body.style.overflow; document.body.style.overflow = "hidden";
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setInspection(null); };
    window.addEventListener("keydown", close);
    return () => { document.body.style.overflow = previous; window.removeEventListener("keydown", close); };
  }, [inspection]);
  const inspect = (metric: ChartMetric, point?: ChartPoint, serviceId?: string) => {
    const snapshot = snapshotRef.current; if (!snapshot) return;
    setPage(1); setRows([]); setTotal(0);
    setInspection({ metric: point?.metric || metric, title: metric === "usage" ? "Service usage records" : metric + " records", from: point?.time && metric !== "active" ? point.time : point?.period === "previous" ? snapshot.range.previousFrom : snapshot.range.from, to: point?.end && metric !== "active" ? point.end : point?.period === "previous" ? snapshot.range.from : snapshot.range.to, service: ["growth", "active"].includes(metric) ? undefined : serviceId || service, status: metric === "status" ? point?.name : undefined });
  };
  const date = (value: string) => new Intl.DateTimeFormat(undefined, { timeZone: timezone, dateStyle: "medium", timeStyle: "medium" }).format(new Date(value));
  const insight = (series: ChartPoint[], unit: string) => {
    const current = series.reduce((sum, row) => sum + (row.value || 0), 0), previous = series.reduce((sum, row) => sum + (row.previous || 0), 0);
    if (!compare) return number(current, unit) + " recorded in the selected period.";
    if (previous === 0) return number(current, unit) + " in this period; the preceding equal-length period recorded zero. A percentage comparison is unavailable.";
    const change = (current - previous) / previous * 100;
    return number(current, unit) + " vs " + number(previous, unit) + " in the preceding equal-length period (" + Math.abs(change).toFixed(1) + "% " + (change >= 0 ? "increase" : "decrease") + ").";
  };
  const currentService = data?.services.find(entry => entry.id === service);
  if (service && data && !currentService) return <main className="private-page"><h1>Service not found</h1><Link to="/admin">Back to overview</Link></main>;
  const renderChart = (metric: Exclude<ChartMetric, "usage">, title: string, subtitle: string, unit: string, kind: "area" | "bar" = "area") => {
    const chart = data?.charts[metric];
    const chartData = metric === "active" ? samples : chart?.data || [];
    const available = Boolean(chart?.available);
    const empty = available && metric !== "active" && !chartData.some(point => Number(point.value) > 0 || (compare && Number(point.previous) > 0));
    return <article className="ea-card ea-chart-card" id={metric} key={metric}><header><div><h2>{title}</h2><p>{subtitle}</p></div><button type="button" disabled={!available} onClick={() => inspect(metric)}>View records</button></header>{available ? <div className="ea-legend"><span><i style={{ background: "#7352d6" }} />{metric === "orders" ? "Orders" : "Selected period"}</span>{compare && metric !== "active" ? <span><i style={{ background: "#7d96c7" }} />Previous period</span> : null}{metric === "orders" ? <span><i style={{ background: "#0f9a92" }} />Verified transactions</span> : null}</div> : null}{!available ? <div className="ea-chart-state"><CircleHelp /><strong>Metric unavailable</strong><p>{chart?.reason || "This data source is not available."}</p></div> : empty ? <div className="ea-chart-state"><BarChart3 /><strong>No recorded activity</strong><p>No records in the selected {compare ? "or previous " : ""}period.</p></div> : <Suspense fallback={<PrivateSkeleton variant="stats" count={1} />}><AnalyticsChart data={chartData} range={data?.range} transactions={metric === "orders"} unit={unit} kind={kind} timezone={timezone} compare={compare && metric !== "active"} categorical={metric === "status"} onInspect={point => inspect(metric, point)} /></Suspense>}<footer className="ea-insights"><strong>Analytics Insights</strong><p>{!available ? chart?.reason : metric === "active" ? number(data?.kpis.activeUsers) + " accounts have observed activity in the last 15 minutes. Live samples start when this page opens; historical comparison is unavailable." : insight(chartData, unit)}</p>{metric === "orders" && available ? <p>{number(chartData.reduce((sum, point) => sum + (point.transactions || 0), 0))} verified Testnet transactions in this period{compare ? " vs " + number(chartData.reduce((sum, point) => sum + (point.previousTransactions || 0), 0)) + " in the previous period" : ""}.</p> : null}{metric === "payments" ? <p>{data?.contributions.filter(entry => entry.value || entry.previous).map(entry => entry.name + ": " + number(entry.value, "Pi") + " (previous " + number(entry.previous, "Pi") + ")").join(" | ") || "No verified service payment contributions in this period."}</p> : null}<small>{data ? date(data.range.from) + " | " + date(data.range.to) + " | " + timezone + " | " + (service && !["growth", "active"].includes(metric) ? currentService?.name : "SMAJ PI HUB") : ""}</small></footer></article>;
  };
  return <main className="private-page admin-enterprise-page">
    <header className="ea-page-head"><div><p className="ea-eyebrow">SMAJ PI HUB / {service ? "SERVICE ANALYTICS" : "OVERVIEW"}</p><h1>{currentService?.name || (service ? "Service analytics" : "Analytics & Reports")}</h1><p>Platform performance, verified payments and operational activity.</p></div><button className="ea-button" type="button" disabled={refreshing || loading} onClick={() => void load(true)}><RefreshCw size={15} />{refreshing ? "Refreshing" : "Refresh"}</button></header>
    <section className="ea-toolbar" aria-label="Analytics filters"><div className="ea-periods">{periods.map(value => <button type="button" key={value} aria-pressed={period === value} onClick={() => setPeriod(value)}>{value}</button>)}</div><div className="ea-options"><label><input type="checkbox" checked={compare} onChange={event => setCompare(event.target.checked)} />Previous period</label><label>Timezone<select value={timezone} onChange={event => setTimezone(event.target.value)}>{Array.from(new Set([timezoneDefault, "UTC", "Asia/Dubai", "Africa/Lagos", "America/New_York"])).map(value => <option key={value}>{value}</option>)}</select></label></div>{period === "Custom" ? <div className="ea-date-range"><label>From<input type="datetime-local" value={from} onChange={event => setFrom(event.target.value)} /></label><label>To<input type="datetime-local" value={to} onChange={event => setTo(event.target.value)} /></label><small>Entered in your device timezone ({timezoneDefault}); chart labels use {timezone}.</small></div> : null}</section>
    <div className="ea-status"><span><i className={error ? "stale" : ""} />{period === "Live" ? "Live observations" : "Database snapshot"} | refresh every 15 seconds</span><span>{data ? "Updated " + date(data.updatedAt) : "Loading snapshot"} | {timezone}</span></div>
    {error ? <div className="private-alert error" role="alert">{error}</div> : null}
    {loading && !data ? <PrivateSkeleton variant="dashboard" count={4} /> : data ? <>
      {service ? <nav className="ea-tabs" aria-label="Service workspace"><button type="button" aria-pressed={tab === "analytics"} onClick={() => setTab("analytics")}>Analytics</button><button type="button" aria-pressed={tab === "management"} onClick={() => setTab("management")}>Management</button><Link to="/admin">All platforms</Link></nav> : null}
      {tab === "management" && service ? <section className="ea-card ea-service-management"><h2>{currentService?.name} management</h2>{serviceManagement[service]?.length ? <div className="ea-management-links">{serviceManagement[service].map(link => <Link className="ea-button" key={link.href} to={link.href}>{link.label}</Link>)}</div> : <p>A dedicated administrator management API is required for this service. Global marketplace records are not presented as this service's data.</p>}{currentService?.available ? <button className="ea-button" onClick={() => inspect("usage", undefined, service)}>Inspect {currentService.unit}</button> : <p>{currentService?.reason}</p>}</section> : <>
      <section className="ea-kpi-grid" aria-label="Platform KPIs">{kpis.map(([key, label, href, Icon, note], index) => <Link className={"ea-card ea-kpi " + (index < 4 ? "primary" : "")} to={href} key={key}><div><span>{label}</span><Icon size={17} /></div><strong>{number(data.kpis[key], key === "piVolume" ? "Pi" : "")}</strong><small>{note}</small></Link>)}</section>
      <section className="ea-chart-grid">{renderChart("growth", "User Growth", "New registered accounts | platform-wide", "users")}{renderChart("active", "Active Users", "Observed accounts | platform-wide | 15-minute window", "users")}{renderChart("payments", "Pi Payment Volume", "Verified Testnet ledger | recorded verification subset", "Pi Testnet")}{renderChart("orders", "Orders and Transactions", "Marketplace orders and verified Testnet transactions", "orders", "bar")}{renderChart("status", "Transaction Status", "Verified success and current recorded attempt status", "transactions", "bar")}
      <article className="ea-card ea-chart-card" id="services"><header><div><h2>Service Usage</h2><p>All 15 White Paper platforms | recorded operational actions</p></div><Link to="#service-directory">All services</Link></header>{data.services.some(entry => (entry.count || 0) > 0 || (compare && (entry.previous || 0) > 0)) ? <Suspense fallback={<PrivateSkeleton variant="stats" count={1} />}><AnalyticsChart kind="bar" categorical horizontal range={data.range} data={data.services.map(entry => ({ name: entry.id.toUpperCase() + (!entry.available ? " (N/A)" : ""), service: entry.id, value: entry.count, previous: entry.previous, unit: entry.unit }))} unit="actions" timezone={timezone} compare={compare} onInspect={point => { if (data.services.find(entry => entry.id === point.service)?.available) inspect("usage", point, point.service); }} /></Suspense> : <div className="ea-chart-state"><BarChart3 /><strong>No recorded service usage</strong><p>Unavailable platforms are listed below separately.</p></div>}<footer className="ea-insights"><strong>Analytics Insights</strong><p>{data.definitions.usage}</p><small>{date(data.range.from)} - {date(data.range.to)} | {timezone}</small></footer></article>
      </section>
      </>}
      <section className="ea-card ea-service-directory" id="service-directory"><header><div><h2>Platform directory</h2><p>Dedicated analytics and management for all 15 services.</p></div><span>{data.services.filter(entry => entry.available).length}/15 usage sources connected</span></header><div className="ea-table-scroll"><table><thead><tr><th>Platform</th><th>Recorded usage</th><th>Previous period</th><th>Data availability</th><th>Workspace</th></tr></thead><tbody>{data.services.map(entry => <tr key={entry.id}><td><strong>{entry.name}</strong></td><td><button type="button" disabled={!entry.available} onClick={() => inspect("usage", undefined, entry.id)}>{number(entry.count)}{entry.available ? " " + entry.unit : ""}</button></td><td>{compare ? number(entry.previous) : "Comparison off"}{compare && entry.count !== null && entry.previous !== null && entry.count !== entry.previous ? entry.count > entry.previous ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} /> : null}</td><td><span className={"ea-badge " + (entry.available ? "connected" : "unavailable")}>{entry.available ? "Connected" : "Unavailable"}</span>{!entry.available ? <small>{entry.reason}</small> : null}</td><td><Link to={"/admin/services/" + entry.id}>Open workspace</Link></td></tr>)}</tbody></table></div></section>
      <details className="ea-card ea-definitions"><summary>Metric definitions & data coverage</summary>{Object.entries(data.definitions).map(([key, value]) => <p key={key}><strong>{key}: </strong>{value}</p>)}<p><strong>Fraud alerts:</strong> requires a dedicated persisted fraud-event source; report counts are not treated as fraud evidence.</p>{Object.entries(data.unavailable).map(([key, value]) => <p key={key}>{key}: {value}</p>)}<p>Financial coverage is the existing verified Testnet ledger. Unverified completions, unavailable service adapters and Mainnet payments are excluded. Custom intervals are limited to 180 days; sources above 50,000 records require database rollups and are withheld.</p></details>
    </> : !loading ? <div className="ea-chart-state"><strong>Analytics unavailable</strong><button className="ea-button" onClick={() => void load(true)}>Retry</button></div> : null}
    {inspection ? <div className="ea-dialog-backdrop" onMouseDown={() => setInspection(null)}><section className="ea-record-dialog ea-card" role="dialog" aria-modal="true" aria-labelledby="ea-record-title" onMouseDown={event => event.stopPropagation()}><header><div><h2 id="ea-record-title">{inspection.title}</h2><p>{date(inspection.from)} - {date(inspection.to)} | {timezone}</p></div><button autoFocus type="button" aria-label="Close records" onClick={() => setInspection(null)}><X size={20} /></button></header>{recordsError ? <p role="alert">{recordsError}</p> : recordsLoading ? <PrivateSkeleton variant="list" count={3} /> : !rows.length ? <div className="ea-chart-state">No underlying records for this point.</div> : <div className="ea-table-scroll"><table><thead><tr><th>Record</th><th>Time</th><th>Service</th><th>Value</th><th>Status</th><th>Manage</th></tr></thead><tbody>{rows.map((row, index) => <tr key={row.id + index}><td><strong>{row.title}</strong><small>{row.id}</small></td><td>{date(row.time)}</td><td>{row.service}</td><td>{number(row.value, row.unit)}</td><td>{row.status}</td><td><Link to={row.href} onClick={() => setInspection(null)}>Open</Link></td></tr>)}</tbody></table></div>}<footer><span>{total} records | page {page}</span><button type="button" disabled={page === 1 || recordsLoading} onClick={() => setPage(value => value - 1)}>Previous</button><button type="button" disabled={page * 50 >= total || recordsLoading} onClick={() => setPage(value => value + 1)}>Next</button></footer></section></div> : null}
  </main>;
}
