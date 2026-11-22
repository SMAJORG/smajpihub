import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { isAxiosError } from "axios";
import { RefreshCw, Search, ArrowUpRight, Users, Activity, ShoppingCart, Package, Clock3, ShieldCheck, Flag, BriefcaseBusiness, LayoutGrid } from "lucide-react";
import { axiosClient } from "../../lib/axiosClient";
import PrivateSkeleton from "../../components/PrivateSkeleton";
import { adminNavigation } from "../../content/adminNavigation";
import "./admin-analytics.css";
const cards = [
  ["totalUsers", "User accounts", "/admin/users"], ["activeUsers", "Active users", "/admin/users"],
  ["totalOrders", "Orders", "/admin/orders"], ["totalProducts", "Products", "/admin/products"],
  ["pendingProducts", "Products awaiting review", "/admin/products"], ["pendingOnboarding", "Verification applications", "/admin/onboarding"],
  ["unreadReports", "Reports needing review", "/admin/reports"], ["pendingJobsModeration", "Jobs awaiting review", "/admin/jobs"],
] as const;
export default function AdminOverviewPage() {
  const [stats, setStats] = useState<Record<string, number> | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [updated, setUpdated] = useState("");
  const [serviceSearch, setServiceSearch] = useState("");
  const [view, setView] = useState<"overview" | "services">("overview");
  const load = useCallback(async () => {
    setLoading(true);
    try { const response = await axiosClient.get<{ stats: Record<string, number> }>("/admin/stats", { headers: { "X-SMAJ-Silent": "true" } }); setStats(response.data.stats); setUpdated(new Date().toLocaleTimeString()); setError(""); }
    catch (error) { setError(isAxiosError<{ message?: string }>(error) ? error.response?.data?.message || "Dashboard data could not load. Check your connection and retry." : "Dashboard data could not load."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const serviceGroups = adminNavigation.filter(group => group.number >= 5 && group.number <= 19);
  const visibleServices = serviceGroups.filter(group => group.label.toLowerCase().includes(serviceSearch.trim().toLowerCase()));
  const statIcons = [Users, Activity, ShoppingCart, Package, Clock3, ShieldCheck, Flag, BriefcaseBusiness];
  return <main className="private-page admin-enterprise-page admin-overview-redesign">
    <header className="ea-page-head"><div><p className="ea-eyebrow">SMAJ PI HUB / ADMIN WORKSPACE</p><h1>{view === "overview" ? "Admin Dashboard" : "Platform management"}</h1><p>{view === "overview" ? "Your platform at a glance." : "Manage every SMAJ service in one place."}</p></div><button type="button" className="ea-button" disabled={loading} onClick={() => void load()}><RefreshCw size={16} />{loading ? "Refreshing" : "Refresh"}</button></header>
    <nav className="smaj-admin-overview-tabs" aria-label="Dashboard sections"><button type="button" className={view === "overview" ? "active" : ""} onClick={() => setView("overview")}>Overview</button><button type="button" className={view === "services" ? "active" : ""} onClick={() => setView("services")}>Services</button><Link to="/admin/modules/01-overview/pending-actions">Pending actions</Link></nav>
    {error ? <p role="alert" className="private-alert error">{error}</p> : null}{updated ? <small className="smaj-admin-last-update">Updated {updated}</small> : null}
    {view === "overview" ? <>
      <div className="smaj-admin-section-title"><h2>Platform overview</h2><span>Live statistics</span></div>
      {loading && !stats ? <PrivateSkeleton variant="dashboard" count={4} /> : stats ? <section className="smaj-admin-stats">{cards.map(([key, label, href], index) => { const Icon = statIcons[index]; return <Link className="smaj-admin-stat" key={key} to={href}><span className="smaj-admin-stat-label">{label}<Icon size={18} aria-hidden="true" /></span><strong>{typeof stats[key] === "number" ? stats[key].toLocaleString() : "—"}</strong><small>{key === "activeUsers" ? "Activity in the last 15 minutes" : "Open management"}</small></Link>; })}</section> : <button className="ea-button" type="button" onClick={() => void load()}>Retry dashboard data</button>}
      <section className="smaj-admin-quick"><h2>Quick management</h2><div><Link to="/admin/users">Manage accounts <ArrowUpRight size={16} /></Link><Link to="/admin/analytics">Analytics & reports <ArrowUpRight size={16} /></Link><Link to="/admin/reports">Support & moderation <ArrowUpRight size={16} /></Link></div></section>
      <button type="button" className="smaj-admin-services-shortcut" onClick={() => setView("services")}><span><LayoutGrid size={22}/><span><strong>Platform management</strong><small>Manage all {serviceGroups.length} services</small></span></span><ArrowUpRight size={20}/></button>
    </> : <section className="smaj-admin-services"><div className="smaj-admin-section-title"><h2>Service directory</h2><span>{visibleServices.length} services</span></div><label className="smaj-admin-service-search"><Search size={18}/><input type="search" value={serviceSearch} onChange={event => setServiceSearch(event.target.value)} placeholder="Search SMAJ services…" aria-label="Search SMAJ services"/></label><div className="smaj-admin-service-grid">{visibleServices.map(group => <Link key={group.number} to={group.items.find(item => item.label === "Analytics & Management")?.to || group.items[0].to || "/admin"}><span className="smaj-admin-service-icon"><LayoutGrid size={20}/></span><strong>{group.label}</strong><small>Open workspace</small><ArrowUpRight size={17} className="smaj-admin-service-arrow"/></Link>)}</div>{!visibleServices.length ? <p>No services match your search.</p> : null}</section>}
  </main>;
}
