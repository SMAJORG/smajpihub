import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { isAxiosError } from "axios";
import { Link } from "react-router-dom";
import PrivateSkeleton from "../../components/PrivateSkeleton";
import PullToRefresh from "../../components/PullToRefresh";
import { axiosClient } from "../../lib/axiosClient";
import { formatPiAmount } from "../../lib/formatters";
import type { Order, OrderStatus, Product } from "../../types/marketplace";
import type { User } from "../../types/pi";
import { getStreamAdminOverview, type StreamAdminOverview } from "../../lib/streamAdmin";
import ActionDialog from "../../components/ActionDialog";
import { showFeedback } from "../../lib/feedback";
import {
  getJobsAdminReview,
  moderateJobPosting,
  moderateJobCompany,
  verifyJobsCompany,
  verifyJobsCandidate,
  getJobsSalaryDisputes,
  resolveJobsSalaryDispute,
  type JobsAdminReviewJob,
  type JobsAdminReviewCompany,
  type JobsAdminReviewProfile,
  type JobsSalaryDispute,
} from "../../lib/jobsApi";

const PI_USER_STORAGE_KEY = "smaj_pi_user";

type AdminStats = Record<string, number>;
type AdminActivity = {
  type: string;
  label: string;
  description: string;
  createdAt: string;
  href?: string;
};

const getStoredAccessToken = () => {
  try {
    const stored = window.localStorage.getItem(PI_USER_STORAGE_KEY);
    if (!stored) return "";
    const user = JSON.parse(stored) as { accessToken?: string };
    return user.accessToken || "";
  } catch {
    return "";
  }
};

