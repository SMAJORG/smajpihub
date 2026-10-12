import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { isAxiosError } from "axios";
import { Link } from "react-router-dom";
import PrivateSkeleton from "../../components/PrivateSkeleton";
import PullToRefresh from "../../components/PullToRefresh";
import { axiosClient } from "../../lib/axiosClient";
import { formatPiAmount } from "../../lib/formatters";
import type { Order, OrderStatus, Product } from "../../types/marketplace";
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

export { default as AdminDashboardPage } from "./AdminOverviewPage";

export { default as AdminUsersPage } from "./AdminUsersPage";

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
  const [filter, setFilter] = useState("open");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    try { const response = await axiosClient.get<{ reports: Report[] }>("/admin/reports"); setReports(response.data.reports); setError(""); }
    catch { setError("Reports could not load. Refresh to retry."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const resolve = async (report: Report) => {
    try { await axiosClient.patch(report.source === "support" ? `/admin/support/${report._id}/resolve` : `/admin/reports/${report._id}/resolve`); setMessage("Record resolved."); await load(); }
    catch { setError("Could not resolve this report."); }
  };
  const visible = reports.filter(report => filter === "all" || (filter === "open" && !report.resolved) || (filter === "resolved" && report.resolved) || report.source === filter);
  return <main className="private-page"><Head title="Reports & support" description="Review marketplace reports and support requests." action={<Link className="private-secondary-button" to="/admin/analytics">Analytics overview</Link>} /><Notice text={message} />{error ? <div className="private-alert error">{error}</div> : null}<section className="admin-filter-bar"><label>Filter<select value={filter} onChange={event => setFilter(event.target.value)}><option value="open">Open</option><option value="all">All</option><option value="marketplace">Marketplace</option><option value="support">Support</option><option value="resolved">Resolved</option></select></label><button type="button" onClick={() => void load()}>Refresh</button></section>{loading ? <PrivateSkeleton variant="list" count={3} /> : !visible.length ? <div className="private-state">No reports match this filter.</div> : <div className="management-list">{visible.map(report => <article className="report-card" key={report.source + report._id}><div><span>{report.source || "marketplace"}</span><h3>{report.reason}</h3><p>{report.details || report.targetId}</p></div><strong>{report.resolved ? "Resolved" : "Open"}</strong>{!report.resolved ? <button onClick={() => void resolve(report)}>Mark resolved</button> : null}</article>)}</div>}</main>;
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
