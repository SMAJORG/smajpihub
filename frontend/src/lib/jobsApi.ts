import { axiosClient } from "./axiosClient";

export type JobsApiJob = {
  id: string;
  title: string;
  company: string;
  companyId?: string;
  location: string;
  type: string;
  mode: string;
  salary: string;
  compensationMinUsdt?: number;
  compensationMaxUsdt?: number;
  compensationPeriod?: string;
  piRateUsed?: number;
  category: string;
  featured?: boolean;
  freelance?: boolean;
  summary: string;
  skills: string[];
  status?: string;
  moderationStatus?: string;
  postedAt?: string;
  createdAt?: string;
  updatedAt?: string;
  expiresAt?: string;
};

export type JobsApiCompany = {
  id: string;
  name: string;
  field: string;
  openings: number;
  mark: string;
  verificationStatus?: "unclaimed" | "claimed" | "pending" | "verified" | "pi_kyb" | "rejected";
  ownerId?: string;
  website?: string;
  moderationStatus?: "pending" | "approved" | "rejected";
};

export type JobsApiInterview = { id: string; scheduledAt: string; note?: string; createdAt: string; createdBy: string };
export type JobsApiOffer = {
  offerId: string;
  amountPi: number;
  period: string;
  startDate?: string;
  terms?: string;
  status: "sent" | "accepted" | "declined" | "withdrawn";
  sentAt: string;
  respondedAt?: string;
};
export type JobsSalaryPayment = {
  id: string;
  paymentRecordId: string;
  applicationId: string;
  amountPi: number;
  txid: string;
  note?: string;
  status: "awaiting_candidate_confirmation" | "completed" | "disputed" | "voided";
  createdAt: string;
  confirmedAt?: string;
  disputeId?: string;
};
export type JobsApiApplication = {
  id: string;
  jobId: string;
  jobTitle: string;
  company: string;
  coverNote?: string;
  status: string;
  createdAt: string;
  candidateArchivedAt?: string;
  profileSnapshot?: JobsProfile;
  notes?: string;
  interviews?: JobsApiInterview[];
  offer?: JobsApiOffer;
};

export type JobsProfile = {
  title: string;
  skills: string[] | string;
  location: string;
  availability: string;
  portfolio: string;
  summary: string;
  updatedAt?: string;
  verificationStatus?: "unverified" | "pending" | "verified" | "rejected";
  avatarConfirmationStatus?: "confirmed" | "deferred";
  avatarConfirmationValue?: string;
  avatar?: string;
  cv?: {
    url: string;
    name: string;
    size: number;
    visibility: "applications" | "verified_employers" | "private";
    updatedAt: string;
  };
  blockedEmployerIds?: string[];
  employment?: Array<{
    id: string;
    position: string;
    employer: string;
    current: boolean;
    location: string;
    country: string;
    startMonth: string;
    startYear: string;
    endMonth: string;
    endYear: string;
    description: string;
  }>;
} & Partial<JobsPreferences>;
export type JobsPreferences = {
  jobsMode: "candidate" | "employer" | "both";
  minimumPayUsdt: number;
  payPeriod: "hour" | "day" | "week" | "month" | "year";
  preferredLocations: string[];
  remotePreference: "all" | "remote" | "onsite";
  openToAnywhere: boolean;
  preferredTitles: string[];
  preferredCategories: string[];
};
export type JobsMetrics = { opportunities: number; verifiedEmployers: number; remotePercent: number };
export type JobsPagination = { page: number; pageSize: number; total: number; pages: number };

export const getJobs = async (
  params: {
    search?: string;
    location?: string;
    category?: string;
    freelance?: boolean;
    page?: number;
    pageSize?: number;
  } = {}
) => {
  const response = await axiosClient.get<{ jobs: JobsApiJob[]; pagination: JobsPagination }>("/jobs/jobs", { params });
  return response.data;
};

export const getJobsMetrics = async () =>
  (await axiosClient.get<{ metrics: JobsMetrics }>("/jobs/metrics")).data.metrics;

export const getJobById = async (id: string) =>
  (await axiosClient.get<{ job: JobsApiJob }>(`/jobs/jobs/${encodeURIComponent(id)}`)).data.job;

export const getJobCompanies = async () => {
  const response = await axiosClient.get<{ companies: JobsApiCompany[] }>("/jobs/companies");
  return response.data.companies;
};

export const getCompanyById = async (id: string) =>
  (
    await axiosClient.get<{ company: JobsApiCompany; jobs: JobsApiJob[] }>(
      `/jobs/companies/${encodeURIComponent(id)}`
    )
  ).data;

export const toggleSavedJob = async (jobId: string) => {
  const response = await axiosClient.put<{ saved: boolean }>(`/jobs/saved/${encodeURIComponent(jobId)}`);
  return response.data.saved;
};