const adminFetch = async <T,>(path: string): Promise<T> => {
  const accessToken = getStoredAccessToken();
  const response = await axiosClient.get<T>(path, {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}`, "X-SMAJ-Access-Token": accessToken } : undefined,
    withCredentials: true,
  });
  return response.data;
};

const Head = ({ title, description, action }: { title: string; description: string; action?: ReactNode }) => (
  <section className="private-page-head">
    <div>
      <p className="private-kicker">ADMIN PANEL</p>
      <h1>{title}</h1>
      <p>{description}</p>
    </div>
    {action}
  </section>
);

const Notice = ({ text }: { text: string }) => text ? <div className="private-alert success">{text}</div> : null;

export const AdminDashboardPage = () => {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [activity, setActivity] = useState<AdminActivity[]>([]);
  const [streamOverview, setStreamOverview] = useState<StreamAdminOverview | null>(null);
  const [dashboardUsers, setDashboardUsers] = useState<AdminUser[]>([]);
  const [dashboardOrders, setDashboardOrders] = useState<Order[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) setRefreshing(true);
    try {
      const [statsResponse, activityResponse, streamResponse, usersResponse, ordersResponse] = await Promise.all([
        adminFetch<{ stats: AdminStats; updatedAt: string }>("/admin/stats"),
        adminFetch<{ activity: AdminActivity[]; updatedAt: string }>("/admin/activity"),
        getStreamAdminOverview().catch(() => null),
        axiosClient.get<{ users: AdminUser[] }>("/admin/users").catch(() => null),
        axiosClient.get<{ orders: Order[] }>("/admin/orders").catch(() => null),
      ]);
      setStats(statsResponse.stats);
      setActivity(activityResponse.activity);
      setStreamOverview(streamResponse);
      setDashboardUsers(usersResponse?.data.users || []);
      setDashboardOrders(ordersResponse?.data.orders || []);
      setLastUpdated(new Date(statsResponse.updatedAt || activityResponse.updatedAt || Date.now()));
      setError("");
    } catch {
      setError("Admin stats could not load. Check backend admin access, session, and database collections.");
    } finally {
      if (showRefreshing) setRefreshing(false);
    }
  }, []);
  useEffect(() => {
    let mounted = true;
    const run = async (showRefreshing = false) => {
      if (!mounted) return;
      await load(showRefreshing);
    };
    void run();
    const interval = window.setInterval(() => void run(true), 15_000);
    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, [load]);
  const attention = [
    ["Pending products", stats?.pendingProducts || 0, "/admin/products"],
    ["Seller applications", stats?.pendingOnboarding || 0, "/admin/onboarding"],
    ["Ambassador applications", stats?.pendingAmbassadors || 0, "/admin/ambassadors"],
    ["Open reports", stats?.unreadReports || 0, "/admin/reports"],
    ["Failed or cancelled payments", stats?.failedCancelledPayments || 0, "/admin/orders"],
    ["Jobs moderation", stats?.pendingJobsModeration || 0, "/admin/jobs"],
    ["Stream moderation", streamOverview?.stats.pendingVideos || 0, "/admin/stream/moderation"],
  ] as const;
  const updatedLabel = lastUpdated ? lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "Not loaded";
  const monthlyOperations = useMemo(() => {
    const year = new Date().getFullYear();
    const values = Array.from({ length: 12 }, () => ({ orders: 0, volume: 0 }));
    dashboardOrders.forEach((order) => {
      const date = new Date(order.createdAt);
      if (!Number.isNaN(date.getTime()) && date.getFullYear() === year) {
        values[date.getMonth()].orders += 1;
        values[date.getMonth()].volume += Number(order.pricePi || 0);
      }
    });
    return values;
  }, [dashboardOrders]);
  const monthlyMaximum = Math.max(...monthlyOperations.flatMap((month) => [month.orders, month.volume]), 1);
  const chartPoints = (key: "orders" | "volume") => monthlyOperations.map((month, index) => (index * 100) + "," + (230 - (month[key] / monthlyMaximum) * 200)).join(" ");
  const demographics = useMemo(() => {
    const countries = new Map<string, number>();
    dashboardUsers.forEach((entry) => {
      const country = entry.country?.trim() || "Not provided";
      countries.set(country, (countries.get(country) || 0) + 1);
    });
    return [...countries.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [dashboardUsers]);
  const completionRate = Math.min(100, Math.round(((Number(stats?.completedOrders || 0)) / Math.max(Number(stats?.totalOrders || 0), 1)) * 100));
  const monthlyOrderMaximum = Math.max(...monthlyOperations.map((month) => month.orders), 1);

  return (
    <main className="private-page admin-dashboard-page">
      <PullToRefresh onRefresh={() => load(false)} />
      <Head
        title="Admin Dashboard"
        description="Platform health, moderation, and marketplace operations."
        action={<button className="private-secondary-button" type="button" onClick={() => void load(true)} disabled={refreshing}>{refreshing ? "Refreshing..." : "Refresh"}</button>}
      />
      {error ? <div className="private-alert error">{error}</div> : null}
      {!stats ? <PrivateSkeleton variant="stats" count={6} /> : (
        <>
          <div className="private-alert admin-live-status"><i /> Live operations · updated {updatedLabel}</div>
          <section className="admin-tail-overview">
            <div className="admin-tail-left">
              <div className="admin-tail-metrics">
                <Link to="/admin/users"><i>US</i><span>Total Users</span><strong>{stats.totalUsers || 0}</strong><small>Live users</small></Link>
                <Link to="/admin/orders"><i>OR</i><span>Total Orders</span><strong>{stats.totalOrders || 0}</strong><small>{stats.pendingOrders || 0} pending</small></Link>
              </div>
              <article className="admin-monthly-sales">
                <header><h2>Monthly Sales</h2><span>⋮</span></header>
                <div>{monthlyOperations.map((month, index) => <i key={index} style={{ height: Math.max(4, (month.orders / monthlyOrderMaximum) * 100) + "%" }} title={month.orders + " orders"} />)}</div>
                <footer>{["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].map((month) => <span key={month}>{month}</span>)}</footer>
              </article>
            </div>
            <article className="admin-monthly-target">
              <header><h2>Monthly Target</h2><p>Completed marketplace orders</p></header>
              <div className="admin-target-gauge" style={{ "--admin-target": completionRate + "%" } as CSSProperties}><span><strong>{completionRate}%</strong><small>Live completion</small></span></div>
              <p>{completionRate >= 75 ? "Great progress. Keep up your good work!" : "Track pending orders to improve completion."}</p>
              <footer><span>Target<strong>{stats.totalOrders || 0}</strong></span><span>Completed<strong>{stats.completedOrders || 0}</strong></span><span>Pending<strong>{stats.pendingOrders || 0}</strong></span></footer>
            </article>
          </section>
          <section className="admin-attention-panel">
            <div className="section-title compact"><div><p className="private-kicker">ACTION CENTER</p><h2>Needs attention</h2><p>One queue for marketplace and Stream operations.</p></div></div>
            <div>{attention.map(([label, count, to]) => <Link to={to} key={label}><span>{label}</span><strong>{count}</strong><small>{count ? "Review now" : "All clear"}</small></Link>)}</div>
          </section>
          <section className="admin-statistics-card">
            <header><div><h2>Statistics</h2><p>Real monthly marketplace orders and Pi volume for {new Date().getFullYear()}.</p></div><span>Live · 15 sec</span></header>
            <div className="admin-statistics-legend"><span><i /> Orders</span><span><i /> Pi volume</span></div>
            <div className="admin-statistics-chart">
              <svg viewBox="0 0 1100 250" role="img" aria-label="Monthly orders and Pi volume statistics" preserveAspectRatio="none"><polyline className="orders" points={chartPoints("orders")} /><polyline className="volume" points={chartPoints("volume")} /></svg>
              <div>{["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].map((month) => <span key={month}>{month}</span>)}</div>
            </div>
          </section>
          <section className="admin-dashboard-lower">
            <article className="admin-demographic-card">
              <header><h2>Customers Demographic</h2><p>Real users grouped by country.</p></header>
              {demographics.length ? <div>{demographics.map(([country, count]) => <div key={country}><span><b>{country}</b><small>{count} customer{count === 1 ? "" : "s"}</small></span><i><b style={{ width: ((count / Math.max(dashboardUsers.length, 1)) * 100) + "%" }} /></i><strong>{Math.round((count / Math.max(dashboardUsers.length, 1)) * 100)}%</strong></div>)}</div> : <div className="private-state compact"><p>No customer country data yet.</p></div>}
            </article>
            <article className="admin-recent-orders-card">
              <header><div><h2>Recent Orders</h2><p>Latest real marketplace orders.</p></div><Link to="/admin/orders">See all</Link></header>
              {dashboardOrders.length ? <div className="admin-recent-orders-table">{dashboardOrders.slice(0,5).map((order) => <Link to="/admin/orders" key={order._id}><span><img src={order.productImage} alt="" /><b>{order.productTitle}</b></span><small>{order.sellerName}</small><strong>{formatPiAmount(order.pricePi)}</strong><em className={order.status}>{order.status}</em></Link>)}</div> : <div className="private-state compact"><p>No orders yet.</p></div>}
            </article>
          </section>
          <section className="management-list admin-activity-list">
            {activity.length ? activity.map((item) => (
              <article className="report-card" key={`${item.type}-${item.createdAt}-${item.description}`}>
                <div>
                  <span>{item.label}</span>
                  <h3>{item.description}</h3>
                  <p>{new Date(item.createdAt).toLocaleString()}</p>
                </div>
                {item.href ? <Link to={item.href}>Open</Link> : null}
              </article>
            )) : <div className="private-state compact"><h3>No admin activity yet</h3><p>Real database activity will appear here when users, products, orders, reports, or applications are created.</p></div>}
          </section>
        </>
      )}
    </main>
  );
};

type AdminUser = User & { _id: string; blocked?: boolean; verificationRequested?: boolean; verificationStatus?: "none" | "pending" | "approved" | "rejected"; verificationRequestType?: "pi_verified" | "seller_verified" | "trusted_seller" };

export const AdminUsersPage = () => {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [message, setMessage] = useState("");
  const load = useCallback(async () => setUsers((await axiosClient.get("/admin/users")).data.users), []);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  const update = async (id: string, body: object) => { await axiosClient.patch(`/admin/users/${id}`, body); setMessage("User updated."); await load(); };

  return (
    <main className="private-page">
      <Head title="Users" description="Manage access, roles, and seller verification requests." />
      <Notice text={message} />
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead><tr><th>User</th><th>Role</th><th>Verification</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>{users.map((user) => (
            <tr key={user._id}>
              <td><strong>{user.displayName}</strong><small>@{user.piUsername || user.username}{user.verificationRequested || user.verificationStatus === "pending" ? ` - Requested ${user.verificationRequestType === "trusted_seller" ? "Trusted Seller" : user.verificationRequestType === "seller_verified" ? "Seller Verified" : "Pi Verified"}` : ""}</small></td>
              <td><select value={user.role} onChange={(event) => void update(user._id, { role: event.target.value })}><option>buyer</option><option>seller</option><option>admin</option></select></td>
              <td>
                <select value={user.verificationLevel || "basic"} onChange={(event) => void update(user._id, { verificationLevel: event.target.value })}><option value="basic">Basic</option><option value="pi_verified">Pi Verified</option><option value="seller_verified">Seller Verified</option><option value="trusted_seller">Trusted Seller</option></select>
                <select value={user.verificationStatus || "none"} onChange={(event) => void update(user._id, { verificationStatus: event.target.value, verificationLevel: event.target.value === "approved" ? user.verificationLevel || "pi_verified" : user.verificationLevel })}><option value="none">No badge</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option></select>
              </td>
              <td>{user.blocked ? "Blocked" : "Active"}</td>
              <td>
                <div className="row-actions">
                  {user.verificationRequested || user.verificationStatus === "pending" ? <button onClick={() => void update(user._id, { verificationLevel: user.verificationRequestType || "pi_verified", verificationStatus: "approved" })}>Approve</button> : null}
                  {user.verificationRequested || user.verificationStatus === "pending" ? <button onClick={() => void update(user._id, { verificationStatus: "rejected" })}>Reject</button> : null}
                  {user.verificationStatus === "approved" ? <button onClick={() => void update(user._id, { verificationLevel: "basic", verificationStatus: "none" })}>Remove Badge</button> : null}
                  <button onClick={() => void update(user._id, { blocked: !user.blocked })}>{user.blocked ? "Unblock" : "Block"}</button>
                </div>
              </td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </main>
  );
};

type OnboardingApplication = {
  _id: string;
  fullName: string;
  email: string;
  applicationType: string;
  location: string;
  details: string;
  status: "pending" | "approved" | "rejected" | "contacted";
  createdAt: string;
};

export const AdminOnboardingPage = () => {
  const [applications, setApplications] = useState<OnboardingApplication[]>([]);
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState("all");
  const load = useCallback(async () => setApplications((await axiosClient.get("/admin/onboarding")).data.applications), []);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  const update = async (id: string, status: OnboardingApplication["status"]) => {
    await axiosClient.patch(`/admin/onboarding/${id}`, { status });
    setMessage(`Application marked ${status}.`);
    await load();
  };
  const visible = useMemo(() => filter === "all" ? applications : applications.filter((item) => item.status === filter), [applications, filter]);

  return (
    <main className="private-page">
      <Head title="Onboarding Applications" description="Review sellers, service providers, partners, and community contributors." />
      <Notice text={message} />
      <section className="admin-filter-bar">
        <label>Status filter<select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">All</option><option value="pending">Pending</option><option value="contacted">Contacted</option><option value="approved">Approved</option><option value="rejected">Rejected</option></select></label>
        <span>{visible.length} applications</span>
      </section>
      {visible.length ? <div className="management-list">{visible.map((item) => (
        <article className="report-card onboarding-admin-card" key={item._id}>
          <div><span>{item.applicationType} - {item.status}</span><h3>{item.fullName}</h3><p>{item.email} - {item.location}</p><p>{item.details}</p><small>{new Date(item.createdAt).toLocaleString()}</small></div>
          <strong className={item.status === "approved" ? "resolved" : "open"}>{item.status}</strong>
          <div className="row-actions"><button onClick={() => void update(item._id, "contacted")}>Contacted</button><button onClick={() => void update(item._id, "approved")}>Approve</button><button className="danger" onClick={() => void update(item._id, "rejected")}>Reject</button></div>
        </article>
      ))}</div> : <div className="private-state"><h2>No onboarding applications</h2><p>Try another filter or wait for new public applications.</p></div>}
    </main>
  );
};

type AmbassadorApplication = {
  _id: string;
  userId: string;
  displayName: string;
  email: string;
  phone: string;
  countryName: string;
  countryFlag?: string;
  regionName: string;
  services: string[];
  message: string;
  identity?: { idFrontUrl?: string; idBackUrl?: string; selfieUrl?: string };
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  updatedAt: string;
};

export const AdminAmbassadorsPage = () => {
  const [applications, setApplications] = useState<AmbassadorApplication[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("pending");
  const [updatingId, setUpdatingId] = useState("");
  const load = useCallback(async () => {
    try {
      const { data } = await axiosClient.get<{ applications: AmbassadorApplication[] }>("/admin/ambassadors");
      setApplications(data.applications || []);
      setError("");
    } catch {
      setError("Ambassador applications could not load. Check admin access and the backend connection.");
    }
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  const update = async (id: string, status: AmbassadorApplication["status"]) => {
    setUpdatingId(id);
    setError("");
    try {
      await axiosClient.patch(`/admin/ambassadors/${id}`, { status });
      setMessage(`Ambassador application ${status}. The applicant was notified.`);
      await load();
    } catch {
      setError("The ambassador application could not be updated.");
    } finally {
      setUpdatingId("");
    }
  };
  const visible = useMemo(() => filter === "all" ? applications : applications.filter((item) => item.status === filter), [applications, filter]);

  return (
    <main className="private-page">
      <PullToRefresh onRefresh={load} />
      <Head title="Ambassador Applications" description="Privately review regional ambassador applications, identity evidence, and service coverage." />
      <Notice text={message} />
      {error ? <div className="private-alert error">{error}</div> : null}
      <section className="admin-filter-bar">
        <label>Status filter<select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">All</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option></select></label>
        <span>{visible.length} applications</span>
      </section>
      {visible.length ? <div className="management-list">{visible.map((item) => (
        <article className="report-card onboarding-admin-card ambassador-admin-card" key={item._id}>
          <div>
            <span>{item.countryFlag} {item.countryName} · {item.regionName}</span>
            <h3>{item.displayName}</h3>
            <p>{item.email} · {item.phone}</p>
            <p><strong>Services:</strong> {item.services.includes("all") ? "All SMAJ services" : item.services.join(" · ")}</p>
            <p>{item.message}</p>
            <small>Submitted {new Date(item.createdAt || item.updatedAt).toLocaleString()}</small>
            <div className="ambassador-admin-identity" aria-label="Private identity evidence">
              {item.identity?.idFrontUrl ? <a href={item.identity.idFrontUrl} target="_blank" rel="noreferrer"><img src={item.identity.idFrontUrl} alt="ID front" /><span>ID front</span></a> : null}
              {item.identity?.idBackUrl ? <a href={item.identity.idBackUrl} target="_blank" rel="noreferrer"><img src={item.identity.idBackUrl} alt="ID back" /><span>ID back</span></a> : null}
              {item.identity?.selfieUrl ? <a href={item.identity.selfieUrl} target="_blank" rel="noreferrer"><img src={item.identity.selfieUrl} alt="Applicant selfie" /><span>Live selfie</span></a> : null}
            </div>
          </div>
          <strong className={item.status === "approved" ? "resolved" : "open"}>{item.status}</strong>
          <div className="row-actions"><button disabled={updatingId === item._id} onClick={() => void update(item._id, "pending")}>Pending</button><button disabled={updatingId === item._id} onClick={() => void update(item._id, "approved")}>Approve</button><button className="danger" disabled={updatingId === item._id} onClick={() => void update(item._id, "rejected")}>Reject</button></div>
        </article>
      ))}</div> : <div className="private-state"><h2>No ambassador applications</h2><p>No applications match this status filter.</p></div>}
    </main>
  );
};

export const AdminJobsReviewPage = () => {
  const [jobs, setJobs] = useState<JobsAdminReviewJob[]>([]);
  const [companies, setCompanies] = useState<JobsAdminReviewCompany[]>([]);
  const [companyReviewQuery, setCompanyReviewQuery] = useState("");
  const [companyReviewFilter, setCompanyReviewFilter] = useState("all");
  const [companyUpdatingId, setCompanyUpdatingId] = useState("");
  const [profiles, setProfiles] = useState<JobsAdminReviewProfile[]>([]);
  const [salaryDisputes, setSalaryDisputes] = useState<JobsSalaryDispute[]>([]);
  const [message, setMessage] = useState("");
  const load = useCallback(async () => {
    const [data, disputes] = await Promise.all([getJobsAdminReview(), getJobsSalaryDisputes()]);
    setJobs(data.jobs);
    setCompanies(data.companies);
    setProfiles(data.profiles);
    setSalaryDisputes(disputes);
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  const visibleCompanies = useMemo(() => {
    const query = companyReviewQuery.trim().toLowerCase();
    return companies.filter(company => {
      const stage = company.verificationEvidence && company.verificationStatus === "pending" ? "verification" : "listing";
      const matchesQuery = !query || [company.name, company.field, company.website, company.verificationEvidence?.businessEmail]
        .some(value => String(value || "").toLowerCase().includes(query));
      return matchesQuery && (companyReviewFilter === "all" || companyReviewFilter === stage);
    });
  }, [companies, companyReviewFilter, companyReviewQuery]);
  const reportError = (error: unknown, fallback: string) =>
    showFeedback((error as { response?: { data?: { message?: string } } }).response?.data?.message || fallback, "error");
  const decideJob = async (id: string, status: "approved" | "rejected") => {
    try {
      await moderateJobPosting(id, status);
      setMessage(`Job ${status}.`);
      await load();
    } catch (error) {
      reportError(error, "Job could not be updated.");
    }
  };
  const decideCompany = async (company: JobsAdminReviewCompany, action: "approved" | "verified" | "pi_kyb" | "rejected") => {
    if (companyUpdatingId) return;
    setCompanyUpdatingId(company.id);
    try {
      const hasVerificationEvidence = Boolean(company.verificationEvidence && company.verificationStatus === "pending");
      if (action === "approved") {
        await moderateJobCompany(company.id, "approved");
        setMessage(`${company.name} approved for the company directory.`);
      } else if (action === "rejected") {
        await Promise.all([
          moderateJobCompany(company.id, "rejected"),
          ...(hasVerificationEvidence ? [verifyJobsCompany(company.id, "rejected")] : []),
        ]);
        setMessage(`${company.name} rejected.`);
      } else {
        await Promise.all([verifyJobsCompany(company.id, action), moderateJobCompany(company.id, "approved")]);
        setMessage(`${company.name} ${action === "pi_kyb" ? "approved with Pi KYB" : "verified"}.`);
      }
      await load();
    } catch (error) {
      reportError(error, "Company could not be updated.");
    } finally {
      setCompanyUpdatingId("");
    }
  };
  const decideCandidate = async (userId: string, status: "verified" | "rejected") => {
    try {
      await verifyJobsCandidate(userId, status);
      setMessage(`Candidate ${status === "verified" ? "verified" : "rejected"}.`);
      await load();
    } catch (error) {
      reportError(error, "Candidate could not be updated.");
    }
  };

  const decideSalaryDispute = async (dispute: JobsSalaryDispute, outcome: "payment_confirmed" | "payment_voided") => {
    const resolution = window.prompt("Admin resolution note", "") || "";
    if (resolution.trim().length < 5) {
      showFeedback("Add a short resolution note before closing the dispute.", "error");
      return;
    }
    try {
      await resolveJobsSalaryDispute(dispute.disputeId, outcome, resolution);
      setMessage(outcome === "payment_confirmed" ? "Salary payment confirmed." : "Salary payment record voided.");
      await load();
    } catch (error) {
      reportError(error, "Salary dispute could not be resolved.");
    }
  };
  return (
    <main className="private-page">
      <Head title="Jobs Review" description="Approve job postings and review employer and candidate verification requests." />
      <Notice text={message} />

      <section className="admin-filter-bar"><span>{jobs.length} job postings pending review</span></section>
      {jobs.length ? <div className="management-list">{jobs.map((job) => (
        <article className="report-card" key={job.id}>
          <div>
            <span>{job.category} · {job.type}</span>
            <h3>{job.title}</h3>
            <p>{job.company} · {job.location}</p>
            <small>{job.createdAt ? new Date(job.createdAt).toLocaleString() : ""}</small>
          </div>
          <div className="row-actions">
            <button onClick={() => void decideJob(job.id, "approved")}>Approve</button>
            <button className="danger" onClick={() => void decideJob(job.id, "rejected")}>Reject</button>
          </div>
        </article>
      ))}</div> : <div className="private-state"><h2>No job postings awaiting review</h2><p>New postings will show here until approved.</p></div>}

      <section className="admin-filter-bar admin-company-review-filter">
        <label>Search companies<input type="search" value={companyReviewQuery} onChange={event => setCompanyReviewQuery(event.target.value)} placeholder="Name, industry, or email" /></label>
        <label>Review stage<select value={companyReviewFilter} onChange={event => setCompanyReviewFilter(event.target.value)}><option value="all">All stages</option><option value="listing">Listing review</option><option value="verification">Verification evidence</option></select></label>
        <span>{visibleCompanies.length} company requests</span>
      </section>
      {visibleCompanies.length ? <div className="management-list admin-company-review-list">{visibleCompanies.map((company) => {
        const hasVerificationEvidence = Boolean(company.verificationEvidence && company.verificationStatus === "pending");
        return (
          <article className="report-card admin-company-review-card" key={company.id}>
            <div>
              <span>{hasVerificationEvidence ? "Verification evidence" : "Company listing"} · {company.field}</span>
              <h3><Link to={`/services/jobs/company/${company.id}`}>{company.name}</Link></h3>
              <p>{company.website || "No website provided"}</p>
              {company.verificationEvidence ? (
                <div className="admin-company-evidence">
                  <p><b>Registration:</b> {company.verificationEvidence.registrationNumber || "Not supplied"}</p>
                  <p><b>Business email:</b> {company.verificationEvidence.businessEmail || "Not supplied"}</p>
                  <p><b>Representative:</b> {company.verificationEvidence.representativeRole || "Not supplied"}</p>
                  {company.verificationEvidence.notes ? <p><b>Evidence notes:</b> {company.verificationEvidence.notes}</p> : null}
                </div>
              ) : <p className="admin-company-stage-note">Basic listing details only. Verification evidence has not been submitted.</p>}
              <small>{company.verificationRequestedAt ? new Date(company.verificationRequestedAt).toLocaleString() : "Awaiting listing review"}</small>
            </div>
            <strong className="open">{hasVerificationEvidence ? "VERIFY" : "LISTING"}</strong>
            <div className="row-actions">
              <Link to={`/services/jobs/company/${company.id}`}>Profile</Link>
              {hasVerificationEvidence ? <>
                <button disabled={companyUpdatingId === company.id} onClick={() => void decideCompany(company, "verified")}>Verify</button>
                <button disabled={companyUpdatingId === company.id} onClick={() => void decideCompany(company, "pi_kyb")}>Pi KYB</button>
              </> : <button disabled={companyUpdatingId === company.id} onClick={() => void decideCompany(company, "approved")}>Approve listing</button>}
              <button className="danger" disabled={companyUpdatingId === company.id} onClick={() => void decideCompany(company, "rejected")}>Reject</button>
            </div>
          </article>
        );
      })}</div> : <div className="private-state"><h2>No matching company requests</h2><p>New listing and verification submissions will appear here.</p></div>}

      <section className="admin-filter-bar"><span>{profiles.length} candidate verification requests</span></section>
      <section className="admin-filter-bar"><span>{salaryDisputes.length} salary payment disputes</span></section>
      {salaryDisputes.length ? <div className="management-list">{salaryDisputes.map(dispute => (
        <article className="report-card" key={dispute.disputeId}>
          <div>
            <span>Salary dispute · {dispute.status}</span>
            <h3>{dispute.paymentRecordId}</h3>
            <p>{dispute.reason}</p>
            <small>{new Date(dispute.createdAt).toLocaleString()}</small>
          </div>
          {dispute.status === "open" ? <div className="row-actions">
            <button onClick={() => void decideSalaryDispute(dispute, "payment_confirmed")}>Confirm payment</button>
            <button className="danger" onClick={() => void decideSalaryDispute(dispute, "payment_voided")}>Void record</button>
          </div> : <strong className="resolved">{dispute.status}</strong>}
        </article>
      ))}</div> : <div className="private-state"><h2>No salary disputes</h2><p>Candidate payment disputes will appear here for review.</p></div>}
      {profiles.length ? <div className="management-list">{profiles.map((profile) => (
        <article className="report-card" key={profile.userId}>
          <div>
            <span>{profile.title || "Candidate"}</span>
            <h3>{profile.candidateName}</h3>
            {profile.verificationEvidence ? <p>{profile.verificationEvidence.credential || "No credential provided"}</p> : null}
            <small>{profile.verificationRequestedAt ? new Date(profile.verificationRequestedAt).toLocaleString() : ""}</small>
          </div>
          <div className="row-actions">
            <button onClick={() => void decideCandidate(profile.userId, "verified")}>Verify</button>
            <button className="danger" onClick={() => void decideCandidate(profile.userId, "rejected")}>Reject</button>
          </div>
        </article>
      ))}</div> : <div className="private-state"><h2>No candidate verification requests</h2><p>Candidate verification submissions will show here.</p></div>}
    </main>
  );
};

export const AdminProductsPage = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState("all");
  const [dialog, setDialog] = useState<{ type: "reject" | "delete"; product: Product } | null>(null);
  const [dialogBusy, setDialogBusy] = useState(false);
  const load = useCallback(async () => setProducts((await axiosClient.get("/admin/products")).data.products), []);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  const update = async (id: string, body: object) => {
    try {
      await axiosClient.patch(`/admin/products/${id}`, body);
      setMessage("Product updated.");
      await load();
    } catch (error) {
      showFeedback((error as { response?: { data?: { message?: string } } }).response?.data?.message || "Product could not be updated.", "error");
    }
  };
  const completeDialog = async (value: string) => {
    if (!dialog) return;
    try {
      setDialogBusy(true);
      if (dialog.type === "reject") await axiosClient.patch(`/admin/products/${dialog.product._id}`, { approved: false, hidden: false, rejectionReason: value });
      else await axiosClient.delete(`/admin/products/${dialog.product._id}`);
      setMessage(dialog.type === "reject" ? "Product rejected." : "Product deleted.");
      setDialog(null);
      await load();
    } catch (error) {
      showFeedback((error as { response?: { data?: { message?: string } } }).response?.data?.message || `Product could not be ${dialog.type === "reject" ? "rejected" : "deleted"}.`, "error");
    } finally {
      setDialogBusy(false);
    }
  };
  const visible = useMemo(() => products.filter((product) => filter === "all" || (filter === "pending" && (product.reviewStatus || (product.approved === false ? "pending" : "approved")) === "pending" && !product.hidden) || (filter === "visible" && product.approved === true && product.reviewStatus === "approved" && !product.hidden) || (filter === "rejected" && product.reviewStatus === "rejected") || (filter === "hidden" && product.hidden)), [products, filter]);

  return (
    <main className="private-page">
      <Head title="Products" description="Approve, hide, or remove marketplace listings." />
      <Notice text={message} />
      <section className="admin-filter-bar">
        <label>Status filter<select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">All</option><option value="pending">Pending review</option><option value="visible">Visible</option><option value="rejected">Rejected</option><option value="hidden">Hidden</option></select></label>
        <span>{visible.length} products</span>
      </section>
      <div className="management-list">{visible.map((product) => (
        <article className="management-row" key={product._id}>
          <img src={product.image} alt="" />
          <div className="management-main"><h3>{product.title}</h3><p>{product.sellerName} - {formatPiAmount(product.pricePi)}</p></div>
          <span className={`availability ${product.hidden || product.reviewStatus !== "approved" ? "sold" : "available"}`}>{product.hidden ? "Hidden" : product.reviewStatus === "rejected" ? "Rejected" : product.reviewStatus === "approved" ? "Visible" : "Pending"}</span>
          {product.rejectionReason ? <small>{product.rejectionReason}</small> : null}
          <div className="row-actions"><button onClick={() => void update(product._id, { approved: true, hidden: false })}>Approve</button><button onClick={() => setDialog({ type: "reject", product })}>Reject</button><button onClick={() => void update(product._id, { hidden: !product.hidden })}>{product.hidden ? "Show" : "Hide"}</button><button className="danger" onClick={() => setDialog({ type: "delete", product })}>Delete</button></div>
        </article>
      ))}</div>
      <ActionDialog open={Boolean(dialog)} title={dialog?.type === "reject" ? `Reject “${dialog.product.title}”?` : `Delete “${dialog?.product.title || "product"}”?`} description={dialog?.type === "reject" ? "The seller will see this reason and can update the listing." : "This permanently removes the listing and cannot be undone."} confirmLabel={dialog?.type === "reject" ? "Reject product" : "Delete product"} danger busy={dialogBusy} inputLabel={dialog?.type === "reject" ? "Rejection reason" : undefined} initialValue={dialog?.product.rejectionReason || "Product photos, price, description, or seller details need review."} minLength={5} onCancel={() => setDialog(null)} onConfirm={value => void completeDialog(value)} />
    </main>
  );
};

type OrderDispute = { _id: string; orderId: string; reason: string; status: "open" | "under_review" | "resolved" | "rejected"; openedByRole: string; createdAt: string };

export const AdminOrdersPage = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [disputes, setDisputes] = useState<OrderDispute[]>([]);
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState<Order | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const load = useCallback(async () => {
    const [orderResponse, disputeResponse] = await Promise.all([
      axiosClient.get("/admin/orders"),
      axiosClient.get("/admin/disputes"),
    ]);
    setOrders(orderResponse.data.orders);
    setDisputes(disputeResponse.data.disputes);
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  const update = async (id: string, status: string) => {
    try {
      await axiosClient.patch(`/admin/orders/${id}`, { status });
      setMessage("Order status updated.");
      await load();
    } catch (error) {
      setMessage(isAxiosError<{ message?: string }>(error) ? error.response?.data?.message || "Could not update order." : "Could not update order.");
    }
  };
  const updateRefund = async (order: Order, action: "approve" | "reject" | "complete") => {
    const value = window.prompt(action === "complete" ? "Enter the Pi refund transaction reference" : "Enter an administrator note", "");
    if (value === null) return;
    try {
      await axiosClient.patch(`/admin/orders/${order._id}/refund`, action === "complete" ? { action, reference: value } : { action, note: value });
      setMessage("Refund workflow updated.");
      setSelected(null);
      await load();
    } catch (error) {
      setMessage(isAxiosError<{ message?: string }>(error) ? error.response?.data?.message || "Could not update refund." : "Could not update refund.");
    }
  };
  const updateDispute = async (dispute: OrderDispute, status: "under_review" | "resolved" | "rejected") => {
    const resolution = ["resolved", "rejected"].includes(status) ? window.prompt("Enter the dispute resolution", "") : "";
    if (resolution === null) return;
    await axiosClient.patch(`/admin/disputes/${dispute._id}`, { status, resolution });
    setMessage("Dispute updated.");
    await load();
  };
  const nextStatuses = (status: OrderStatus) => ({
    pending: ["cancelled"],
    paid: ["processing"],
    processing: ["shipped"],
    shipped: ["delivered", "completed"],
    delivered: ["completed"],
    completed: [],
    cancelled: [],
  }[status] as OrderStatus[]);
  const filteredOrders = statusFilter === "all" ? orders : orders.filter((order) => order.status === statusFilter);

  return (
    <main className="private-page">
      <Head title="Orders" description="Review lifecycle, refunds, and disputes without bypassing fulfillment rules." />
      <Notice text={message} />
      <section className="admin-filter-bar"><label>Status filter<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All statuses</option><option value="pending">Pending</option><option value="paid">Paid</option><option value="processing">Processing</option><option value="shipped">Shipped</option><option value="delivered">Delivered</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></label><span>{filteredOrders.length} orders</span></section>
      {filteredOrders.length ? <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Product</th><th>Buyer / Seller</th><th>Price</th><th>Status</th><th>Action</th></tr></thead><tbody>{filteredOrders.map((order) => <tr key={order._id}><td>{order.productTitle}</td><td><small>{order.buyerName}<br />{order.sellerName}</small></td><td>{formatPiAmount(order.pricePi)}</td><td><select value="" disabled={!nextStatuses(order.status).length} onChange={(event) => void update(order._id, event.target.value)}><option value="">{order.status}</option>{nextStatuses(order.status).map(status => <option key={status} value={status}>Mark {status}</option>)}</select></td><td><button onClick={() => setSelected(order)}>Details</button></td></tr>)}</tbody></table></div> : <div className="private-state compact"><h3>No matching orders</h3><p>Choose another status to view more orders.</p></div>}
      {selected ? <div className="detail-panel"><button onClick={() => setSelected(null)}>Close</button><h2>{selected.productTitle}</h2><p>Order ID: {selected._id}</p><p>Payment ID: {selected.paymentId || "Not paid"}</p><p>Transaction: {selected.paymentTxid || "Not available"}</p><p>Refund: {selected.refundStatus || "None"}</p><p>Dispute: {selected.disputeStatus || "None"}</p><p>Created: {new Date(selected.createdAt).toLocaleString()}</p>{selected.refundStatus === "requested" ? <><button onClick={() => void updateRefund(selected, "approve")}>Approve refund</button><button onClick={() => void updateRefund(selected, "reject")}>Reject refund</button></> : null}{selected.refundStatus === "manual_required" ? <button onClick={() => void updateRefund(selected, "complete")}>Record Pi refund</button> : null}</div> : null}
      <section className="orders-section"><div className="section-title"><div><h2>Order disputes</h2><p>Open cases requiring administrator review.</p></div><span>{disputes.length}</span></div>{disputes.length ? <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Order</th><th>Opened by</th><th>Reason</th><th>Status</th><th>Actions</th></tr></thead><tbody>{disputes.map(dispute => <tr key={dispute._id}><td>{dispute.orderId}</td><td>{dispute.openedByRole}</td><td>{dispute.reason}</td><td>{dispute.status}</td><td>{dispute.status === "open" ? <button onClick={() => void updateDispute(dispute, "under_review")}>Review</button> : null}{["open", "under_review"].includes(dispute.status) ? <><button onClick={() => void updateDispute(dispute, "resolved")}>Resolve</button><button onClick={() => void updateDispute(dispute, "rejected")}>Reject</button></> : null}</td></tr>)}</tbody></table></div> : <div className="private-state compact"><p>No disputes.</p></div>}</section>
    </main>
  );
};

type Report = { _id: string; targetType: string; targetId: string; reason: string; details?: string; resolved?: boolean; createdAt: string; source?: "marketplace" | "support" };
export const AdminReportsPage = () => {
  const [reports, setReports] = useState<Report[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [message, setMessage] = useState("");
  const [loadError, setLoadError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState("open");
  const load = useCallback(async () => {
    setRefreshing(true);
    const [reportResponse, statsResponse, orderResponse, productResponse, userResponse] = await Promise.all([
      axiosClient.get("/admin/reports").catch(() => null),
      axiosClient.get("/admin/stats").catch(() => null),
      axiosClient.get("/admin/orders").catch(() => null),
      axiosClient.get("/admin/products").catch(() => null),
      axiosClient.get("/admin/users").catch(() => null),
    ]);
    if (reportResponse) setReports(reportResponse.data.reports || []);
    if (statsResponse) setStats(statsResponse.data.stats);
    if (orderResponse) setOrders(orderResponse.data.orders || []);
    if (productResponse) setProducts(productResponse.data.products || []);
    if (userResponse) setUsers(userResponse.data.users || []);
    const availability: Array<[string, unknown]> = [["reports", reportResponse], ["stats", statsResponse], ["orders", orderResponse], ["products", productResponse], ["users", userResponse]];
    const unavailable = availability.filter(([, response]) => !response).map(([name]) => name);
    setLoadError(unavailable.length ? "Some live data is unavailable: " + unavailable.join(", ") + ". Retrying automatically." : "");
    setRefreshing(false);
  }, []);
  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0);
    const interval = window.setInterval(() => void load(), 15_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, [load]);
  const resolve = async (report: Report) => {
    await axiosClient.patch(report.source === "support" ? `/admin/support/${report._id}/resolve` : `/admin/reports/${report._id}/resolve`);
    setMessage("Record resolved.");
    await load();
  };
  const visible = useMemo(() => reports.filter((report) => filter === "all" || (filter === "open" && !report.resolved) || (filter === "resolved" && report.resolved) || report.source === filter), [reports, filter]);
  const totalPi = useMemo(() => orders.filter((order) => ["paid", "processing", "shipped", "delivered", "completed"].includes(order.status)).reduce((sum, order) => sum + order.pricePi, 0), [orders]);
  const pendingRevenue = useMemo(() => orders.filter((order) => order.status === "pending").reduce((sum, order) => sum + order.pricePi, 0), [orders]);
  const visibleProducts = products.filter((product) => product.approved && !product.hidden).length;
  const trustedUsers = users.filter((user) => user.verificationStatus === "approved" && user.verificationLevel === "trusted_seller").length;
  const recentOrders = orders.slice(0, 5);
  const latestProducts = products.slice(0, 5);
  const transactionCandles = useMemo(() => {
    const grouped = new Map<string, number[]>();
    orders.forEach((order) => {
      const date = new Date(order.createdAt);
      if (Number.isNaN(date.getTime())) return;
      const key = date.toISOString().slice(0, 10);
      grouped.set(key, [...(grouped.get(key) || []), Number(order.pricePi || 0)]);
    });
    return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-12).map(([date, values]) => ({
      date,
      open: values[0],
      close: values[values.length - 1],
      high: Math.max(...values),
      low: Math.min(...values),
    }));
  }, [orders]);
  const candleMaximum = Math.max(...transactionCandles.map((candle) => candle.high), 1);

  return (
    <main className="private-page">
      <Head title="Analytics & Reports" description="Live platform metrics, marketplace health, reports, support, and operational signals." action={<button className="private-secondary-button" type="button" onClick={() => void load()} disabled={refreshing}>{refreshing ? "Refreshing..." : "Refresh live data"}</button>} />
      <Notice text={message} />
      {loadError ? <div className="private-alert error">{loadError}</div> : null}
      {!stats ? <PrivateSkeleton variant="stats" count={6} /> : (
        <>
          <section className="admin-analytics-grid">
            <article><span>Total users</span><strong>{stats.totalUsers}</strong><small>{trustedUsers} trusted sellers</small></article>
            <article><span>Products</span><strong>{stats.totalProducts}</strong><small>{visibleProducts} visible, {stats.pendingProducts} pending</small></article>
            <article><span>Orders</span><strong>{stats.totalOrders}</strong><small>{stats.pendingOrders} pending, {stats.paidOrders} paid/completed</small></article>
            <article><span>Paid volume</span><strong>{formatPiAmount(totalPi)}</strong><small>{formatPiAmount(pendingRevenue)} pending</small></article>
            <article><span>Open reports</span><strong>{stats.reportedProducts}</strong><small>{stats.supportRequests} support requests</small></article>
            <article><span>Onboarding</span><strong>{stats.pendingOnboarding}</strong><small>pending public applications</small></article>
          </section>
          <section className="admin-analytics-panels">
            <article>
              <div className="section-title compact"><div><h2>Recent orders</h2><p>Live order records from marketplace checkout.</p></div></div>
              {recentOrders.length ? recentOrders.map((order) => <div className="analytics-row" key={order._id}><span>{order.productTitle}</span><strong>{formatPiAmount(order.pricePi)}</strong><small>{order.status}</small></div>) : <p>No orders yet.</p>}
            </article>
            <article>
              <div className="section-title compact"><div><h2>Latest products</h2><p>Real seller listings and review status.</p></div></div>
              {latestProducts.length ? latestProducts.map((product) => <div className="analytics-row" key={product._id}><span>{product.title}</span><strong>{product.reviewStatus || "pending"}</strong><small>{product.sellerName}</small></div>) : <p>No products yet.</p>}
            </article>
          </section>
        </>
      )}
      <section className="admin-candle-panel">
        <div className="section-title compact"><div><p className="private-kicker">PI ORDER ANALYTICS</p><h2>Transaction candles</h2><p>Real order values grouped by day. Updated every 15 seconds.</p></div><span className="admin-live-chip"><i /> Live</span></div>
        {transactionCandles.length ? <div className="admin-candle-chart" role="img" aria-label="Daily Pi order value candlestick chart">
          {transactionCandles.map((candle) => {
            const top = ((candleMaximum - candle.high) / candleMaximum) * 100;
            const bottom = (candle.low / candleMaximum) * 100;
            const bodyTop = ((candleMaximum - Math.max(candle.open, candle.close)) / candleMaximum) * 100;
            const bodyHeight = Math.max(4, (Math.abs(candle.open - candle.close) / candleMaximum) * 100);
            const rising = candle.close >= candle.open;
            return <div className="admin-candle-column" key={candle.date} title={candle.date + " · O " + candle.open + " H " + candle.high + " L " + candle.low + " C " + candle.close}><div className="admin-candle-plot"><i style={{ top: top + "%", bottom: bottom + "%" }} /><b className={rising ? "rising" : "falling"} style={{ top: bodyTop + "%", height: bodyHeight + "%" }} /></div><small>{new Date(candle.date).toLocaleDateString([], { month: "short", day: "numeric" })}</small></div>;
          })}
        </div> : <div className="private-state compact"><h3>No transaction candles yet</h3><p>Candles will appear when real marketplace orders contain Pi values and timestamps.</p></div>}
      </section>
      <section className="admin-filter-bar"><label>Filter<select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="open">Open</option><option value="all">All</option><option value="marketplace">Marketplace</option><option value="support">Support</option><option value="resolved">Resolved</option></select></label><span>{visible.length} records</span></section>
      {visible.length === 0 ? <div className="private-state">No records match this filter.</div> : <div className="management-list">{visible.map((report) => <article className="report-card" key={`${report.source}-${report._id}`}><div><span>{report.source || "marketplace"} - {report.targetType}</span><h3>{report.reason}</h3><p>{report.details || `Target: ${report.targetId}`}</p></div><strong className={report.resolved ? "resolved" : "open"}>{report.resolved ? "Resolved" : "Open"}</strong>{!report.resolved ? <button onClick={() => void resolve(report)}>Mark resolved</button> : null}</article>)}</div>}
    </main>
  );
};

export const AdminSettingsPage = () => <main className="private-page"><Head title="Admin Settings" description="Administrative preferences use your main SMAJ settings." /><div className="private-state"><p>Theme, language, notifications, and logout are managed in account settings.</p><Link className="private-primary-button" to="/settings">Open Settings</Link></div></main>;

export const AdminUniversitiesPage = () => {
  const [universities, setUniversities] = useState<any[]>([]);
  const [claims, setClaims] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [message, setMessage] = useState("");
  const load = useCallback(async () => {
    try {
      const [uniResponse, claimsResponse, statsResponse] = await Promise.all([
        axiosClient.get("/admin/universities"),
        axiosClient.get("/admin/universities/claims"),
        axiosClient.get("/admin/universities/stats"),
      ]);
      setUniversities(uniResponse.data.universities);
      setClaims(claimsResponse.data.claims);
      setStats(statsResponse.data.stats);
    } catch {
      setMessage("Failed to load university data.");
    }
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  const updateClaim = async (id: string, reviewStatus: string, reviewNotes?: string) => {
    await axiosClient.patch(`/admin/universities/claims/${id}`, { review_status: reviewStatus, review_notes: reviewNotes });
    setMessage("Claim updated.");
    await load();
  };

  const updateUniversity = async (id: string, body: any) => {
    await axiosClient.patch(`/admin/universities/${id}`, body);
    setMessage("University updated.");
    await load();
  };

  return (
    <main className="private-page">
      <Head title="Universities" description="Manage university listings, partnerships, programs, claims, and Pi-enabled services." action={<button className="private-secondary-button" type="button" onClick={() => void load()}>Refresh</button>} />
      <Notice text={message} />
      {stats && (
        <section className="stats-grid admin-stats admin-summary-stats">
          <div><span>Total Universities</span><strong>{stats.totalUniversities}</strong></div>
          <div><span>Programs</span><strong>{stats.totalPrograms}</strong></div>
          <div><span>Pending Claims</span><strong>{stats.pendingClaims}</strong></div>
          <div><span>Applications</span><strong>{stats.totalApplications}</strong></div>
          <div><span>Completed Payments</span><strong>{stats.completedPayments}</strong></div>
        </section>
      )}
      <section className="management-list">
        <h2>Universities</h2>
        {universities.length === 0 ? <div className="private-state"><h3>No universities</h3><p>Add universities via the API or admin tools.</p></div> : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>University</th><th>Country</th><th>Type</th><th>Recognition</th><th>Partnership</th><th>Actions</th></tr></thead>
              <tbody>{universities.map((uni) => (
                <tr key={uni.id}>
                  <td><strong>{uni.official_name}</strong><small>{uni.short_name}</small></td>
                  <td>{uni.country}</td>
                  <td>{uni.institution_type}</td>
                  <td>{uni.recognition_status?.replace(/_/g, " ")}</td>
                  <td>{uni.partnership_status?.replace(/_/g, " ")}</td>
                  <td>
                    <div className="row-actions">
                      <button onClick={() => updateUniversity(uni.id, { partnership_status: uni.partnership_status === "smaj_verified_partner" ? "directory" : "smaj_verified_partner" })}>
                        {uni.partnership_status === "smaj_verified_partner" ? "Remove Partner" : "Make Partner"}
                      </button>
                      <button onClick={() => updateUniversity(uni.id, { pi_payments_enabled: !uni.pi_payments_enabled })}>
                        {uni.pi_payments_enabled ? "Disable Pi" : "Enable Pi"}
                      </button>
                      <button onClick={() => updateUniversity(uni.id, { applications_enabled: !uni.applications_enabled })}>
                        {uni.applications_enabled ? "Disable Apps" : "Enable Apps"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
      <section className="management-list">
        <h2>University Claims</h2>
        {claims.length === 0 ? <div className="private-state"><h3>No claims</h3><p>University representative claims will appear here.</p></div> : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>University</th><th>Representative</th><th>Email</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>{claims.map((claim) => (
                <tr key={claim.id}>
                  <td><strong>{claim.university_name}</strong></td>
                  <td>{claim.representative_full_name}<small>{claim.job_title}</small></td>
                  <td>{claim.institutional_email}</td>
                  <td>{claim.review_status?.replace(/_/g, " ")}</td>
                  <td>
                    <div className="row-actions">
                      <button onClick={() => void updateClaim(claim.id, "approved", "Identity verified.")}>Approve</button>
                      <button onClick={() => void updateClaim(claim.id, "rejected", "Could not verify authority.")}>Reject</button>
                      <button onClick={() => void updateClaim(claim.id, "additional_information_required", "Please provide more documents.")}>Request Info</button>
                    </div>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
};

export const AdminCoursesPage = () => {
  const [courses, setCourses] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [message, setMessage] = useState("");
  const load = useCallback(async () => {
    try {
      const [coursesResponse, statsResponse] = await Promise.all([
        axiosClient.get("/admin/courses"),
        axiosClient.get("/admin/courses/stats"),
      ]);
      setCourses(coursesResponse.data.courses);
      setStats(statsResponse.data.stats);
    } catch {
      setMessage("Failed to load courses.");
    }
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  const updateCourse = async (id: string, body: any) => {
    await axiosClient.patch(`/admin/courses/${id}`, body);
    setMessage("Course updated.");
    await load();
  };

  return (
    <main className="private-page">
      <Head title="Courses" description="Manage online courses, review submissions, and inspect enrollments." action={<button className="private-secondary-button" type="button" onClick={() => void load()}>Refresh</button>} />
      <Notice text={message} />
      {stats && (
        <section className="stats-grid admin-stats admin-summary-stats">
          <div><span>Total Courses</span><strong>{stats.totalCourses}</strong></div>
          <div><span>Published</span><strong>{stats.publishedCourses}</strong></div>
          <div><span>Drafts</span><strong>{stats.draftCourses}</strong></div>
          <div><span>Pending Review</span><strong>{stats.pendingReview}</strong></div>
          <div><span>Enrollments</span><strong>{stats.totalEnrollments}</strong></div>
          <div><span>Certificates</span><strong>{stats.totalCertificates}</strong></div>
        </section>
      )}
      <section className="management-list">
        <h2>Courses</h2>
        {courses.length === 0 ? <div className="private-state"><h3>No courses</h3><p>Courses will appear here once created.</p></div> : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>Course</th><th>Category</th><th>Type</th><th>Level</th><th>Status</th><th>Enrollments</th><th>Actions</th></tr></thead>
              <tbody>{courses.map((course) => (
                <tr key={course.id}>
                  <td><strong>{course.title}</strong><small>{course.short_description}</small></td>
                  <td>{course.category}</td>
                  <td>{course.course_type}</td>
                  <td>{course.level}</td>
                  <td>{course.status}</td>
                  <td>{course.enrollment_count}</td>
                  <td>
                    <div className="row-actions">
                      <button onClick={() => updateCourse(course.id, { status: course.status === "published" ? "archived" : "published" })}>
                        {course.status === "published" ? "Archive" : "Publish"}
                      </button>
                      <button onClick={() => updateCourse(course.id, { status: "rejected", review_notes: "Does not meet standards." })}>Reject</button>
                    </div>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
};
