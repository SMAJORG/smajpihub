import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { isAxiosError } from "axios";
import { RefreshCw } from "lucide-react";
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
  const load = useCallback(async () => {
    setLoading(true);
    try { const response = await axiosClient.get<{ stats: Record<string, number> }>("/admin/stats", { headers: { "X-SMAJ-Silent": "true" } }); setStats(response.data.stats); setUpdated(new Date().toLocaleTimeString()); setError(""); }
    catch (error) { setError(isAxiosError<{ message?: string }>(error) ? error.response?.data?.message || "Dashboard data could not load. Check your connection and retry." : "Dashboard data could not load."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  return <main className="private-page admin-enterprise-page"><header className="ea-page-head"><div><p className="ea-eyebrow">SMAJ PI HUB / OVERVIEW</p><h1>Admin Dashboard</h1><p>Manage users, platforms and pending operations.</p></div><button type="button" className="ea-button" disabled={loading} onClick={() => void load()}><RefreshCw size={15} />Refresh</button></header>
    <nav className="ea-management-links" aria-label="Admin quick actions"><Link className="ea-button" to="/admin/users">Manage accounts</Link><Link className="ea-button" to="/admin/analytics">Analytics & Reports</Link><Link className="ea-button" to="/admin/reports">Support & moderation</Link></nav>
    {error ? <p role="alert">{error}</p> : null}{updated ? <small>Updated {updated}</small> : null}
    {loading && !stats ? <PrivateSkeleton variant="dashboard" count={4} /> : stats ? <section className="ea-kpi-grid">{cards.map(([key, label, href]) => <Link className="ea-card ea-kpi" key={key} to={href}><span>{label}</span><strong>{typeof stats[key] === "number" ? stats[key].toLocaleString() : "Unavailable"}</strong><small>{key === "activeUsers" ? "Activity in the last 15 minutes" : "Open management"}</small></Link>)}</section> : <button className="ea-button" type="button" onClick={() => void load()}>Retry dashboard data</button>}
    <section className="ea-card ea-service-directory"><header><div><h2>Platform management</h2><p>Open a platform workspace.</p></div></header><div className="ea-management-links" style={{ padding: 20 }}>{adminNavigation.filter(group => group.number >= 5 && group.number <= 19).map(group => <Link className="ea-button" key={group.number} to={group.items.find(item => item.label === "Analytics & Management")?.to || group.items[0].to || "/admin"}>{group.label}</Link>)}</div></section>
  </main>;
}