export const getSavedJobs = async () => {
  const response = await axiosClient.get<{ jobs: JobsApiJob[] }>("/jobs/saved");
  return response.data.jobs;
};

export const getJobApplications = async () => {
  const response = await axiosClient.get<{ applications: JobsApiApplication[] }>("/jobs/applications");
  return response.data.applications;
};
export type JobsActivity = {
  days: number;
  appearances: Array<{ date: string; count: number }>;
  totalAppearances: number;
  employerActions: Array<{ status: string; at: string; jobTitle: string; company: string }>;
};
export const getJobsActivity = async (days = 7) =>
  (await axiosClient.get<JobsActivity>("/jobs/activity", { params: { days } })).data;

export const applyToJob = async (jobId: string, coverNote = "") => {
  const response = await axiosClient.post<{ application: JobsApiApplication }>(
    `/jobs/jobs/${encodeURIComponent(jobId)}/apply`,
    { coverNote }
  );
  return response.data.application;
};

export const createJob = async (job: {
  title: string;
  companyId: string;
  location: string;
  type: string;
  mode: string;
  category: string;
  skills: string[];
  salary: string;
  summary: string;
  durationDays?: number;
  compensationMinUsdt: number;
  compensationMaxUsdt: number;
  compensationPeriod: string;
}) => {
  const response = await axiosClient.post<{ job: JobsApiJob }>("/jobs/jobs", job);
  return response.data.job;
};

export const getJobsProfile = async () =>
  (await axiosClient.get<{ profile: JobsProfile | null }>("/jobs/profile")).data.profile;
export const saveJobsProfile = async (profile: JobsProfile) =>
  (await axiosClient.put<{ profile: JobsProfile }>("/jobs/profile", profile)).data.profile;
export const saveJobsPreferences = async (preferences: JobsPreferences) =>
  (await axiosClient.patch<{ preferences: JobsPreferences }>("/jobs/preferences", preferences)).data.preferences;
export const confirmJobsProfileAvatar = async (avatar: string, status: "confirmed" | "deferred") =>
  (await axiosClient.patch("/jobs/profile/avatar-confirmation", { avatar, status })).data;
export const uploadJobsCv = async (document: string, name: string) =>
  (await axiosClient.post<{ url: string }>("/uploads/document", { document, name, purpose: "jobs-private-cv" })).data;
export const saveJobsCv = async (cv: { url: string; name: string; size: number; visibility: string }) =>
  (await axiosClient.put<{ cv: JobsProfile["cv"] }>("/jobs/profile/cv", cv)).data.cv;
export const deleteJobsCv = async () => axiosClient.delete("/jobs/profile/cv");
export const saveJobsProfileSection = async (section: string, values: Record<string, unknown>) =>
  (await axiosClient.patch("/jobs/profile/section", { section, ...values })).data;
export const toggleBlockedEmployer = async (companyId: string) =>
  (
    await axiosClient.put<{ blocked: boolean; blockedEmployerIds: string[] }>(
      `/jobs/profile/blocked-employers/${encodeURIComponent(companyId)}`
    )
  ).data;
export const enrollEmployer = async () => (await axiosClient.post<{ role: string }>("/jobs/employer/enroll")).data;
export const createJobCompany = async (company: { name: string; field: string }) =>
  (await axiosClient.post<{ company: JobsApiCompany }>("/jobs/companies", company)).data.company;
export const getEmployerDashboard = async () =>
  (
    await axiosClient.get<{ jobs: JobsApiJob[]; applications: JobsApiApplication[]; companies: JobsApiCompany[] }>(
      "/jobs/employer/dashboard"
    )
  ).data;
export const updateEmployerApplication = async (id: string, status: string) =>
  (await axiosClient.patch<{ status: string }>(`/jobs/employer/applications/${encodeURIComponent(id)}`, { status }))
    .data.status;
export const saveApplicationNotes = async (id: string, notes: string) =>
  (await axiosClient.patch<{ notes: string }>(`/jobs/employer/applications/${encodeURIComponent(id)}/notes`, { notes }))
    .data.notes;
export const scheduleApplicationInterview = async (id: string, scheduledAt: string, note = "") =>
  (
    await axiosClient.post<{ interview: JobsApiInterview }>(
      `/jobs/employer/applications/${encodeURIComponent(id)}/interviews`,
      { scheduledAt, note }
    )
  ).data.interview;
export const cancelApplicationInterview = async (id: string, interviewId: string) =>
  axiosClient.delete(`/jobs/employer/applications/${encodeURIComponent(id)}/interviews/${encodeURIComponent(interviewId)}`);
export const sendJobOffer = async (
  id: string,
  offer: { amountPi: number; period: string; startDate?: string; terms?: string }
) =>
  (
    await axiosClient.post<{ offer: JobsApiOffer; status: string }>(
      `/jobs/employer/applications/${encodeURIComponent(id)}/offer`,
      offer
    )
  ).data;
export const respondToJobOffer = async (id: string, decision: "accepted" | "declined") =>
  (
    await axiosClient.patch<{ status: string; offerStatus: string }>(
      `/jobs/applications/${encodeURIComponent(id)}/offer`,
      { decision }
    )
  ).data;
export const recordJobSalaryPayment = async (
  id: string,
  payment: { amountPi: number; txid: string; note?: string }
) =>
  (
    await axiosClient.post<{ payment: JobsSalaryPayment }>(
      `/jobs/employer/applications/${encodeURIComponent(id)}/payments`,
      payment
    )
  ).data.payment;
export const getJobSalaryPayments = async (id: string) =>
  (
    await axiosClient.get<{ payments: JobsSalaryPayment[] }>(
      `/jobs/applications/${encodeURIComponent(id)}/payments`
    )
  ).data.payments;
export const respondToJobSalaryPayment = async (
  applicationId: string,
  paymentId: string,
  action: "confirm" | "dispute",
  reason = ""
) =>
  (
    await axiosClient.patch(
      `/jobs/applications/${encodeURIComponent(applicationId)}/payments/${encodeURIComponent(paymentId)}`,
      { action, reason }
    )
  ).data;
export const withdrawJobApplication = async (id: string) =>
  (await axiosClient.patch<{ status: string }>(`/jobs/applications/${encodeURIComponent(id)}/withdraw`)).data.status;
export const archiveJobApplication = async (id: string) =>
  (await axiosClient.patch<{ candidateArchivedAt: string }>(`/jobs/applications/${encodeURIComponent(id)}/archive`)).data
    .candidateArchivedAt;
export const claimJobCompany = async (id: string, evidence: { website: string; evidence: string }) =>
  (await axiosClient.post(`/jobs/companies/${encodeURIComponent(id)}/claim`, evidence)).data;
export const requestCompanyVerification = async (
  id: string,
  evidence: { registrationNumber: string; businessEmail: string; representativeRole: string; notes: string }
) => (await axiosClient.post(`/jobs/companies/${encodeURIComponent(id)}/verification-request`, evidence)).data;
export const requestCandidateVerification = async (evidence: {
  portfolio: string;
  credential: string;
  notes: string;
}) => (await axiosClient.post("/jobs/profile/verification-request", evidence)).data;
export type JobsBillingPlan = { id: string; name: string; priceUsdt: number; pricePi: number; piRateUsed: number };
export type JobsBillingIntent = JobsBillingPlan & {
  billingId: string;
  employerId: string;
  jobId?: string;
  status: string;
  createdAt: string;
};
export const getJobsBillingPlans = async () =>
  (await axiosClient.get<{ plans: JobsBillingPlan[] }>("/jobs/billing/plans")).data.plans;
export const createJobsBillingIntent = async (planId: string, jobId?: string) =>
  (
    await axiosClient.post<{ intent: JobsBillingIntent; paymentEnabled: boolean; message?: string }>(
      "/jobs/billing/intents",
      { planId, jobId }
    )
  ).data;
export const approveJobsBillingPayment = async (billingId: string, paymentId: string) =>
  (await axiosClient.post("/jobs/billing/approve", { billingId, paymentId })).data;
export const completeJobsBillingPayment = async (billingId: string, paymentId: string, txid: string) =>
  (await axiosClient.post<{ job?: JobsApiJob }>("/jobs/billing/complete", { billingId, paymentId, txid })).data;
export const cancelJobsBillingPayment = async (billingId: string, paymentId: string) =>
  (await axiosClient.post("/jobs/billing/cancelled_payment", { billingId, paymentId })).data;

export type JobsAdminReviewJob = JobsApiJob & { employerId?: string };
export type JobsAdminReviewCompany = JobsApiCompany & {
  verificationEvidence?: { registrationNumber?: string; businessEmail?: string; representativeRole?: string; notes?: string };
  verificationRequestedAt?: string;
};
export type JobsAdminReviewProfile = {
  id: string;
  userId: string;
  candidateName: string;
  candidateAvatar?: string;
  title?: string;
  portfolio?: string;
  verificationEvidence?: { portfolio?: string; credential?: string; notes?: string };
  verificationRequestedAt?: string;
};
export const getJobsAdminReview = async () =>
  (
    await axiosClient.get<{ jobs: JobsAdminReviewJob[]; companies: JobsAdminReviewCompany[]; profiles: JobsAdminReviewProfile[] }>(
      "/jobs/admin/review"
    )
  ).data;
export const moderateJobPosting = async (id: string, status: "approved" | "rejected") =>
  (await axiosClient.patch<{ moderationStatus: string; status: string }>(`/jobs/admin/jobs/${encodeURIComponent(id)}/moderate`, { status })).data;
export const moderateJobCompany = async (id: string, status: "approved" | "rejected") =>
  (await axiosClient.patch<{ moderationStatus: string }>(`/jobs/admin/companies/${encodeURIComponent(id)}/moderate`, { status })).data;
export const verifyJobsCompany = async (id: string, status: "verified" | "pi_kyb" | "rejected") =>
  (await axiosClient.patch<{ verificationStatus: string }>(`/jobs/admin/companies/${encodeURIComponent(id)}/verify`, { status })).data;
export const verifyJobsCandidate = async (userId: string, status: "verified" | "rejected") =>
  (await axiosClient.patch<{ verificationStatus: string }>(`/jobs/admin/profiles/${encodeURIComponent(userId)}/verify`, { status })).data;

export type JobsSalaryDispute = {
  id: string;
  disputeId: string;
  paymentRecordId: string;
  applicationId: string;
  candidateId: string;
  employerId: string;
  reason: string;
  status: "open" | "resolved" | "closed";
  createdAt: string;
  resolution?: string;
};
export const getJobsSalaryDisputes = async () =>
  (await axiosClient.get<{ disputes: JobsSalaryDispute[] }>("/jobs/admin/disputes")).data.disputes;
export const resolveJobsSalaryDispute = async (
  id: string,
  outcome: "payment_confirmed" | "payment_voided",
  resolution: string,
) =>
  (await axiosClient.patch(`/jobs/admin/disputes/${encodeURIComponent(id)}`, { status: "resolved", outcome, resolution })).data;
export type JobsCandidateSearchResult = {
  userId: string;
  title: string;
  skills: string[];
  location: string;
  availability: string;
  summary: string;
  portfolio: string;
  avatar: string;
  displayName: string;
  verificationStatus?: string;
  cv?: { url: string; name: string; size: number; visibility: string; updatedAt?: string };
  employment: Array<{
    id: string;
    position: string;
    employer: string;
    current: boolean;
    location: string;
    country: string;
    startMonth: string;
    startYear: string;
    endMonth?: string;
    endYear?: string;
    description: string;
  }>;
  updatedAt: string;
};

export type JobsCandidateSearchResponse = {
  candidates: JobsCandidateSearchResult[];
  pagination: JobsPagination;
};

export const searchCandidates = async (params: {
  q?: string;
  location?: string;
  page?: number;
  pageSize?: number;
}) => {
  const response = await axiosClient.get<JobsCandidateSearchResponse>("/jobs/employer/candidates/search", { params });
  return response.data;
};

export const getCandidateProfile = async (userId: string) => {
  const response = await axiosClient.get<{ candidate: JobsCandidateSearchResult }>(
    `/jobs/employer/candidates/${encodeURIComponent(userId)}`
  );
  return response.data.candidate;
};

export type JobsEarningItem = {
  applicationId: string;
  jobId: string;
  jobTitle: string;
  company: string;
  status: string;
  agreedCompensationPi: number;
  compensationMinPi: number;
  compensationMaxPi: number;
  period: string;
  piRateUsed: number;
  completedPaymentsPi: number;
  pendingPaymentsPi: number;
  payments: JobsSalaryPayment[];
  offer?: JobsApiOffer;
  createdAt: string;
  updatedAt: string;
};
export type JobsEarningsSummary = {
  totalEarnedPi: number;
  pendingEarningsPi: number;
  completedPaymentsPi: number;
  hiredCount: number;
  applicationsCount: number;
};
export type JobsEarningsResponse = {
  items: JobsEarningItem[];
  summary: JobsEarningsSummary;
  serverTime: string;
};

export const getJobsEarnings = async () =>
  (await axiosClient.get<JobsEarningsResponse>("/jobs/earnings")).data;

export type JobsEmployerPayment = {
  billingId: string;
  planId: string;
  planName: string;
  amountPi: number;
  amountUsdt: number;
  piRateUsed: number;
  status: string;
  paymentId: string;
  txid: string;
  jobId?: string;
  createdAt: string;
  paidAt: string | null;
  updatedAt: string;
};
export type JobsEmployerPaymentsSummary = {
  total: number;
  paid: number;
  pending: number;
  cancelled: number;
};
export type JobsEmployerPaymentsResponse = {
  payments: JobsEmployerPayment[];
  summary: JobsEmployerPaymentsSummary;
  serverTime: string;
};

export const getJobsEmployerPayments = async () =>
  (await axiosClient.get<JobsEmployerPaymentsResponse>("/jobs/employer/payments")).data;
