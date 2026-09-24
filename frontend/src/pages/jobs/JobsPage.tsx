import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Link, NavLink, useNavigate, useNavigationType, useParams, useSearchParams } from "react-router-dom";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import ArchiveOutlinedIcon from "@mui/icons-material/ArchiveOutlined";
import BookmarkBorderRoundedIcon from "@mui/icons-material/BookmarkBorderRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import ChatOutlinedIcon from "@mui/icons-material/ChatOutlined";
import FilterListRoundedIcon from "@mui/icons-material/FilterListRounded";
import HomeRoundedIcon from "@mui/icons-material/HomeRounded";
import LocationOnOutlinedIcon from "@mui/icons-material/LocationOnOutlined";
import NotificationsNoneRoundedIcon from "@mui/icons-material/NotificationsNoneRounded";
import PersonOutlineRoundedIcon from "@mui/icons-material/PersonOutlineRounded";
import RemoveCircleOutlineRoundedIcon from "@mui/icons-material/RemoveCircleOutlineRounded";
import PhoneOutlinedIcon from "@mui/icons-material/PhoneOutlined";
import PauseRoundedIcon from "@mui/icons-material/PauseRounded";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import WorkOutlineRoundedIcon from "@mui/icons-material/WorkOutlineRounded";
import AppLayout from "../../layouts/AppLayout";
import {
  applyToJob,
  archiveJobApplication,
  cancelApplicationInterview,
  createJobCompany,
  createJob,
  createJobsBillingIntent,
  confirmJobsProfileAvatar,
  deleteJobsCv,
  enrollEmployer,
  getCompanyById,
  getEmployerDashboard,
  getJobApplications,
  getJobById,
  getJobCompanies,
  getJobs,
  getJobsMetrics,
  getJobsProfile,
  getJobsBillingPlans,
  getJobsActivity,
  getSavedJobs,
  saveJobsProfileSection,
  requestCandidateVerification,
  recordJobSalaryPayment,
  respondToJobOffer,
  respondToJobSalaryPayment,
  sendJobOffer,
  requestCompanyVerification,
  saveApplicationNotes,
  saveJobsCv,
  scheduleApplicationInterview,
  toggleBlockedEmployer,
  toggleSavedJob,
  uploadJobsCv,
  updateEmployerApplication,
  withdrawJobApplication as withdrawJobApplicationRequest,
  type JobsApiApplication,
  type JobsApiCompany,
  type JobsApiInterview,
  type JobsApiJob,
  type JobsMetrics,
  type JobsProfile,
  type JobsBillingPlan,
  type JobsActivity,
  searchCandidates,
  type JobsCandidateSearchResult,
  getJobsEarnings,
  type JobsEarningItem,
  type JobsEarningsSummary,
  getJobsEmployerPayments,
  type JobsEmployerPayment,
  type JobsEmployerPaymentsSummary,
} from "../../lib/jobsApi";
import JobsHeader from "./JobsHeader";
import CandidateCard from "../../components/CandidateCard";
import "./JobsPage.css";
import { JOB_CATEGORIES, JOB_COUNTRIES, JOB_LANGUAGES, JOB_PHONE_CODES } from "../../content/jobOptions";
import { formatPiAmount, formatUsdAmount } from "../../lib/formatters";
import { PI_USDT_RATE, piFromUsdt } from "../../lib/piPricing";
import { useAuthContext } from "../../contexts/AuthContext";
import { useJobsBillingPayment } from "../../hooks/useJobsBillingPayment";
import { axiosClient } from "../../lib/axiosClient";
import JobPreferencesPanel from "./JobPreferencesPanel";

export type JobsPageKind =
  | "home"
  | "search"
  | "freelance"
  | "companies"
  | "saved"
  | "applications"
  | "activity"
  | "profile"
  | "settings"
  | "visibility"
  | "account-settings"
  | "blocked-employers"
  | "post"
  | "employer"
  | "candidates"
  | "my-earnings"
  | "payments-billing"
  | "job"
  | "company";

type Job = JobsApiJob;
type JobsConversation = {
  _id: string;
  participantName?: string;
  lastMessage?: string;
  updatedAt?: string;
  unreadBy?: string[];
  contextType?: string;
  jobId?: string;
  applicationId?: string;
  jobTitle?: string;
  sellerId?: string;
};
type JobsChatMessage = { _id: string; senderId: string; senderName?: string; message: string; createdAt: string };

const formatJobsPi = (value: number) => `π ${value.toFixed(5).replace(/\.?0+$/, "")}`;
const salaryFromUsdt = (minimum: number, maximum: number, period: string) =>
  `${formatJobsPi(piFromUsdt(minimum))}${maximum > minimum ? `–${formatJobsPi(piFromUsdt(maximum)).replace("π ", "")}` : ""} / ${period}`;
const displayJobSalary = (job: Job) => {
  if (Number.isFinite(job.compensationMinUsdt) && Number(job.compensationMinUsdt) > 0) {
    return salaryFromUsdt(
      Number(job.compensationMinUsdt),
      Number(job.compensationMaxUsdt) || Number(job.compensationMinUsdt),
      job.compensationPeriod || "month",
    );
  }
  const legacyPi = job.salary?.trim().match(/^([\d,.]+)(?:[–-]([\d,.]+))?\s*Pi(?:\s*\/\s*([^\s]+)|\s+(fixed))?$/i);
  if (legacyPi) {
    const minimum = Number(legacyPi[1].replace(/,/g, ""));
    const maximum = Number((legacyPi[2] || legacyPi[1]).replace(/,/g, ""));
    return salaryFromUsdt(minimum, maximum, legacyPi[4] ? "project" : legacyPi[3] || "month");
  }
  return job.salary?.trim() || "Compensation not specified";
};
const formatJobDateTime = (value?: string) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const today = new Date();
  const dateLabel =
    date.toDateString() === today.toDateString()
      ? "today"
      : date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  return `${dateLabel} · ${date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
};
const formatJobDate = (value?: string) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
};
const normalizeJobLocation = (value: string) =>
  JOB_COUNTRIES.find(country => country.label === value)?.name || value.trim();
const employerJobTitleSuggestions = [
  "Cashier",
  "Sales Associate",
  "Delivery Driver",
  "Driver",
  "Line Cook",
  "Janitor",
  "Janitorial Worker",
  "Lube Technician",
  "Customer Support Specialist",
  "Frontend Developer",
  "Graphic Designer",
  "Software Engineer",
  "Product Designer",
  "Marketing Manager",
];
const employerLocationTypes = [
  { id: "in-person", title: "In person", detail: "Work from a set location", mode: "On-site", icon: "building" },
  { id: "on-the-road", title: "On the road", detail: "Travel to different sites", mode: "On-site", icon: "truck" },
  { id: "remote", title: "Remote", detail: "No on-site work required", mode: "Remote", icon: "home" },
  { id: "hybrid", title: "Hybrid", detail: "Some on-site work required", mode: "Hybrid", icon: "group" },
] as const;
const hiringTimeframes = ["1 to 3 days", "3 to 7 days", "1 to 2 weeks", "2 to 4 weeks", "More than 4 weeks"] as const;
const employerJobTypes = ["Full time", "Part time", "Contract", "Project"] as const;
const employerBenefits = [
  "401(k)", "Vision insurance", "Health insurance", "403(b)", "Paid time off", "Dental insurance",
  "Life insurance", "Disability insurance", "Flexible schedule", "Parental leave", "Employee discount",
  "Referral program", "Professional development assistance", "Retirement plan", "Relocation assistance",
  "Work from home", "Gym membership", "Company events", "Loyalty bonus", "Commuter assistance",
] as const;
const sponsorPlans = [
  { id: "premium-plus", title: "Premium Plus", price: "$140 daily average", detail: "Auto-invites up to 30 matches per day" },
  { id: "premium", title: "Premium", price: "$90 daily average", detail: "Appear higher in search results" },
  { id: "standard", title: "Standard", price: "$46 daily average", detail: "Visibility boost and automatic replies" },
] as const;
const candidateStages = ["New", "Shortlisted", "Interview", "Offer", "Hired"] as const;
const candidateDrawerTabs = ["Profile", "Application", "Messages", "Interviews", "Notes", "Activity"] as const;
const POST_DRAFT_STORAGE_KEY = "smaj_jobs_post_draft";
const candidateStageForStatus = (status: string): (typeof candidateStages)[number] => {
  const normalized = status.toLowerCase();
  if (normalized.includes("hired")) return "Hired";
  if (normalized.includes("offer")) return "Offer";
  if (normalized.includes("interview")) return "Interview";
  if (normalized.includes("shortlist") || normalized.includes("review")) return "Shortlisted";
  return "New";
};
const getCandidateApplicationUi = (status: string) => {
  const normalized = status.toLowerCase();
  if (normalized.includes("reject") || normalized.includes("not selected")) {
    return { badge: "Not selected by employer", tone: "rejected", action: "status" };
  }
  if (normalized.includes("view") || normalized.includes("review")) {
    return { badge: "Application viewed", tone: "viewed", action: "updates" };
  }
  if (normalized.includes("withdraw") || normalized.includes("archive")) {
    return { badge: "Archived", tone: "archived", action: "none" };
  }
  return { badge: "Applied", tone: "applied", action: "none" };
};
const applicationUpdateKey = (application: JobsApiApplication) => `${application.id}:${application.status}`;

const fallbackJobs: Job[] = [
  {
    id: "product-designer",
    title: "Senior Product Designer",
    company: "Pioneer Labs",
    location: "Remote",
    type: "Full time",
    mode: "Remote",
    salary: salaryFromUsdt(1800, 2400, "mo"),
    category: "Design",
    featured: true,
    summary: "Shape trusted marketplace experiences used by a growing global Pi community.",
    skills: ["Figma", "Design systems", "Research"],
  },
  {
    id: "react-engineer",
    title: "React Frontend Engineer",
    company: "Orbit Commerce",
    location: "Lagos, Nigeria",
    type: "Full time",
    mode: "Hybrid",
    salary: salaryFromUsdt(2200, 3000, "mo"),
    category: "Engineering",
    featured: true,
    summary: "Build fast, accessible commerce tools for merchants and customers.",
    skills: ["React", "TypeScript", "APIs"],
  },
  {
    id: "community-lead",
    title: "Community Growth Lead",
    company: "PiWorks Africa",
    location: "Accra, Ghana",
    type: "Contract",
    mode: "Remote",
    salary: salaryFromUsdt(900, 1200, "mo"),
    category: "Marketing",
    summary: "Grow a welcoming community through partnerships, events and content.",
    skills: ["Community", "Content", "Analytics"],
  },
  {
    id: "mobile-audit",
    title: "Mobile UX Audit",
    company: "Nova Health",
    location: "Remote",
    type: "Project",
    mode: "Remote",
    salary: salaryFromUsdt(350, 350, "project"),
    category: "Design",
    freelance: true,
    summary: "Review an existing health app and deliver an actionable UX report.",
    skills: ["UX audit", "Mobile", "Accessibility"],
  },
  {
    id: "api-integration",
    title: "Payment API Integration",
    company: "Sahara Market",
    location: "Remote",
    type: "Project",
    mode: "Remote",
    salary: salaryFromUsdt(600, 600, "project"),
    category: "Engineering",
    freelance: true,
    summary: "Connect a marketplace checkout to a documented payment API.",
    skills: ["Node.js", "REST", "Payments"],
  },
  {
    id: "support-specialist",
    title: "Customer Support Specialist",
    company: "SMAJ Services",
    location: "Dakar, Senegal",
    type: "Part time",
    mode: "Hybrid",
    salary: salaryFromUsdt(650, 850, "mo"),
    category: "Operations",
    summary: "Help customers and providers complete their service journeys.",
    skills: ["Support", "French", "English"],
  },
];

const fallbackCompanies: JobsApiCompany[] = [
  { id: "pioneer-labs", name: "Pioneer Labs", field: "Product & technology", openings: 6, mark: "PL" },
  { id: "orbit-commerce", name: "Orbit Commerce", field: "E-commerce", openings: 4, mark: "OC" },
  { id: "piworks-africa", name: "PiWorks Africa", field: "Community", openings: 3, mark: "PA" },
  { id: "smaj-services", name: "SMAJ Services", field: "Digital services", openings: 8, mark: "SS" },
];

const JobCard = ({ job, saved, onSave }: { job: Job; saved: boolean; onSave: () => void }) => (
  <article className="job-card">
    <div className="job-company-mark">
      {job.company
        .split(" ")
        .map(word => word[0])
        .join("")
        .slice(0, 2)}
    </div>
    <div className="job-card-main">
      <div className="job-card-top">
        <span>{job.company}</span>
        <small>{job.featured ? "Featured" : "Recently added"}</small>
      </div>
      <Link to={`/services/jobs/job/${job.id}`}>{job.title}</Link>
      <p>
        <LocationOnOutlinedIcon /> {job.location} · {job.mode} · {job.type}
      </p>
      {(job.postedAt || job.createdAt || job.expiresAt) ? (
        <p className="job-card-dates">
          {job.postedAt || job.createdAt ? <>Posted {formatJobDateTime(job.postedAt || job.createdAt)}</> : null}
          {job.expiresAt ? <><span>•</span> Expires {formatJobDate(job.expiresAt)}</> : null}
        </p>
      ) : null}
      <strong className="job-card-salary">{displayJobSalary(job)}</strong>
      <div>
        {job.skills.map(skill => (
          <span key={skill}>{skill}</span>
        ))}
      </div>
    </div>
    <button className={saved ? "saved" : ""} type="button" onClick={onSave} aria-label={`Save ${job.title}`}>
      <BookmarkBorderRoundedIcon />
    </button>
  </article>
);

const JobsPage = ({ kind = "home" }: { kind?: JobsPageKind }) => {
  const { user } = useAuthContext();
  const navigationType = useNavigationType();
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("");
  const [employerTitle, setEmployerTitle] = useState("");
  const [employerLocation, setEmployerLocation] = useState("");
  const [category, setCategory] = useState("All");
  const [jobs, setJobs] = useState<Job[]>(fallbackJobs);
  const [companies, setCompanies] = useState<JobsApiCompany[]>(fallbackCompanies);
  const [companyQuery, setCompanyQuery] = useState("");
  const [employerCompanyQuery, setEmployerCompanyQuery] = useState("");
  const [employerCompanyStatus, setEmployerCompanyStatus] = useState("all");
  const [companyRegistrationOpen, setCompanyRegistrationOpen] = useState(false);
  const [companySubmitting, setCompanySubmitting] = useState(false);
  const [verificationCompanyId, setVerificationCompanyId] = useState("");
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [applications, setApplications] = useState<JobsApiApplication[]>([]);
  const [readApplicationUpdates, setReadApplicationUpdates] = useState<Set<string>>(() => {
    try {
      return new Set<string>(JSON.parse(window.localStorage.getItem("smaj_jobs_read_application_updates") || "[]") as string[]);
    } catch {
      return new Set<string>();
    }
  });
  const [applyOpen, setApplyOpen] = useState(false);
  const [applicationSubmitting, setApplicationSubmitting] = useState(false);
  const [applyNote, setApplyNote] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [cvSaving, setCvSaving] = useState(false);
  const [cvMessage, setCvMessage] = useState("");
  const [profileEditor, setProfileEditor] = useState<"basic" | "headline" | "skills" | "employment" | "">("");
  const [avatarPromptDismissed, setAvatarPromptDismissed] = useState(false);
  const [avatarConfirmationState, setAvatarConfirmationState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [profile, setProfile] = useState<JobsProfile | null>(null);
  const [metrics, setMetrics] = useState<JobsMetrics>({ opportunities: 0, verifiedEmployers: 0, remotePercent: 0 });
  const [loading, setLoading] = useState(true);
  const [jobsReady, setJobsReady] = useState(() => navigationType !== "PUSH");
  const loadStartTime = useRef(Date.now());
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState("");
  const [employerApplications, setEmployerApplications] = useState<JobsApiApplication[]>([]);
  const [employerCompanies, setEmployerCompanies] = useState<JobsApiCompany[]>([]);
  const [employerJobs, setEmployerJobs] = useState<JobsApiJob[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [postCategory, setPostCategory] = useState("");
  const [payMin, setPayMin] = useState("");
  const [payMax, setPayMax] = useState("");
  const [postPayType, setPostPayType] = useState<"range" | "starting" | "maximum" | "exact">("range");
  const [postCompanyId, setPostCompanyId] = useState("");
  const [billingPlans, setBillingPlans] = useState<JobsBillingPlan[]>([]);
  const [billingPlanJobId, setBillingPlanJobId] = useState<Record<string, string>>({});
  const [billingSubmittingPlanId, setBillingSubmittingPlanId] = useState("");
  const [fetchedJob, setFetchedJob] = useState<Job | null>(null);
  const [fetchedCompany, setFetchedCompany] = useState<{ company: JobsApiCompany; jobs: Job[] } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [activity, setActivity] = useState<JobsActivity | null>(null);
  const [activityTab, setActivityTab] = useState<"appearances" | "actions">("appearances");
  const [activityDays, setActivityDays] = useState(7);
  const [earnings, setEarnings] = useState<JobsEarningItem[]>([]);
  const [earningsSummary, setEarningsSummary] = useState<JobsEarningsSummary | null>(null);
  const [earningsLoading, setEarningsLoading] = useState(false);
  const [employerPayments, setEmployerPayments] = useState<JobsEmployerPayment[]>([]);
  const [employerPaymentsSummary, setEmployerPaymentsSummary] = useState<JobsEmployerPaymentsSummary | null>(null);
  const [employerPaymentsLoading, setEmployerPaymentsLoading] = useState(false);
  const [profileVisibility, setProfileVisibility] = useState<"active" | "open" | "deactivated">("active");
  const [visibilityDetailsOpen, setVisibilityDetailsOpen] = useState(true);
  const [employerSearch, setEmployerSearch] = useState("");
  const [blockedEmployers, setBlockedEmployers] = useState<string[]>([]);
  const [postStep, setPostStep] = useState<
    | "contact"
    | "title"
    | "location"
    | "hires"
    | "timeframe"
    | "type"
    | "salary"
    | "benefits"
    | "skills"
    | "description"
    | "review"
    | "sponsor"
    | "details"
  >("contact");
  const [postJobTitle, setPostJobTitle] = useState("");
  const [postLanguage, setPostLanguage] = useState("English");
  const [postPostingRegion, setPostPostingRegion] = useState("United States");
  const [postLocationType, setPostLocationType] = useState<(typeof employerLocationTypes)[number]["id"]>("in-person");
  const [postCountry, setPostCountry] = useState("");
  const [postHires, setPostHires] = useState(0);
  const [postHiringTimeframe, setPostHiringTimeframe] = useState<(typeof hiringTimeframes)[number]>("1 to 3 days");
  const [postJobType, setPostJobType] = useState("Full time");
  const [postBenefits, setPostBenefits] = useState<string[]>([]);
  const [benefitsExpanded, setBenefitsExpanded] = useState(false);
  const [postDescription, setPostDescription] = useState("");
  const [postCustomCategory, setPostCustomCategory] = useState("");
  const [postSkills, setPostSkills] = useState("");
  const [postCompensationPeriod, setPostCompensationPeriod] = useState<
    "hour" | "day" | "week" | "month" | "year" | "project"
  >("hour");
  const [descriptionHelpOpen, setDescriptionHelpOpen] = useState(false);
  const descriptionTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const descriptionSelectionAnchor = useRef<number | null>(null);
  const [postSubmitting, setPostSubmitting] = useState(false);
  const [contactSubmitting, setContactSubmitting] = useState(false);
  const [postSponsorPlan, setPostSponsorPlan] = useState("none");
  const [employerHeroVideoPaused, setEmployerHeroVideoPaused] = useState(false);
  const [workspaceSwitchingTo, setWorkspaceSwitchingTo] = useState<"candidate" | "employer" | "">("");
  const [postAfterWorkspaceSwitch, setPostAfterWorkspaceSwitch] = useState(false);
  const [candidateQuery, setCandidateQuery] = useState("");
  const [candidateStageFilter, setCandidateStageFilter] = useState<"All" | (typeof candidateStages)[number]>("All");
  const [candidateView, setCandidateView] = useState<"pipeline" | "list">("list");
  const [candidateSearchResults, setCandidateSearchResults] = useState<JobsCandidateSearchResult[]>([]);
  const [candidateSearchLoading, setCandidateSearchLoading] = useState(false);
  const [candidateSearchError, setCandidateSearchError] = useState("");
  const [employerApplicationQuery, setEmployerApplicationQuery] = useState("");
  const [employerApplicationStage, setEmployerApplicationStage] = useState<"All" | (typeof candidateStages)[number]>("All");
  const [selectedCandidate, setSelectedCandidate] = useState<JobsApiApplication | null>(null);
  const [candidateDrawerTab, setCandidateDrawerTab] = useState<(typeof candidateDrawerTabs)[number]>("Profile");
  const [candidateNotesDraft, setCandidateNotesDraft] = useState("");
  const [candidateNotesSaving, setCandidateNotesSaving] = useState(false);
  const [interviewDateDraft, setInterviewDateDraft] = useState("");
  const [interviewNoteDraft, setInterviewNoteDraft] = useState("");
  const [interviewSubmitting, setInterviewSubmitting] = useState(false);
  const [managedJobApplication, setManagedJobApplication] = useState<JobsApiApplication | null>(null);
  const [withdrawJobApplication, setWithdrawJobApplication] = useState<JobsApiApplication | null>(null);
  const [messageFilter, setMessageFilter] = useState<"all" | "unread" | "invites">("all");
  const [messageFilterOpen, setMessageFilterOpen] = useState(false);
  const [jobConversations, setJobConversations] = useState<JobsConversation[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [activeJobsConversation, setActiveJobsConversation] = useState<JobsConversation | null>(null);
  const [jobsChatMessages, setJobsChatMessages] = useState<JobsChatMessage[]>([]);
  const [jobsChatDraft, setJobsChatDraft] = useState("");
  const [jobsChatSending, setJobsChatSending] = useState(false);
  const employerHeroVideoRef = useRef<HTMLVideoElement>(null);
  const previousStep = (step: typeof postStep) => {
    const order = ["contact", "title", "location", "hires", "timeframe", "type", "salary", "benefits", "skills", "description", "review", "sponsor", "details"] as const;
    const index = order.indexOf(step);
    if (index <= 0) return null;
    return order[index - 1];
  };
  const isStepValid = useMemo(() => {
    switch (postStep) {
      case "contact":
        return postCompanyId.length > 0;
      case "title":
        return postJobTitle.trim().length > 0;
      case "location":
        return postCountry.trim().length > 0;
      case "hires":
        return postHires > 0;
      case "timeframe":
        return postHiringTimeframe.trim().length > 0;
      case "type":
        return postJobType.trim().length > 0;
      case "salary":
        return Number(payMin) > 0;
      case "benefits":
        return postBenefits.length > 0;
      case "skills":
        return postSkills.trim().length > 0;
      case "description":
        return postDescription.trim().length >= 30;
      case "review":
      case "sponsor":
      case "details":
        return true;
      default:
        return true;
    }
  }, [postStep, postCompanyId, postJobTitle, postCountry, postHires, postHiringTimeframe, postJobType, payMin, postBenefits, postSkills, postDescription]);
  const [searchSheetOpen, setSearchSheetOpen] = useState(false);
  const [locationSheetOpen, setLocationSheetOpen] = useState(false);
  const [recentJobSearches, setRecentJobSearches] = useState<string[]>(() => {
    try {
      return JSON.parse(window.localStorage.getItem("smaj_jobs_recent_searches") || "[]");
    } catch {
      return [];
    }
  });
  const [workspaceMode, setWorkspaceMode] = useState<"candidate" | "employer">(
    kind === "employer" || kind === "post" ? "employer" : "candidate"
  );
  const [searchParams] = useSearchParams();
  const { id } = useParams();
  const navigate = useNavigate();
  const { isPaying: billingPaying, payBilling } = useJobsBillingPayment();
  const homeTab = kind === "home" ? searchParams.get("tab") || "" : "";
  const filteredEmployerJobTitles = useMemo(() => {
    const typed = postJobTitle.trim().toLowerCase();
    return [...new Set([...employerJobTitleSuggestions, ...jobs.map(job => job.title)])]
      .filter(title => (typed ? title.toLowerCase().includes(typed) && title.toLowerCase() !== typed : true))
      .slice(0, 5);
  }, [jobs, postJobTitle]);
  const selectedPostLocationType =
    employerLocationTypes.find(item => item.id === postLocationType) || employerLocationTypes[0];
  const filteredCandidates = useMemo(() => {
    const term = candidateQuery.trim().toLowerCase();
    return employerApplications.filter(application => {
      const profileText = [
        application.jobTitle,
        application.company,
        application.coverNote,
        application.status,
        application.profileSnapshot?.title,
        application.profileSnapshot?.location,
        Array.isArray(application.profileSnapshot?.skills)
          ? application.profileSnapshot.skills.join(" ")
          : application.profileSnapshot?.skills,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const stage = candidateStageForStatus(application.status);
      return (!term || profileText.includes(term)) && (candidateStageFilter === "All" || stage === candidateStageFilter);
    });
  }, [candidateQuery, candidateStageFilter, employerApplications]);
  const filteredEmployerApplications = useMemo(() => {
    const query = employerApplicationQuery.trim().toLowerCase();
    return employerApplications.filter(application => {
      const stage = candidateStageForStatus(application.status);
      const matchesStage = employerApplicationStage === "All" || stage === employerApplicationStage;
      const haystack = [
        application.jobTitle,
        application.company,
        application.status,
        application.profileSnapshot?.title,
        application.profileSnapshot?.location,
        Array.isArray(application.profileSnapshot?.skills)
          ? application.profileSnapshot.skills.join(" ")
          : application.profileSnapshot?.skills,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return matchesStage && (!query || haystack.includes(query));
    });
  }, [employerApplicationQuery, employerApplicationStage, employerApplications]);
  const filteredCompanies = useMemo(() => {
    const term = companyQuery.trim().toLowerCase();
    if (!term) return companies;
    return companies.filter(company =>
      [company.name, company.field].some(value => value.toLowerCase().includes(term)),
    );
  }, [companies, companyQuery]);  const filteredEmployerCompanies = useMemo(() => {
    const term = employerCompanyQuery.trim().toLowerCase();
    return employerCompanies.filter(company => {
      const status = company.moderationStatus === "pending"
        ? "review"
        : company.moderationStatus === "rejected"
          ? "rejected"
          : company.verificationStatus || "claimed";
      const matchesSearch = !term || [company.name, company.field, company.mark].some(value =>
        String(value || "").toLowerCase().includes(term),
      );
      return matchesSearch && (employerCompanyStatus === "all" || status === employerCompanyStatus);
    });
  }, [employerCompanies, employerCompanyQuery, employerCompanyStatus]);
  useEffect(() => {
    if (kind === "activity" && searchParams.get("tab") === "actions") setActivityTab("actions");
  }, [kind, searchParams]);
  useEffect(() => {
    if (!workspaceSwitchingTo) return;
    const timer = window.setTimeout(() => {
      setWorkspaceMode(workspaceSwitchingTo);
      setWorkspaceSwitchingTo("");
      navigate(postAfterWorkspaceSwitch && workspaceSwitchingTo === "employer" ? "/services/jobs/post" : "/services/jobs");
      setPostAfterWorkspaceSwitch(false);
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [navigate, postAfterWorkspaceSwitch, workspaceSwitchingTo]);
  const openEmployerPostFlow = () => {
    if (activeWorkspaceMode === "employer") {
      navigate("/services/jobs/post");
      return;
    }
    setPostAfterWorkspaceSwitch(true);
    setWorkspaceSwitchingTo("employer");
  };
  const renderCandidateAvatar = (application: JobsApiApplication) => {
    const snapshot = application.profileSnapshot;
    const avatar = snapshot?.avatar || snapshot?.avatarConfirmationValue || "";
    const label = snapshot?.title || application.jobTitle || "Candidate";
    return (
      <span className="jobs-candidate-avatar">
        {avatar ? <img src={avatar} alt="" /> : label.slice(0, 1).toUpperCase()}
      </span>
    );
  };
  const activeWorkspaceMode =
    kind === "employer" || kind === "post" || kind === "candidates" || kind === "payments-billing"
      ? "employer"
      : ["search", "freelance", "saved", "applications", "profile", "activity", "settings", "visibility", "account-settings", "blocked-employers", "my-earnings"].includes(kind)
        ? "candidate"
      : workspaceMode;
  const isCandidateSearchMode =
    kind === "candidates" && (searchParams.get("q") || searchParams.get("location"));
  const visibleJobConversations = jobConversations.filter(conversation => {
    if (messageFilter === "unread") return Boolean(user?.uid && conversation.unreadBy?.includes(user.uid));
    if (messageFilter === "invites") return conversation.contextType === "jobs";
    return true;
  });
  const unreadJobMessages = jobConversations.filter(conversation =>
    Boolean(user?.uid && conversation.unreadBy?.includes(user.uid)),
  ).length;
  const waitingForEmployerMessage = Boolean(
    activeJobsConversation && !jobsChatMessages.length && activeJobsConversation.sellerId !== user?.uid,
  );
  const currentAvatar = user?.avatar || "";
  const showAvatarConfirmation =
    kind === "profile" && Boolean(user) && !avatarPromptDismissed && profile?.avatarConfirmationValue !== currentAvatar;
  const updateAvatarConfirmation = async (status: "confirmed" | "deferred") => {
    if (avatarConfirmationState === "saving") return;
    setAvatarConfirmationState("saving");
    try {
      await confirmJobsProfileAvatar(currentAvatar, status);
      setProfile(current =>
        current ? { ...current, avatarConfirmationStatus: status, avatarConfirmationValue: currentAvatar } : current
      );
      setAvatarConfirmationState("saved");
      window.setTimeout(() => setAvatarPromptDismissed(true), 700);
    } catch {
      setAvatarConfirmationState("error");
    }
  };
  const deferAvatarConfirmation = () => {
    setAvatarPromptDismissed(true);
    setAvatarConfirmationState("idle");
    void confirmJobsProfileAvatar(currentAvatar, "deferred").catch(() => undefined);
  };
  const profileChecks = [
    Boolean(currentAvatar),
    Boolean(profile?.title),
    Boolean(Array.isArray(profile?.skills) ? profile.skills.length : profile?.skills),
    Boolean(profile?.location),
    Boolean(profile?.summary),
    Boolean(profile?.cv),
  ];
  const profileCompletion = Math.round((profileChecks.filter(Boolean).length / profileChecks.length) * 100);
  const missingProfileItems = profileChecks.filter(item => !item).length;
  const uploadCv = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.type !== "application/pdf" || file.size > 5_000_000) {
      setCvMessage("Choose a PDF CV that is 5 MB or smaller.");
      return;
    }
    setCvSaving(true);
    setCvMessage("");
    try {
      const document = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("read_failed"));
        reader.readAsDataURL(file);
      });
      const upload = await uploadJobsCv(document, file.name);
      const cv = await saveJobsCv({ url: upload.url, name: file.name, size: file.size, visibility: "applications" });
      setProfile(current => (current ? { ...current, cv } : current));
      setCvMessage("CV updated successfully.");
    } catch {
      setCvMessage("CV could not be uploaded. Try again.");
    } finally {
      setCvSaving(false);
    }
  };
  const removeCv = async () => {
    await deleteJobsCv();
    setProfile(current => (current ? { ...current, cv: undefined } : current));
    setCvMessage("CV removed.");
  };
  const changeCvVisibility = async (visibility: "applications" | "verified_employers" | "private") => {
    if (!profile?.cv) return;
    const cv = await saveJobsCv({ ...profile.cv, visibility });
    setProfile(current => (current ? { ...current, cv } : current));
    setCvMessage("CV visibility updated.");
  };
  const saveProfileEditor = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    let values: Record<string, unknown> = {};
    if (profileEditor === "headline") values = { title: data.get("title") };
    else if (profileEditor === "skills")
      values = {
        skills: String(data.get("skills") || "")
          .split(",")
          .map(item => item.trim())
          .filter(Boolean),
      };
    else if (profileEditor === "basic")
      values = {
        location: data.get("location"),
        availability: data.get("availability"),
        portfolio: data.get("portfolio"),
        summary: data.get("summary"),
      };
    else
      values = {
        employment: [
          {
            id: String(data.get("id") || Date.now()),
            position: data.get("position"),
            employer: data.get("employer"),
            current: data.get("current") === "on",
            location: data.get("employerLocation"),
            country: data.get("country"),
            startMonth: data.get("startMonth"),
            startYear: data.get("startYear"),
            endMonth: data.get("endMonth"),
            endYear: data.get("endYear"),
            description: data.get("description"),
          },
        ],
      };
    const result = await saveJobsProfileSection(profileEditor, values);
    setProfile(current => (current ? { ...current, ...result.values } : current));
    setProfileEditor("");
  };
  const jobSearchSuggestions = useMemo(() => {
    const available = [
      ...recentJobSearches,
      ...jobs.map(job => job.title),
      ...jobs.flatMap(job => job.skills),
      ...jobs.map(job => job.category),
    ];
    const term = query.trim().toLowerCase();
    return [...new Set(available)].filter(item => !term || item.toLowerCase().includes(term)).slice(0, 10);
  }, [jobs, query, recentJobSearches]);
  const locationSuggestions = useMemo(() => {
    const accountLocation = user?.country?.trim();
    const available = ["Remote", ...jobs.map(job => job.location), ...JOB_COUNTRIES.map(country => country.label)];
    const term = location.trim().toLowerCase();
    return {
      accountLocation,
      results: [...new Set(available)].filter(item => !term || item.toLowerCase().includes(term)).slice(0, 14),
    };
  }, [jobs, location, user?.country]);
  const runJobSearch = (term = query) => {
    const cleanTerm = term.trim();
    const params = new URLSearchParams({
      ...(cleanTerm ? { q: cleanTerm } : {}),
      ...(location ? { location: normalizeJobLocation(location) } : {}),
    });
    if (cleanTerm) {
      const nextRecent = [cleanTerm, ...recentJobSearches.filter(item => item !== cleanTerm)].slice(0, 6);
      setRecentJobSearches(nextRecent);
      window.localStorage.setItem("smaj_jobs_recent_searches", JSON.stringify(nextRecent));
    }
    setSearchSheetOpen(false);
    setLocationSheetOpen(false);
    navigate(`/services/jobs/search${params.size ? `?${params.toString()}` : ""}`);
  };
  const selectLocation = (nextLocation: string) => {
    setLocation(nextLocation);
    setLocationSheetOpen(false);
  };
  const openJobsConversation = async (conversation: JobsConversation) => {
    setActiveJobsConversation(conversation);
    setJobsChatMessages([]);
    try {
      const { data } = await axiosClient.get<{ conversation?: JobsConversation; messages?: JobsChatMessage[] }>(
        `/messages/${encodeURIComponent(conversation._id)}`,
      );
      if (data.conversation) setActiveJobsConversation(data.conversation);
      setJobsChatMessages(data.messages || []);
      setJobConversations(current =>
        current.map(item => item._id === conversation._id ? { ...item, unreadBy: [] } : item),
      );
    } catch {
      setActionMessage("This Jobs conversation could not be opened.");
    }
  };
  const startEmployerConversation = async (application: JobsApiApplication) => {
    try {
      const { data } = await axiosClient.post<{ conversation: JobsConversation }>(
        `/jobs/employer/applications/${encodeURIComponent(application.id)}/conversation`,
      );
      setSelectedCandidate(null);
      setWorkspaceMode("employer");
      navigate(`/services/jobs?tab=messages&conversation=${encodeURIComponent(data.conversation._id)}`);
    } catch {
      setActionMessage("The Jobs conversation could not be started.");
    }
  };
  const sendJobsChatMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const message = jobsChatDraft.trim();
    if (!activeJobsConversation || !message || jobsChatSending) return;
    setJobsChatSending(true);
    try {
      const { data } = await axiosClient.post<{ message: JobsChatMessage }>(
        `/messages/${encodeURIComponent(activeJobsConversation._id)}`,
        { message },
      );
      setJobsChatDraft("");
      setJobsChatMessages(current => [...current, data.message]);
      setJobConversations(current =>
        current.map(item => item._id === activeJobsConversation._id ? { ...item, lastMessage: data.message.message } : item),
      );
    } catch {
      setActionMessage("Message could not be sent.");
    } finally {
      setJobsChatSending(false);
    }
  };
  useEffect(() => {
    if (kind === "post" || !user) return;
    let active = true;
    if (kind === "home" && homeTab === "messages") setMessagesLoading(true);
    const load = () => axiosClient
      .get<{ conversations?: JobsConversation[] }>("/messages", { params: { context: "jobs" } })
      .then(({ data }) => {
        if (active) setJobConversations(data.conversations || []);
      })
      .catch(() => {
        if (active) setJobConversations([]);
      })
      .finally(() => {
        if (active) setMessagesLoading(false);
      });
    void load();
    const timer = window.setInterval(() => void load(), 5000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [homeTab, kind, user]);

  useEffect(() => {
    const conversationId = searchParams.get("conversation");
    if (homeTab !== "messages" || !conversationId || !jobConversations.length) return;
    const conversation = jobConversations.find(item => item._id === conversationId);
    if (conversation && activeJobsConversation?._id !== conversationId) void openJobsConversation(conversation);
  }, [activeJobsConversation?._id, homeTab, jobConversations, searchParams]);

  const activeJobsConversationId = activeJobsConversation?._id || "";
  useEffect(() => {
    if (!activeJobsConversationId) return;
    let active = true;
    const timer = window.setInterval(() => {
      axiosClient
        .get<{ conversation?: JobsConversation; messages?: JobsChatMessage[] }>(
          `/messages/${encodeURIComponent(activeJobsConversationId)}`,
        )
        .then(({ data }) => {
          if (!active) return;
          if (data.conversation) setActiveJobsConversation(data.conversation);
          setJobsChatMessages(data.messages || []);
        })
        .catch(() => undefined);
    }, 3000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [activeJobsConversationId]);

  useEffect(() => {
    if (!searchSheetOpen && !locationSheetOpen) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSearchSheetOpen(false);
        setLocationSheetOpen(false);
      }
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [searchSheetOpen, locationSheetOpen]);
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      getJobs({
        search: searchParams.get("q") || undefined,
        location: searchParams.get("location") || undefined,
        category,
        freelance: kind === "freelance",
        page,
      }),
      getJobCompanies(),
      getJobsMetrics(),
      getSavedJobs().catch(() => []),
      getJobApplications().catch(() => []),
      getJobsProfile().catch(() => null),
      getEmployerDashboard().catch(() => null),
    ])
      .then(([jobsResponse, nextCompanies, nextMetrics, savedJobs, nextApplications, nextProfile, dashboard]) => {
        if (controller.signal.aborted) return;
        if (jobsResponse.jobs.length) setJobs(jobsResponse.jobs);
        else setJobs([]);
        setPages(Math.max(1, jobsResponse.pagination.pages));
        if (nextCompanies.length) setCompanies(nextCompanies);
        setMetrics(nextMetrics);
        setSaved(new Set(savedJobs.map(job => job.id)));
        setApplications(nextApplications);
        setProfile(nextProfile);
        setBlockedEmployers(nextProfile?.blockedEmployerIds || []);
        if (kind === "home" && nextProfile?.jobsMode === "employer") setWorkspaceMode("employer");
        if (dashboard) {
          setEmployerApplications(dashboard.applications);
          setEmployerCompanies(dashboard.companies);
          setEmployerJobs(dashboard.jobs || []);
        }
        setLoading(false);
      })
      .catch(() => {
        setOffline(true);
        setLoading(false);
        setError(
          "Live Jobs data is temporarily unavailable. Showing a limited offline catalog; account actions may not work."
        );
      });
    return () => controller.abort();
  }, [searchParams, category, kind, page]);

  useEffect(() => {
    if (!loading) {
      const elapsed = Date.now() - loadStartTime.current;
      const remaining = Math.max(0, 800 - elapsed);
      const timer = window.setTimeout(() => setJobsReady(true), remaining);
      return () => window.clearTimeout(timer);
    }
  }, [loading]);
  useEffect(() => {
    void getJobsBillingPlans()
      .then(setBillingPlans)
      .catch(() => setBillingPlans([]));
  }, []);
  useEffect(() => {
    if (kind === "activity")
      void getJobsActivity(activityDays)
        .then(setActivity)
        .catch(() => setActivity(null));
  }, [kind, activityDays]);
  useEffect(() => {
    if (kind === "my-earnings" && user) {
      let active = true;
      setEarningsLoading(true);
      getJobsEarnings()
        .then(data => {
          if (!active) return;
          setEarnings(data.items);
          setEarningsSummary(data.summary);
        })
        .catch(() => {
          if (!active) return;
          setEarnings([]);
          setEarningsSummary(null);
        })
        .finally(() => {
          if (active) setEarningsLoading(false);
        });
      return () => { active = false; };
    }
  }, [kind, user]);
  useEffect(() => {
    if (kind === "payments-billing" && user) {
      let active = true;
      setEmployerPaymentsLoading(true);
      getJobsEmployerPayments()
        .then(data => {
          if (!active) return;
          setEmployerPayments(data.payments);
          setEmployerPaymentsSummary(data.summary);
        })
        .catch(() => {
          if (!active) return;
          setEmployerPayments([]);
          setEmployerPaymentsSummary(null);
        })
        .finally(() => {
          if (active) setEmployerPaymentsLoading(false);
        });
      return () => { active = false; };
    }
  }, [kind, user]);
  useEffect(() => {
    if (!isCandidateSearchMode) return;
    let active = true;
    setCandidateSearchLoading(true);
    setCandidateSearchError("");
    searchCandidates({ q: searchParams.get("q") || "", location: searchParams.get("location") || "", pageSize: 50 })
      .then(data => {
        if (active) setCandidateSearchResults(data.candidates);
      })
      .catch(() => {
        if (active) setCandidateSearchError("Could not load candidates.");
      })
      .finally(() => {
        if (active) setCandidateSearchLoading(false);
      });
    return () => { active = false; };
  }, [isCandidateSearchMode, searchParams]);
  const effectiveQuery = query || searchParams.get("q") || "";
  const effectiveLocation = searchParams.get("location") || "";
  const visibleJobs = useMemo(
    () =>
      jobs.filter(job => {
        const text = `${job.title} ${job.company} ${job.location} ${job.skills.join(" ")}`.toLowerCase();
        const locationMatch =
          !effectiveLocation || job.location.toLowerCase().includes(effectiveLocation.toLowerCase());
        return (
          text.includes(effectiveQuery.toLowerCase()) &&
          locationMatch &&
          (category === "All" || job.category === category)
        );
      }),
    [jobs, effectiveQuery, effectiveLocation, category]
  );
  const toggleSaved = (jobId: string) =>
    setSaved(current => {
      const next = new Set(current);
      if (next.has(jobId)) next.delete(jobId);
      else next.add(jobId);
      return next;
    });
  const saveJob = (jobId: string) => {
    toggleSaved(jobId);
    void toggleSavedJob(jobId).catch(() => toggleSaved(jobId));
  };

  const listings =
    kind === "freelance"
      ? visibleJobs.filter(job => job.freelance)
      : visibleJobs;
  const savedJobs = visibleJobs.filter(job => saved.has(job.id));
  const activeApplications = applications.filter(application => !application.candidateArchivedAt);
  const archivedApplications = applications.filter(application => Boolean(application.candidateArchivedAt));
  const markApplicationUpdateRead = (application: JobsApiApplication) => {
    const updateKey = applicationUpdateKey(application);
    setReadApplicationUpdates(current => {
      if (current.has(updateKey)) return current;
      const next = new Set(current).add(updateKey);
      window.localStorage.setItem("smaj_jobs_read_application_updates", JSON.stringify([...next]));
      return next;
    });
  };
  const archiveCandidateApplication = async (application: JobsApiApplication) => {
    try {
      const candidateArchivedAt = await archiveJobApplication(application.id);
      setApplications(current =>
        current.map(item => (item.id === application.id ? { ...item, candidateArchivedAt } : item)),
      );
      setManagedJobApplication(null);
      navigate("/services/jobs/saved?tab=archived");
    } catch {
      setManagedJobApplication(null);
      setActionMessage("Application could not be archived.");
    }
  };
  const myJobsTab =
    kind === "applications"
      ? "applied"
      : kind === "saved" && searchParams.get("tab") === "interviews"
        ? "interviews"
        : kind === "saved" && searchParams.get("tab") === "archived"
          ? "archived"
          : "saved";
  const recommendedJobs = useMemo(() => {
    const titles = profile?.preferredTitles || [];
    const locations = profile?.preferredLocations || [];
    const categories = profile?.preferredCategories || [];
    if (!titles.length && !locations.length && !categories.length) return [];
    return jobs
      .filter(job => {
        const titleMatch =
          !titles.length ||
          titles.some(title => `${job.title} ${job.skills.join(" ")}`.toLowerCase().includes(title.toLowerCase()));
        const locationMatch =
          profile?.openToAnywhere ||
          !locations.length ||
          locations.some(item => job.location.toLowerCase().includes(item.toLowerCase())) ||
          (profile?.remotePreference !== "onsite" && job.mode === "Remote");
        const categoryMatch = !categories.length || categories.includes(job.category);
        return titleMatch && locationMatch && categoryMatch;
      })
      .slice(0, 3);
  }, [jobs, profile]);
  const jobAlertsCount = Math.min(9, recommendedJobs.length || metrics.opportunities);
  const jobAlertsLabel = jobAlertsCount >= 9 ? "9+" : String(jobAlertsCount);
  const selectedJob = jobs.find(job => job.id === id) || fetchedJob || undefined;
  const selectedCompany = companies.find(company => company.id === id) || employerCompanies.find(company => company.id === id) || fetchedCompany?.company || undefined;
  const selectedCompanyJobs =
    fetchedCompany?.jobs || jobs.filter(job => selectedCompany && job.company === selectedCompany.name);
  useEffect(() => {
    if (kind !== "job" || !id) {
      setFetchedJob(null);
      return;
    }
    if (jobs.some(job => job.id === id)) {
      setFetchedJob(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    getJobById(id)
      .then(job => {
        if (!cancelled) setFetchedJob(job);
      })
      .catch(() => {
        if (!cancelled) setFetchedJob(null);
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, id]);
  useEffect(() => {
    if (kind !== "company" || !id) {
      setFetchedCompany(null);
      return;
    }
    if (companies.some(company => company.id === id)) {
      setFetchedCompany(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    getCompanyById(id)
      .then(result => {
        if (!cancelled) setFetchedCompany(result);
      })
      .catch(() => {
        if (!cancelled) setFetchedCompany(null);
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, id]);
  useEffect(() => {
    setCandidateNotesDraft(selectedCandidate?.notes || "");
    setInterviewDateDraft("");
    setInterviewNoteDraft("");
  }, [selectedCandidate?.id]);
  const saveCandidateNotes = async () => {
    if (!selectedCandidate || candidateNotesSaving) return;
    setCandidateNotesSaving(true);
    try {
      const notes = await saveApplicationNotes(selectedCandidate.id, candidateNotesDraft);
      setSelectedCandidate(current => (current ? { ...current, notes } : current));
      setEmployerApplications(current => current.map(item => (item.id === selectedCandidate.id ? { ...item, notes } : item)));
    } catch {
      setActionMessage("Notes could not be saved.");
    } finally {
      setCandidateNotesSaving(false);
    }
  };
  const scheduleCandidateInterview = async () => {
    if (!selectedCandidate || interviewSubmitting || !interviewDateDraft) return;
    setInterviewSubmitting(true);
    try {
      const scheduledAt = new Date(interviewDateDraft).toISOString();
      const interview = await scheduleApplicationInterview(selectedCandidate.id, scheduledAt, interviewNoteDraft);
      const withInterview = (item: JobsApiApplication) => ({ ...item, interviews: [...(item.interviews || []), interview] });
      setSelectedCandidate(current => (current ? withInterview(current) : current));
      setEmployerApplications(current => current.map(item => (item.id === selectedCandidate.id ? withInterview(item) : item)));
      setInterviewDateDraft("");
      setInterviewNoteDraft("");
      setActionMessage("Interview scheduled.");
    } catch {
      setActionMessage("Interview could not be scheduled.");
    } finally {
      setInterviewSubmitting(false);
    }
  };
  const cancelCandidateInterview = async (interviewId: string) => {
    if (!selectedCandidate) return;
    try {
      await cancelApplicationInterview(selectedCandidate.id, interviewId);
      const withoutInterview = (item: JobsApiApplication) => ({
        ...item,
        interviews: (item.interviews || []).filter(interview => interview.id !== interviewId),
      });
      setSelectedCandidate(current => (current ? withoutInterview(current) : current));
      setEmployerApplications(current => current.map(item => (item.id === selectedCandidate.id ? withoutInterview(item) : item)));
    } catch {
      setActionMessage("Interview could not be cancelled.");
    }
  };
  const postDraftRestoredRef = useRef(false);
  useEffect(() => {
    if (kind !== "post" || postDraftRestoredRef.current) return;
    postDraftRestoredRef.current = true;
    try {
      const saved = JSON.parse(window.localStorage.getItem(POST_DRAFT_STORAGE_KEY) || "null");
      if (!saved) return;
      if (saved.postStep) setPostStep(saved.postStep);
      if (saved.postJobTitle) setPostJobTitle(saved.postJobTitle);
      if (saved.postLanguage) setPostLanguage(saved.postLanguage);
      if (saved.postPostingRegion) setPostPostingRegion(saved.postPostingRegion);
      if (saved.postLocationType) setPostLocationType(saved.postLocationType);
      if (saved.postCountry) setPostCountry(saved.postCountry);
      if (typeof saved.postHires === "number") setPostHires(saved.postHires);
      if (saved.postHiringTimeframe) setPostHiringTimeframe(saved.postHiringTimeframe);
      if (saved.postJobType) setPostJobType(saved.postJobType);
      if (Array.isArray(saved.postBenefits)) setPostBenefits(saved.postBenefits);
      if (saved.postDescription) setPostDescription(saved.postDescription);
      if (saved.postCategory) setPostCategory(saved.postCategory);
      if (saved.postCustomCategory) setPostCustomCategory(saved.postCustomCategory);
      if (saved.postSkills) setPostSkills(saved.postSkills);
      if (saved.postCompensationPeriod) setPostCompensationPeriod(saved.postCompensationPeriod);
      if (saved.payMin) setPayMin(saved.payMin);
      if (saved.payMax) setPayMax(saved.payMax);
      if (saved.postPayType) setPostPayType(saved.postPayType);
      if (saved.postCompanyId) setPostCompanyId(saved.postCompanyId);
      if (saved.postSponsorPlan) setPostSponsorPlan(saved.postSponsorPlan);
    } catch {
      // Ignore malformed drafts.
    }
  }, [kind]);
  useEffect(() => {
    if (kind !== "post") return;
    const draft = {
      postStep,
      postJobTitle,
      postLanguage,
      postPostingRegion,
      postLocationType,
      postCountry,
      postHires,
      postHiringTimeframe,
      postJobType,
      postBenefits,
      postDescription,
      postCategory,
      postCustomCategory,
      postSkills,
      postCompensationPeriod,
      payMin,
      payMax,
      postPayType,
      postCompanyId,
      postSponsorPlan,
    };
    try {
      window.localStorage.setItem(POST_DRAFT_STORAGE_KEY, JSON.stringify(draft));
    } catch {
      // Ignore storage failures (e.g. private browsing quota).
    }
  }, [
    kind,
    postStep,
    postJobTitle,
    postLanguage,
    postPostingRegion,
    postLocationType,
    postCountry,
    postHires,
    postHiringTimeframe,
    postJobType,
    postBenefits,
    postDescription,
    postCategory,
    postCustomCategory,
    postSkills,
    postCompensationPeriod,
    payMin,
    payMax,
    postPayType,
    postCompanyId,
    postSponsorPlan,
  ]);
  useEffect(() => {
    if (kind !== "post") return;
    if (!postCompanyId && employerCompanies.length) {
      setPostCompanyId(employerCompanies[0].id);
    }
  }, [kind, employerCompanies, postCompanyId]);
  const wrapDescriptionSelection = (marker: string) => {
    const textarea = descriptionTextareaRef.current;
    if (!textarea) return;
    const { selectionStart, selectionEnd, value } = textarea;
    const selected = value.slice(selectionStart, selectionEnd) || "text";
    const next = `${value.slice(0, selectionStart)}${marker}${selected}${marker}${value.slice(selectionEnd)}`;
    descriptionSelectionAnchor.current = selectionStart + marker.length;
    setPostDescription(next);
  };
  const insertDescriptionListItem = () => {
    const textarea = descriptionTextareaRef.current;
    if (!textarea) return;
    const { selectionStart, value } = textarea;
    const lineStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
    const next = `${value.slice(0, lineStart)}- ${value.slice(lineStart)}`;
    descriptionSelectionAnchor.current = selectionStart + 2;
    setPostDescription(next);
  };
  useEffect(() => {
    if (descriptionSelectionAnchor.current != null && descriptionTextareaRef.current) {
      const textarea = descriptionTextareaRef.current;
      const anchor = descriptionSelectionAnchor.current;
      textarea.focus();
      const end = Math.min(anchor, textarea.value.length);
      textarea.setSelectionRange(end, end);
      descriptionSelectionAnchor.current = null;
    }
  }, [postDescription]);
  const submitContactStep = async (form: HTMLFormElement) => {
    if (contactSubmitting) return;
    setContactSubmitting(true);
    try {
      if (employerCompanies.length) {
        setPostCompanyId(employerCompanies[0].id);
      } else {
        const data = new FormData(form);
        const name = String(data.get("companyName") || "").trim();
        await enrollEmployer();
        const company = await createJobCompany({ name, field: "Other" });
        setEmployerCompanies(current => [...current, company]);
        setCompanies(current => [...current, company]);
        setPostCompanyId(company.id);
      }
      setPostStep("title");
    } catch {
      setActionMessage("We could not save your company details. Please try again.");
    } finally {
      setContactSubmitting(false);
    }
  };
  const submitJob = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (postSubmitting) return;
    const data = new FormData(event.currentTarget);
    setPostSubmitting(true);
    try {
      let companyId = String(data.get("companyId") || postCompanyId);
      if (companyId === "__add__") {
        await enrollEmployer();
        const company = await createJobCompany({
          name: String(data.get("newCompanyName") || ""),
          field: String(data.get("newCompanyField") || ""),
        });
        setEmployerCompanies(current => [...current, company]);
        setCompanies(current => [...current, company]);
        setPostCompanyId(company.id);
        companyId = company.id;
      }
      const created = await createJob({
        title: String(data.get("title") || postJobTitle),
        companyId,
        location: String(data.get("country") || selectedPostLocationType.title),
        type: String(data.get("type") || postJobType),
        mode: String(data.get("mode") || selectedPostLocationType.mode || "Remote"),
        category: String(
          data.get("category") === "Other" ? data.get("customCategory") : data.get("category") || postCategory || "Other"
        ),
        skills: String(data.get("skills") || "")
          .split(",")
          .map(skill => skill.trim())
          .filter(Boolean),
        salary: `${formatPiAmount(piFromUsdt(Number(data.get("compensationMin") || payMin)))}${Number(data.get("compensationMax") || payMax) > Number(data.get("compensationMin") || payMin) ? `–${formatPiAmount(piFromUsdt(Number(data.get("compensationMax") || payMax)))}` : ""} / ${String(data.get("compensationPeriod") || postCompensationPeriod)}`,
        compensationMinUsdt: Number(data.get("compensationMin") || payMin),
        compensationMaxUsdt: Number(data.get("compensationMax") || payMax) || Number(data.get("compensationMin") || payMin),
        compensationPeriod: String(data.get("compensationPeriod") || postCompensationPeriod),
        summary: String(data.get("summary") || postDescription),
      });
      setJobs(current => [created, ...current]);
      setActionMessage(`Job posted at ${formatJobDateTime(created.postedAt || created.createdAt)} and is pending review.`);
      setPostStep("title");
      setPostJobTitle("");
      setPostCountry("");
      setPostHires(0);
      setPostHiringTimeframe("1 to 3 days");
      setPostJobType("Full time");
      setPostBenefits([]);
      setPostDescription("");
      setPostCategory("");
      setPostCustomCategory("");
      setPostSkills("");
      setPostCompensationPeriod("hour");
      setPayMin("");
      setPayMax("");
      setPostSponsorPlan("none");
      try {
        window.localStorage.removeItem(POST_DRAFT_STORAGE_KEY);
      } catch {
        // Ignore storage failures.
      }
      navigate(`/services/jobs/employer`);
    } catch {
      setActionMessage("The job could not be submitted. Confirm your employer account and company ownership.");
    } finally {
      setPostSubmitting(false);
    }
  };
  const submitApplication = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedJob || applicationSubmitting) return;
    const startedAt = Date.now();
    setApplicationSubmitting(true);
    try {
      const application = await applyToJob(selectedJob.id, applyNote);
      const remaining = 3000 - (Date.now() - startedAt);
      if (remaining > 0) await new Promise(resolve => window.setTimeout(resolve, remaining));
      setApplications(current => [application, ...current]);
      setApplyOpen(false);
      setApplyNote("");
      setActionMessage("Application submitted successfully.");
    } catch {
      const remaining = 3000 - (Date.now() - startedAt);
      if (remaining > 0) await new Promise(resolve => window.setTimeout(resolve, remaining));
      setActionMessage("This application could not be submitted. Check whether you already applied and try again.");
    } finally {
      setApplicationSubmitting(false);
    }
  };
  const createCompany = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (companySubmitting) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    setCompanySubmitting(true);
    try {
      await enrollEmployer();
      const company = await createJobCompany({
        name: String(data.get("name") || "").trim(),
        field: String(data.get("field") || "").trim(),
      });
      setEmployerCompanies(current => [company, ...current]);
      setCompanies(current => [company, ...current.filter(item => item.id !== company.id)]);
      setActionMessage(`${company.name} was submitted for admin listing review.`);
      setCompanyRegistrationOpen(false);
      form.reset();
    } catch (error) {
      const message = (error as { response?: { data?: { message?: string } } }).response?.data?.message;
      setActionMessage(message || "Company could not be submitted. Please check the details and try again.");
    } finally {
      setCompanySubmitting(false);
    }
  };
  const changeApplicationStatus = async (applicationId: string, status: string) => {
    try {
      await updateEmployerApplication(applicationId, status);
      setEmployerApplications(current => current.map(item => (item.id === applicationId ? { ...item, status } : item)));
      setSelectedCandidate(current => (current && current.id === applicationId ? { ...current, status } : current));
    } catch {
      setActionMessage("Application status could not be updated.");
    }
  };
  const sendCandidateOffer = async (application: JobsApiApplication) => {
    const amountValue = window.prompt("Offer amount in Pi");
    if (!amountValue) return;
    const amountPi = Number(amountValue);
    if (!Number.isFinite(amountPi) || amountPi <= 0) {
      setActionMessage("Enter a valid offer amount in Pi.");
      return;
    }
    const terms = window.prompt("Offer terms (role, schedule, deliverables)", "") || "";
    try {
      const result = await sendJobOffer(application.id, {
        amountPi,
        period: "month",
        terms,
      });
      const updated = { ...application, status: result.status, offer: result.offer };
      setEmployerApplications(current => current.map(item => item.id === application.id ? updated : item));
      setSelectedCandidate(updated);
      setActionMessage("Offer sent. The candidate must accept before salary can be recorded.");
    } catch (error) {
      const message = (error as { response?: { data?: { message?: string } } }).response?.data?.message;
      setActionMessage(message || "The offer could not be sent.");
    }
  };
  const respondToCandidateOffer = async (application: JobsApiApplication, decision: "accepted" | "declined") => {
    try {
      const result = await respondToJobOffer(application.id, decision);
      setApplications(current => current.map(item => item.id === application.id
        ? { ...item, status: result.status, offer: item.offer ? { ...item.offer, status: decision } : item.offer }
        : item));
      setActionMessage(decision === "accepted" ? "Offer accepted. Your employer can now record salary payments." : "Offer declined.");
    } catch (error) {
      const message = (error as { response?: { data?: { message?: string } } }).response?.data?.message;
      setActionMessage(message || "The offer response could not be saved.");
    }
  };
  const recordCandidateSalary = async (application: JobsApiApplication) => {
    const amountValue = window.prompt("Salary amount paid in Pi");
    const txid = window.prompt("Pi transaction ID from the payer wallet");
    if (!amountValue || !txid) return;
    try {
      await recordJobSalaryPayment(application.id, {
        amountPi: Number(amountValue),
        txid,
        note: window.prompt("Payment note (optional)", "") || "",
      });
      setActionMessage("Salary record created. The candidate must verify the transaction in their wallet and confirm receipt.");
    } catch (error) {
      const message = (error as { response?: { data?: { message?: string } } }).response?.data?.message;
      setActionMessage(message || "The salary payment could not be recorded.");
    }
  };
  const respondToSalaryPayment = async (
    item: JobsEarningItem,
    paymentId: string,
    decision: "confirmed" | "disputed",
  ) => {
    const reason = decision === "disputed"
      ? window.prompt("Explain why this salary payment is disputed (at least 10 characters)", "") || ""
      : "";
    if (decision === "disputed" && reason.trim().length < 10) {
      setActionMessage("Please explain the dispute in at least 10 characters.");
      return;
    }
    try {
      const result = await respondToJobSalaryPayment(item.applicationId, paymentId, decision === "confirmed" ? "confirm" : "dispute", reason);
      setEarnings(current => current.map(entry => entry.applicationId === item.applicationId
        ? { ...entry, payments: entry.payments.map(payment => payment.paymentRecordId === paymentId ? { ...payment, status: result.status } : payment) }
        : entry));
      setActionMessage(decision === "confirmed" ? "Salary receipt confirmed." : "Payment disputed and sent for admin review.");
      const refreshed = await getJobsEarnings();
      setEarnings(refreshed.items || []);
      setEarningsSummary(refreshed.summary || null);
    } catch (error) {
      const message = (error as { response?: { data?: { message?: string } } }).response?.data?.message;
      setActionMessage(message || "The payment response could not be saved.");
    }
  };
  const withdrawCandidateApplication = async (application: JobsApiApplication) => {
    try {
      const status = await withdrawJobApplicationRequest(application.id);
      setApplications(current => current.map(item => (item.id === application.id ? { ...item, status } : item)));
      setWithdrawJobApplication(null);
    } catch {
      setActionMessage("Application could not be withdrawn.");
    }
  };
  const submitCompanyVerification = async (event: FormEvent<HTMLFormElement>, companyId: string) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await requestCompanyVerification(companyId, {
        registrationNumber: String(data.get("registrationNumber") || ""),
        businessEmail: String(data.get("businessEmail") || ""),
        representativeRole: String(data.get("representativeRole") || ""),
        notes: String(data.get("notes") || ""),
      });
      setEmployerCompanies(current =>
        current.map(company => (company.id === companyId ? { ...company, verificationStatus: "pending" } : company))
      );
      setActionMessage("Company verification submitted for admin review.");
      setVerificationCompanyId("");
    } catch {
      setActionMessage("Company verification request could not be submitted.");
    }
  };
  const submitCandidateVerification = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await requestCandidateVerification({
        portfolio: String(data.get("verificationPortfolio") || ""),
        credential: String(data.get("credential") || ""),
        notes: String(data.get("verificationNotes") || ""),
      });
      setProfile(current => (current ? { ...current, verificationStatus: "pending" } : current));
      setActionMessage("Professional verification submitted for review.");
    } catch {
      setActionMessage("Complete your professional profile before requesting verification.");
    }
  };
  const startBilling = async (planId: string) => {
    if (billingSubmittingPlanId) return;
    setBillingSubmittingPlanId(planId);
    try {
      const jobId = billingPlanJobId[planId] || undefined;
      const { intent, paymentEnabled, message } = await createJobsBillingIntent(planId, jobId);
      if (!paymentEnabled) {
        setActionMessage(message || "Billing request created.");
        return;
      }
      await payBilling(intent.billingId, intent.pricePi, `SMAJ Jobs — ${intent.name}`, {
        onReady: () => setActionMessage("Payment approved. Waiting for confirmation..."),
        onComplete: result => {
          setActionMessage(
            result.job
              ? `Payment confirmed. ${intent.name} is now active for ${result.job.title}.`
              : `Payment confirmed. ${intent.name} is now active.`
          );
          if (result.job) {
            const paidJob = result.job;
            setJobs(current => current.map(job => (job.id === paidJob.id ? { ...job, ...paidJob } : job)));
            setEmployerJobs(current => current.map(job => (job.id === paidJob.id ? { ...job, ...paidJob } : job)));
          }
        },
        onCancel: () => setActionMessage("Payment was cancelled."),
        onError: errorMessage => setActionMessage(errorMessage || "Payment failed."),
      });
    } catch {
      setActionMessage("Billing request could not be created.");
    } finally {
      setBillingSubmittingPlanId("");
    }
  };

  return (
    <AppLayout showHeader={false} showFooter={false}>
      {!jobsReady ? <div className="store-loading-overlay" aria-label="Opening Jobs" aria-live="polite"><div className="store-loading-spinner" /><span>Opening jobs...</span></div> : null}
      <main className="jobs-page">
        <JobsHeader
          query={query}
          onQueryChange={setQuery}
          workspaceMode={activeWorkspaceMode}
          onWorkspaceModeChange={mode => {
            if (mode === activeWorkspaceMode) return;
            setWorkspaceSwitchingTo(mode);
          }}
        />
        {workspaceSwitchingTo ? (
          <div className="jobs-workspace-switching" role="status" aria-live="polite">
            <i />
            <span>Switching to {workspaceSwitchingTo === "candidate" ? "Find work" : "Hire talent"}...</span>
          </div>
        ) : null}
        {showAvatarConfirmation ? (
          <div className="jobs-avatar-confirm-layer" role="dialog" aria-modal="true" aria-label="Confirm profile photo">
            <button
              className="jobs-avatar-confirm-overlay"
              type="button"
              aria-label="Not now"
              onClick={deferAvatarConfirmation}
            />
            <section className="jobs-avatar-confirm-sheet">
              <button
                className="jobs-avatar-confirm-close"
                type="button"
                aria-label="Not now"
                onClick={deferAvatarConfirmation}
              >
                ×
              </button>
              <span className="jobs-profile-avatar jobs-avatar-confirm-preview">
                {currentAvatar ? <img src={currentAvatar} alt="Your SMAJ profile" /> : (user?.displayName || "P")[0]}
              </span>
              <h2>{currentAvatar ? "Is this your current profile photo?" : "Add a profile photo"}</h2>
              <p>Jobs uses the same photo as your SMAJ PI HUB account.</p>
              <div className="jobs-avatar-confirm-feedback" role="status" aria-live="polite">
                {avatarConfirmationState === "saving" ? (
                  <>
                    <i /> Saving…
                  </>
                ) : null}
                {avatarConfirmationState === "saved" ? "✓ Saved" : null}
                {avatarConfirmationState === "error" ? "Could not save. Please try again." : null}
              </div>
              <div>
                {currentAvatar ? (
                  <button
                    type="button"
                    disabled={avatarConfirmationState === "saving" || avatarConfirmationState === "saved"}
                    onClick={() => void updateAvatarConfirmation("confirmed")}
                  >
                    {avatarConfirmationState === "saving"
                      ? "Saving…"
                      : avatarConfirmationState === "saved"
                        ? "Saved"
                        : "Yes"}
                  </button>
                ) : null}
                <Link to="/profile?edit=1&returnTo=%2Fservices%2Fjobs%2Fprofile">
                  {currentAvatar ? "Edit" : "Add photo"}
                </Link>
              </div>
            </section>
          </div>
        ) : null}
        {loading && kind !== "home" ? (
          <p className="jobs-status" role="status">
            Loading live opportunities…
          </p>
        ) : null}
        {error ? (
          <p className={`jobs-status ${offline ? "offline" : "error"}`} role="alert">
            {error}
          </p>
        ) : null}
        {kind === "home" && homeTab === "messages" ? (
          <section className="jobs-messages-page">
            {activeJobsConversation ? (
              <div className="jobs-chat-panel">
                <header>
                  <button type="button" aria-label="Back to Jobs messages" onClick={() => {
                    setActiveJobsConversation(null);
                    setJobsChatMessages([]);
                    navigate("/services/jobs?tab=messages");
                  }}>←</button>
                  <div><h1>{activeJobsConversation.participantName || "Jobs conversation"}</h1><small>{activeJobsConversation.jobTitle || "SMAJ PI Jobs"}</small></div>
                </header>
                <div className="jobs-chat-thread" aria-live="polite">
                  {jobsChatMessages.length ? jobsChatMessages.map(message => (
                    <article className={message.senderId === user?.uid ? "mine" : ""} key={message._id}>
                      <strong>{message.senderId === user?.uid ? "You" : message.senderName || activeJobsConversation.participantName}</strong>
                      <p>{message.message}</p>
                    </article>
                  )) : <p className="jobs-chat-start">{waitingForEmployerMessage ? "Waiting for the employer’s first message." : "Send the first message to start this Jobs conversation."}</p>}
                </div>
                <form className="jobs-chat-compose" onSubmit={sendJobsChatMessage}>
                  <input disabled={waitingForEmployerMessage} value={jobsChatDraft} onChange={event => setJobsChatDraft(event.target.value)} placeholder={waitingForEmployerMessage ? "Employer will message first" : "Write a message"} aria-label="Jobs message" />
                  <button type="submit" disabled={waitingForEmployerMessage || jobsChatSending || !jobsChatDraft.trim()}>{jobsChatSending ? "Sending…" : "Send"}</button>
                </form>
              </div>
            ) : <>
              <div className="jobs-page-heading jobs-messages-heading">
              <h1>Messages</h1>
              <button
                type="button"
                className={messageFilter === "all" ? "" : "active"}
                aria-label="Filter messages"
                aria-expanded={messageFilterOpen}
                onClick={() => setMessageFilterOpen(open => !open)}
              >
                <FilterListRoundedIcon />
                {unreadJobMessages ? <b>{unreadJobMessages}</b> : null}
              </button>
              {messageFilterOpen ? (
                <div className="jobs-message-filter-menu" role="menu">
                  {(["all", "unread", "invites"] as const).map(filter => (
                    <button
                      type="button"
                      role="menuitemradio"
                      aria-checked={messageFilter === filter}
                      className={messageFilter === filter ? "active" : ""}
                      onClick={() => {
                        setMessageFilter(filter);
                        setMessageFilterOpen(false);
                      }}
                      key={filter}
                    >
                      <span>{filter === "all" ? "All messages" : filter === "unread" ? "Unread" : "Job invites"}</span>
                      {messageFilter === filter ? <span aria-hidden="true">✓</span> : null}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
              {messagesLoading ? (
              <div className="jobs-message-loading" role="status"><span /><span /><span />Loading messages…</div>
            ) : visibleJobConversations.length ? (
              <div className="jobs-message-list">
                {visibleJobConversations.map(conversation => (
                  <button type="button" onClick={() => {
                    navigate(`/services/jobs?tab=messages&conversation=${encodeURIComponent(conversation._id)}`);
                    void openJobsConversation(conversation);
                  }} key={conversation._id}>
                    <span className="jobs-message-avatar">{(conversation.participantName || "M").slice(0, 1).toUpperCase()}</span>
                    <span><strong>{conversation.participantName || "SMAJ member"}</strong><small>{conversation.lastMessage || "Open conversation"}</small></span>
                    {user?.uid && conversation.unreadBy?.includes(user.uid) ? <i aria-label="Unread message" /> : null}
                  </button>
                ))}
              </div>
            ) : <div className="workspace-empty jobs-message-empty">
              <ChatOutlinedIcon />
              <h2>{messageFilter === "all" ? "No messages yet" : messageFilter === "unread" ? "No unread messages" : "No job invites"}</h2>
              <p>When a verified employer or candidate contacts you, the conversation will show here.</p>
              <Link to={activeWorkspaceMode === "employer" ? "/services/jobs/candidates" : "/services/jobs/search"}>
                {activeWorkspaceMode === "employer" ? "View candidates" : "Find opportunities"}
              </Link>
              </div>}
            </>}
          </section>
        ) : kind === "home" && homeTab === "employer-applications" ? (
          <section className="jobs-candidates-page jobs-employer-applications-page">
            <div className="jobs-page-heading">
              <h1>Applications</h1>
            </div>
            <div className="jobs-candidate-toolbar jobs-employer-applications-toolbar">
              <label>
                <SearchRoundedIcon />
                <input value={employerApplicationQuery} onChange={event => setEmployerApplicationQuery(event.target.value)} placeholder="Search applications, jobs, candidates" />
              </label>
              <select value={employerApplicationStage} onChange={event => setEmployerApplicationStage(event.target.value as typeof employerApplicationStage)}>
                <option value="All">All stages</option>
                {candidateStages.map(stage => <option key={stage}>{stage}</option>)}
              </select>
            </div>
            <nav className="jobs-candidate-tabs jobs-employer-application-tabs" aria-label="Application stages">
              {(["All", ...candidateStages] as Array<"All" | (typeof candidateStages)[number]>).map(stage => {
                const count =
                  stage === "All"
                    ? employerApplications.length
                    : employerApplications.filter(item => candidateStageForStatus(item.status) === stage).length;
                return (
                  <button
                    type="button"
                    key={stage}
                    className={employerApplicationStage === stage ? "active" : ""}
                    onClick={() => setEmployerApplicationStage(stage)}
                  >
                    <span>{stage}</span>
                    <b>{count}</b>
                  </button>
                );
              })}
            </nav>
            <div className="jobs-application-list">
              {filteredEmployerApplications.map(application => {
                const stage = candidateStageForStatus(application.status);
                return (
                <article key={application.id} className="jobs-employer-application-card">
                  {renderCandidateAvatar(application)}
                  <div className="jobs-employer-application-main">
                    <h2>{application.jobTitle}</h2>
                    <p>
                      {application.profileSnapshot?.title || "Candidate"} · {application.company}
                    </p>
                    <small>{application.profileSnapshot?.location || "Location not added"}</small>
                  </div>
                  <div className="jobs-employer-application-actions">
                    <b>{stage}</b>
                    <button type="button" onClick={() => { setSelectedCandidate(application); setCandidateDrawerTab("Profile"); }}>Review</button>
                  </div>
                </article>
              );})}
              {!filteredEmployerApplications.length ? (
                <div className="workspace-empty">
                  <WorkOutlineRoundedIcon />
                  <h2>{employerApplications.length ? "No matching applications" : "No applications yet"}</h2>
                  <p>{employerApplications.length ? "Try another search or stage filter." : "Applications for your posted jobs will appear here."}</p>
                  <Link to={employerApplications.length ? "/services/jobs/candidates" : "/services/jobs/post"}>{employerApplications.length ? "View candidates" : "Post a job"}</Link>
                </div>
              ) : null}
            </div>
            {selectedCandidate ? (
              <aside className="jobs-candidate-drawer" role="dialog" aria-modal="true" aria-label="Candidate profile">
                <button type="button" aria-label="Close candidate profile" onClick={() => setSelectedCandidate(null)}>x</button>
                <header>
                  {renderCandidateAvatar(selectedCandidate)}
                  <div>
                    <h2>{selectedCandidate.profileSnapshot?.title || "Candidate profile"}</h2>
                    <p>{selectedCandidate.jobTitle} Â· {candidateStageForStatus(selectedCandidate.status)}</p>
                  </div>
                </header>
                <nav>
                  {candidateDrawerTabs.map(tab => <button type="button" key={tab} className={candidateDrawerTab === tab ? "active" : ""} onClick={() => setCandidateDrawerTab(tab)}>{tab}</button>)}
                </nav>
                {candidateDrawerTab === "Profile" ? (
                  <div className="jobs-candidate-profile-grid">
                    <article><span>Professional title</span><b>{selectedCandidate.profileSnapshot?.title || "Not added"}</b></article>
                    <article><span>Location</span><b>{selectedCandidate.profileSnapshot?.location || "Not added"}</b></article>
                    <article><span>Availability</span><b>{selectedCandidate.profileSnapshot?.availability || "Not added"}</b></article>
                    <article><span>Skills</span><p>{Array.isArray(selectedCandidate.profileSnapshot?.skills) ? selectedCandidate.profileSnapshot?.skills.join(", ") : selectedCandidate.profileSnapshot?.skills || "Not added"}</p></article>
                    <article className="wide"><span>Summary</span><p>{selectedCandidate.profileSnapshot?.summary || selectedCandidate.coverNote || "No summary yet."}</p></article>
                  </div>
                ) : candidateDrawerTab === "Messages" ? (
                  <div className="jobs-candidate-message-start">
                    <p>Start a private Jobs conversation about this application.</p>
                    <button type="button" onClick={() => void startEmployerConversation(selectedCandidate)}>Message candidate</button>
                  </div>
                ) : candidateDrawerTab === "Application" ? (
                  <div className="jobs-candidate-profile-grid">
                    <article>
                      <span>Status</span>
                      <select
                        aria-label={`Status for ${selectedCandidate.jobTitle}`}
                        value={selectedCandidate.status}
                        onChange={event => void changeApplicationStatus(selectedCandidate.id, event.target.value)}
                      >
                        <option value="submitted">submitted</option>
                        <option value="reviewing">reviewing</option>
                        <option value="shortlisted">shortlisted</option>
                        <option value="rejected">rejected</option>
                        <option value="hired">hired</option>
                      </select>
                    </article>
                    <article className="wide"><span>Cover note</span><p>{selectedCandidate.coverNote || "No cover note attached."}</p></article>
                    <article className="wide jobs-offer-panel">
                      <span>Offer & salary</span>
                      {selectedCandidate.offer ? (
                        <p>
                          {formatJobsPi(selectedCandidate.offer.amountPi)} / {selectedCandidate.offer.period}
                          {" · "}{selectedCandidate.offer.status}
                        </p>
                      ) : <p>No formal offer sent.</p>}
                      {selectedCandidate.status === "hired" && selectedCandidate.offer?.status === "accepted" ? (
                        <button type="button" onClick={() => void recordCandidateSalary(selectedCandidate)}>
                          Record salary payment
                        </button>
                      ) : ["reviewing", "shortlisted", "offer_sent"].includes(selectedCandidate.status) ? (
                        <button type="button" onClick={() => void sendCandidateOffer(selectedCandidate)}>
                          {selectedCandidate.offer?.status === "sent" ? "Replace offer" : "Send formal offer"}
                        </button>
                      ) : <small>Move this application to reviewing or shortlisted before sending an offer.</small>}
                      <small>Salary is confirmed only after the candidate verifies the Pi transaction in their own wallet.</small>
                    </article>
                  </div>
                ) : candidateDrawerTab === "Interviews" ? (
                  <div className="jobs-candidate-interviews">
                    {(selectedCandidate.interviews || []).length ? (
                      <ul>
                        {selectedCandidate.interviews!.map((interview: JobsApiInterview) => (
                          <li key={interview.id}>
                            <div>
                              <b>{new Date(interview.scheduledAt).toLocaleString()}</b>
                              {interview.note ? <p>{interview.note}</p> : null}
                            </div>
                            <button type="button" onClick={() => void cancelCandidateInterview(interview.id)}>Cancel</button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p>No interviews scheduled.</p>
                    )}
                    <div className="jobs-schedule-interview">
                      <label>
                        Date and time
                        <input
                          type="datetime-local"
                          value={interviewDateDraft}
                          onChange={event => setInterviewDateDraft(event.target.value)}
                        />
                      </label>
                      <label>
                        Note (optional)
                        <input
                          value={interviewNoteDraft}
                          onChange={event => setInterviewNoteDraft(event.target.value)}
                          placeholder="Video call, location, or agenda"
                        />
                      </label>
                      <button
                        type="button"
                        disabled={!interviewDateDraft || interviewSubmitting}
                        onClick={() => void scheduleCandidateInterview()}
                      >
                        {interviewSubmitting ? "Scheduling…" : "Schedule interview"}
                      </button>
                    </div>
                  </div>
                ) : candidateDrawerTab === "Notes" ? (
                  <div className="jobs-candidate-notes">
                    <textarea
                      value={candidateNotesDraft}
                      onChange={event => setCandidateNotesDraft(event.target.value)}
                      placeholder="Private notes for your hiring team"
                      rows={6}
                    />
                    <button type="button" disabled={candidateNotesSaving} onClick={() => void saveCandidateNotes()}>
                      {candidateNotesSaving ? "Saving…" : "Save notes"}
                    </button>
                  </div>
                ) : (
                  <div className="jobs-candidate-profile-grid">
                    <article className="wide"><span>{candidateDrawerTab}</span><p>No activity yet.</p></article>
                  </div>
                )}
              </aside>
            ) : null}
          </section>
        ) : kind === "home" ? (
          activeWorkspaceMode === "employer" ? (
            <>
              <section className="jobs-employer-home">
                <div className="jobs-employer-hero">
                  <video
                    ref={employerHeroVideoRef}
                    className="jobs-employer-hero-video"
                    autoPlay
                    muted
                    loop
                    playsInline
                    aria-hidden="true"
                  >
                    <source src="/videos/jobs-employer-hero.mp4" type="video/mp4" />
                    <source src="/videos/jobs-employer-hero.webm" type="video/webm" />
                  </video>
                  <span>SMAJ FOR EMPLOYERS</span>
                  <h1>Hiring trusted Pi talent is simpler, faster, and more human</h1>
                  <Link to="/services/jobs/post">Post a job</Link>
                  <button
                    type="button"
                    aria-label={employerHeroVideoPaused ? "Play employer hero video" : "Pause employer hero video"}
                    onClick={() => {
                      const video = employerHeroVideoRef.current;
                      if (!video) return;
                      if (video.paused) {
                        void video.play();
                        setEmployerHeroVideoPaused(false);
                      } else {
                        video.pause();
                        setEmployerHeroVideoPaused(true);
                      }
                    }}
                  >
                    {employerHeroVideoPaused ? <PlayArrowRoundedIcon /> : <PauseRoundedIcon />}
                  </button>
                </div>
                <form
                  className="jobs-employer-search-card"
                  onSubmit={event => {
                    event.preventDefault();
                    const params = new URLSearchParams();
                    const cleanTitle = employerTitle.trim();
                    const cleanLocation = employerLocation.trim();
                    if (cleanTitle) params.set("q", cleanTitle);
                    if (cleanLocation) params.set("location", normalizeJobLocation(cleanLocation));
                    navigate(`/services/jobs/candidates${params.size ? `?${params.toString()}` : ""}`);
                  }}
                >
                  <h2>The people you're looking for are here</h2>
                  <label>
                    What job title are you hiring for?
                    <input
                      name="title"
                      placeholder="Job title or role"
                      value={employerTitle}
                      onChange={event => setEmployerTitle(event.target.value)}
                    />
                  </label>
                  <label>
                    Where are you hiring?
                    <input
                      name="location"
                      placeholder="City, State, or ZIP"
                      value={employerLocation}
                      onChange={event => setEmployerLocation(event.target.value)}
                    />
                  </label>
                  <button type="submit">Search</button>
                </form>
                <div className="jobs-employer-map-preview" aria-hidden="true" />
              </section>
            </>
          ) : (
          <>
            <section className="jobs-home-dashboard">
              <form
                className="jobs-quick-search"
                role="search"
                onSubmit={event => {
                  event.preventDefault();
                  runJobSearch();
                }}
              >
                <label>
                  <SearchRoundedIcon />
                  <input
                    value={query}
                    onChange={event => setQuery(event.target.value)}
                    placeholder="Job title, skill or company"
                    aria-label="Job title, skill or company"
                    onFocus={() => setSearchSheetOpen(true)}
                  />
                </label>
                <label>
                  <LocationOnOutlinedIcon />
                  <input
                    value={location}
                    onChange={event => setLocation(event.target.value)}
                    placeholder="Country, city or remote"
                    aria-label="Country, city or remote"
                    onFocus={() => setLocationSheetOpen(true)}
                  />
                </label>
                <button type="submit">Search</button>
              </form>
              {searchSheetOpen ? (
                <div className="jobs-search-sheet-layer">
                  <button
                    className="jobs-search-sheet-overlay"
                    type="button"
                    aria-label="Close job search"
                    onClick={() => setSearchSheetOpen(false)}
                  />
                  <section className="jobs-search-sheet" role="dialog" aria-modal="true" aria-label="Search jobs">
                    <header>
                      <button type="button" onClick={() => setSearchSheetOpen(false)} aria-label="Back">
                        <ArrowBackRoundedIcon />
                      </button>
                      <label>
                        <SearchRoundedIcon />
                        <input
                          autoFocus
                          value={query}
                          onChange={event => setQuery(event.target.value)}
                          onKeyDown={event => {
                            if (event.key === "Enter") runJobSearch();
                          }}
                          placeholder="Job title, keywords, or company"
                          aria-label="Search job title, keywords, or company"
                        />
                      </label>
                    </header>
                    <div className="jobs-search-suggestions">
                      <b>Search suggestions</b>
                      {jobSearchSuggestions.map(suggestion => (
                        <button
                          type="button"
                          key={suggestion}
                          onClick={() => {
                            setQuery(suggestion);
                            runJobSearch(suggestion);
                          }}
                        >
                          <SearchRoundedIcon /> <span>{suggestion}</span>
                        </button>
                      ))}
                      {!jobSearchSuggestions.length ? <p>No matching suggestions. Search for “{query}”.</p> : null}
                    </div>
                    <footer>
                      <button type="button" onClick={() => runJobSearch()}>
                        Search
                      </button>
                    </footer>
                  </section>
                </div>
              ) : null}
              {locationSheetOpen ? (
                <div className="jobs-search-sheet-layer">
                  <button
                    className="jobs-search-sheet-overlay"
                    type="button"
                    aria-label="Close location search"
                    onClick={() => setLocationSheetOpen(false)}
                  />
                  <section className="jobs-search-sheet" role="dialog" aria-modal="true" aria-label="Search location">
                    <header>
                      <button type="button" onClick={() => setLocationSheetOpen(false)} aria-label="Back">
                        <ArrowBackRoundedIcon />
                      </button>
                      <label>
                        <LocationOnOutlinedIcon />
                        <input
                          autoFocus
                          value={location}
                          onChange={event => setLocation(event.target.value)}
                          onKeyDown={event => {
                            if (event.key === "Enter") runJobSearch();
                          }}
                          placeholder='City, country, or "remote"'
                          aria-label="Search city, country, or remote"
                        />
                      </label>
                    </header>
                    <div className="jobs-search-suggestions jobs-location-suggestions">
                      {locationSuggestions.accountLocation ? (
                        <button type="button" onClick={() => selectLocation(locationSuggestions.accountLocation || "")}>
                          <HomeRoundedIcon />
                          <span>
                            <b>Your location</b>
                            <small>{locationSuggestions.accountLocation}</small>
                          </span>
                        </button>
                      ) : null}
                      {locationSuggestions.results.map(suggestion => (
                        <button type="button" key={suggestion} onClick={() => selectLocation(suggestion)}>
                          <LocationOnOutlinedIcon /> <span>{suggestion}</span>
                        </button>
                      ))}
                      {!locationSuggestions.results.length ? <p>No matching locations found.</p> : null}
                    </div>
                    <footer>
                      <button type="button" onClick={() => runJobSearch()}>
                        Search
                      </button>
                    </footer>
                  </section>
                </div>
              ) : null}
              {user && activeWorkspaceMode === "candidate" ? (
                <JobPreferencesPanel
                  key={loading ? "loading-candidate-preferences" : profile?.updatedAt || profile?.jobsMode || "new"}
                  userName={user.displayName || user.piUsername || user.username || "Pioneer"}
                  profile={profile}
                  jobs={jobs}
                  onSaved={preferences => {
                    setProfile(current => ({
                      ...(current || {
                        title: "",
                        skills: [],
                        location: "",
                        availability: "",
                        portfolio: "",
                        summary: "",
                      }),
                      ...preferences,
                    }));
                    if (preferences.jobsMode === "employer") {
                      setWorkspaceMode("employer");
                      navigate("/services/jobs");
                    }
                  }}
                />
              ) : null}
              {user && activeWorkspaceMode === "candidate" ? (
                <section className="jobs-recommended">
                  <h2>Recommended jobs</h2>
                  {loading ? (
                    <div className="jobs-recommendation-skeleton" aria-label="Loading recommended jobs">
                      <span />
                      <span />
                      <span />
                    </div>
                  ) : recommendedJobs.length ? (
                    <div className="jobs-list">
                      {recommendedJobs.map(job => (
                        <JobCard key={job.id} job={job} saved={saved.has(job.id)} onSave={() => saveJob(job.id)} />
                      ))}
                    </div>
                  ) : (
                    <p className="jobs-recommendation-note">
                      ⓘ We can’t find any job recommendations for you at the moment.
                    </p>
                  )}
                </section>
              ) : null}
            </section>
            {!user ? <section className="jobs-hero">
              <div>
                <span className="jobs-kicker">VERIFIED TALENT. REAL OPPORTUNITIES.</span>
                <h1>
                  Build your future in the <em>Pi economy.</em>
                </h1>
                <p>Find trusted jobs and freelance projects, connect with verified employers, and get paid in Pi.</p>
                <small>Popular: React · Design · Marketing · Customer support</small>
              </div>
              <aside>
                <span>OPPORTUNITY SNAPSHOT</span>
                <strong>{metrics.opportunities}</strong>
                <p>active opportunities</p>
                <div>
                  <b>{metrics.verifiedEmployers}</b>
                  <small>Verified employers</small>
                </div>
                <div>
                  <b>{metrics.remotePercent}%</b>
                  <small>Remote friendly</small>
                </div>
                <div>
                  <b>100%</b>
                  <small>Pi-powered</small>
                </div>
              </aside>
            </section> : null}
            <section className="jobs-section">
              <header className="jobs-featured-header">
                <h2>Featured opportunities</h2>
                <Link to="/services/jobs/search">
                  View all <ArrowForwardRoundedIcon />
                </Link>
              </header>
              <div className="jobs-list">
                {jobs
                  .filter(job => job.featured)
                  .map(job => (
                    <JobCard key={job.id} job={job} saved={saved.has(job.id)} onSave={() => saveJob(job.id)} />
                  ))}
              </div>
            </section>
            <section className="jobs-section jobs-categories">
              <header>
                <div>
                  <span className="jobs-kicker">EXPLORE</span>
                  <h2>Find work by category</h2>
                </div>
              </header>
              <div>
                {["Engineering", "Design", "Marketing", "Operations"].map((name, index) => (
                  <Link key={name} to={`/services/jobs/search?q=${name}`}>
                    <span>{["⌘", "✦", "↗", "◎"][index]}</span>
                    <b>{name}</b>
                    <small>{18 + index * 11} open roles</small>
                  </Link>
                ))}
              </div>
            </section>
            <section className="jobs-cta">
              <div>
                <span className="jobs-kicker">FOR EMPLOYERS</span>
                <h2>Meet talent that is ready to build.</h2>
                <p>Publish a role, review verified profiles and manage candidates in one place.</p>
              </div>
              <button type="button" onClick={openEmployerPostFlow}>
                Post your first job <ArrowForwardRoundedIcon />
              </button>
            </section>
          </>
          )
        ) : kind === "companies" ? (
          <section className="jobs-directory">
            <div className="jobs-page-heading">
              <h1>Explore companies</h1>
              <p>Discover verified teams building products and services across the Pi ecosystem.</p>
            </div>
            <label className="jobs-company-search">
              <SearchRoundedIcon />
              <input
                type="search"
                value={companyQuery}
                onChange={event => setCompanyQuery(event.target.value)}
                placeholder="Search companies or industries"
                aria-label="Search companies"
              />
            </label>
            <div className="company-grid">
              {filteredCompanies.map(company => (
                <Link to={`/services/jobs/company/${company.id}`} key={company.id}>
                  <span>{company.mark}</span>
                  <h2>
                    {company.name}{" "}
                    {company.verificationStatus === "verified" || company.verificationStatus === "pi_kyb" ? (
                      <CheckCircleRoundedIcon aria-label="Verified company" />
                    ) : null}
                  </h2>
                  <p>{company.field}</p>
                  <b>{company.openings} open opportunities</b>
                </Link>
              ))}
            </div>
            {!filteredCompanies.length ? (
              <div className="workspace-empty jobs-company-empty">
                <SearchRoundedIcon />
                <h2>No companies found</h2>
                <p>Try another company name or industry.</p>
              </div>
            ) : null}
          </section>
        ) : kind === "job" && selectedJob ? (
          <section className="job-detail">
            <Link to="/services/jobs/search">← Back to jobs</Link>
            <div className="job-detail-grid">
              <article>
                <span className="jobs-kicker">{selectedJob.company} · VERIFIED</span>
                <h1>{selectedJob.title}</h1>
                <p>
                  <LocationOnOutlinedIcon /> {selectedJob.location} · {selectedJob.mode} · {selectedJob.type}
                </p>
                <strong className="job-detail-salary">
                  {displayJobSalary(selectedJob)}
                </strong>
                <div className="job-detail-actions">
                  <button onClick={() => setApplyOpen(value => !value)}>Apply now</button>
                  <button onClick={() => saveJob(selectedJob.id)}>Save job</button>
                </div>
                {actionMessage ? <p className="jobs-action-message">{actionMessage}</p> : null}
                {applyOpen ? (
                  <form className="job-application-form" onSubmit={submitApplication}>
                    <h2>Apply for this role</h2>
                    <section className="job-application-profile" aria-label="Application profile and CV">
                      <div>
                        <span>Applying as</span>
                        <strong>{user?.displayName || user?.username || "Your SMAJ PI profile"}</strong>
                        <small>
                          {[profile?.title, profile?.location].filter(Boolean).join(" · ") ||
                            "Complete your professional details before applying."}
                        </small>
                      </div>
                      <div>
                        <span>CV</span>
                        <strong>{profile?.cv?.name || "No CV uploaded"}</strong>
                        <small>
                          {!profile?.cv
                            ? "Add a CV to strengthen your application."
                            : profile.cv.visibility === "applications"
                              ? "This CV will be attached to your application."
                              : profile.cv.visibility === "verified_employers"
                                ? "This CV is shared only with verified employers."
                                : "This CV is private and will not be attached."}
                        </small>
                      </div>
                      <Link to="/services/jobs/profile">{profile?.cv ? "Review profile and CV" : "Add profile and CV"}</Link>
                    </section>
                    <label>
                      Cover note
                      <textarea
                        value={applyNote}
                        onChange={event => setApplyNote(event.target.value)}
                        rows={5}
                        minLength={20}
                        required
                        placeholder="Introduce yourself and explain why you are a strong match."
                      />
                    </label>
                    <button type="submit" disabled={applicationSubmitting} aria-busy={applicationSubmitting}>
                      {applicationSubmitting ? <><span className="jobs-submit-spinner" /> Submitting…</> : "Submit application"}
                    </button>
                  </form>
                ) : null}
                <h2>About the role</h2>
                <p>
                  {selectedJob.summary} You will collaborate with a distributed team, own meaningful outcomes and help
                  create reliable digital experiences.
                </p>
                <h2>What you will bring</h2>
                <ul>
                  <li>Strong practical experience in your discipline.</li>
                  <li>Clear communication and thoughtful collaboration.</li>
                  <li>A portfolio or examples of relevant work.</li>
                </ul>
                <h2>Skills</h2>
                <div className="job-skills">
                  {selectedJob.skills.map(skill => (
                    <span key={skill}>{skill}</span>
                  ))}
                </div>
              </article>
              <aside>
                <p>Paid through the Pi ecosystem</p>
                <hr />
                <span>Compensation</span>
                <b>{displayJobSalary(selectedJob)}</b>
                <span>Category</span>
                <strong>{selectedJob.category}</strong>
                <span>Work type</span>
                <strong>{selectedJob.type}</strong>
                <span>Location</span>
                <strong>{selectedJob.location}</strong>
              </aside>
            </div>
          </section>
        ) : kind === "job" && detailLoading ? (
          <section className="job-detail jobs-detail-loading" aria-busy="true">
            <Link to="/services/jobs/search">← Back to jobs</Link>
            <p>Loading job…</p>
          </section>
        ) : kind === "job" ? (
          <section className="job-detail jobs-detail-not-found">
            <Link to="/services/jobs/search">← Back to jobs</Link>
            <h1>Job not found</h1>
            <p>This opportunity may have expired, been removed, or is no longer available.</p>
          </section>
        ) : kind === "company" && selectedCompany ? (
          <section className="jobs-directory">
            <div className="company-hero">
              <span>{selectedCompany.mark}</span>
              <div>
                <small>
                  {selectedCompany.verificationStatus === "pi_kyb"
                    ? "PI KYB VERIFIED"
                    : selectedCompany.verificationStatus === "verified"
                      ? "VERIFIED EMPLOYER"
                      : selectedCompany.verificationStatus === "pending"
                        ? "VERIFICATION PENDING"
                        : selectedCompany.verificationStatus === "claimed"
                          ? "CLAIMED COMPANY"
                          : "COMPANY PROFILE"}
                </small>
                <h1>{selectedCompany.name}</h1>
                <p>{selectedCompany.field} · Building useful products for the Pi community.</p>
              </div>
            </div>
            <div className="jobs-page-heading">
              <h2>Open opportunities</h2>
            </div>
            <div className="jobs-list">
              {selectedCompanyJobs.map(job => (
                <JobCard key={job.id} job={job} saved={saved.has(job.id)} onSave={() => saveJob(job.id)} />
              ))}
            </div>
          </section>
        ) : kind === "company" && detailLoading ? (
          <section className="jobs-directory jobs-detail-loading" aria-busy="true">
            <p>Loading company…</p>
          </section>
        ) : kind === "company" ? (
          <section className="jobs-directory jobs-detail-not-found">
            <Link to="/services/jobs/companies">← Back to companies</Link>
            <h1>Company not found</h1>
            <p>This company profile may have been removed or is not yet approved.</p>
          </section>
        ) : kind === "activity" ? (
          <section className="jobs-activity-page">
            <header>
              <h1>Activity on profile</h1>
              <small>Since last 3 months</small>
            </header>
            <nav>
              <button
                className={activityTab === "appearances" ? "active" : ""}
                onClick={() => setActivityTab("appearances")}
              >
                Search Appearances
              </button>
              <button className={activityTab === "actions" ? "active" : ""} onClick={() => setActivityTab("actions")}>
                Employer Actions <sup>New</sup>
              </button>
            </nav>
            {activityTab === "appearances" ? (
              <>
                <div className="jobs-activity-periods">
                  {[7, 30, 90].map(days => (
                    <button
                      className={activityDays === days ? "active" : ""}
                      onClick={() => setActivityDays(days)}
                      key={days}
                    >
                      LAST {days} DAYS ({activity?.totalAppearances || 0})
                    </button>
                  ))}
                </div>
                <p className="jobs-activity-total">
                  <b>{String(activity?.totalAppearances || 0).padStart(2, "0")}</b> times your profile appeared in
                  employer search results.
                </p>
                <div className="jobs-activity-chart">
                  <h2>Searches on Your Profile</h2>
                  <div>
                    {(activity?.appearances || []).slice(-7).map(point => (
                      <span key={point.date}>
                        <i style={{ height: `${Math.max(2, point.count * 8)}px` }} />
                        <small>{new Date(point.date).toLocaleDateString(undefined, { weekday: "short" })}</small>
                      </span>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="jobs-employer-actions">
                {activity?.employerActions.length ? (
                  activity.employerActions.map(action => (
                    <article key={`${action.at}-${action.jobTitle}`}>
                      <b>{action.company}</b>
                      <p>
                        {action.status} your application for {action.jobTitle}
                      </p>
                      <small>{new Date(action.at).toLocaleDateString()}</small>
                    </article>
                  ))
                ) : (
                  <div>
                    <h2>Your profile has no Employer Actions!</h2>
                    <p>Keep your profile updated with relevant information.</p>
                    <Link to="/services/jobs/profile">VIEW AND UPDATE PROFILE</Link>
                  </div>
                )}
              </div>
            )}
            <footer>
              <Link to="/services/jobs/profile">Feature your profile</Link>
              <p>Complete your profile so verified employers can discover relevant talent.</p>
            </footer>
          </section>
        ) : kind === "settings" ? (
          <section className="jobs-settings-page">
            <header><Link to="/services/jobs/profile">←</Link><h1>Settings</h1></header>
            <nav>
              <Link to="/services/jobs/settings/visibility">
                <b>Profile Visibility</b>
                <small>Current Status: Actively looking for a job</small>
              </Link>
              <button type="button"><b>Manage Communications</b><small>Currently Receiving Job Related Communications, Career Related Communications and Promotion & Offers</small></button>
              <Link to="/services/jobs/settings/account"><b>Manage Account</b><small>View your Pi Network identity and SMAJ PI HUB account details</small></Link>
              <Link to="/services/jobs/settings/blocked-employers"><b>Block Employers</b><small>Add employers to ensure they are not able to see you</small></Link>
            </nav>
          </section>
        ) : kind === "visibility" ? (
          <section className="jobs-settings-page jobs-visibility-page">
            <header><Link to="/services/jobs/settings">←</Link><h1>Profile Visibility</h1></header>
            <label className="jobs-visibility-option">
              <span><b>I am actively looking for a job</b><small>Your profile will be visible to employers and they can reach out to you for matching opportunities</small></span>
              <input type="radio" name="profileVisibility" checked={profileVisibility === "active"} onChange={() => setProfileVisibility("active")} />
            </label>
            <section className="jobs-visible-details">
              <button type="button" onClick={() => setVisibilityDetailsOpen(value => !value)}>
                <span><b>Basic details visible to employers</b><small>Hiding below details will lead to less profile views by employers. We can not hide any detail within attached/pasted CVs</small></span>
                <i>{visibilityDetailsOpen ? "⌃" : "⌄"}</i>
              </button>
              {visibilityDetailsOpen ? <ul>{["Email", "Name", "Contact Number", "Current Employer"].map(item => <li key={item}><span>{item}</span><small>Visible ◉</small></li>)}</ul> : null}
            </section>
            <label className="jobs-visibility-option">
              <span><b>Not looking for a job change right now but open to good opportunities</b><small>Your profile will not be visible to employers but you can still search and apply to jobs. You may still receive relevant jobs on your email Id.</small></span>
              <input type="radio" name="profileVisibility" checked={profileVisibility === "open"} onChange={() => setProfileVisibility("open")} />
            </label>
            <label className="jobs-visibility-option">
              <span><b>I want to deactivate my account</b><small>Employers will not be able to view your profile and you will not receive job related updates</small></span>
              <input type="radio" name="profileVisibility" checked={profileVisibility === "deactivated"} onChange={() => setProfileVisibility("deactivated")} />
            </label>
          </section>
        ) : kind === "account-settings" ? (
          <section className="jobs-settings-page jobs-account-page">
            <header><Link to="/services/jobs/settings">←</Link><h1>Manage Account</h1></header>
            <section className="jobs-login-details">
              <h2>Your Login Details</h2>
              <div><span>Pi username</span><b>@{user?.piUsername || user?.username || "Pioneer"}</b><small>This is your Pi Network identity used to access SMAJ PI HUB Jobs.</small></div>
              <div><span>Display name</span><b>{user?.displayName || user?.piUsername || user?.username || "Pioneer"}</b></div>
              {user?.wallet_address ? <div><span>Wallet address</span><b>{`${user.wallet_address.slice(0, 7)}…${user.wallet_address.slice(-5)}`}</b></div> : null}
            </section>
            <section className="jobs-pi-connection">
              <span className="jobs-pi-mark">π</span>
              <div><b>Connected to Pi Network</b><small>@{user?.piUsername || user?.username || "Pioneer"}</small></div>
              <span className="jobs-connected-dot" aria-label="Connected">✓</span>
            </section>
            <section className="jobs-account-benefits">
              <h2>Why connect your Pi account?</h2>
              <p>✓ No additional Jobs password required</p>
              <p>✓ Uses your existing SMAJ PI HUB identity</p>
              <p>✓ Supports Pi payments</p>
              <p>✓ Helps protect employers and job seekers</p>
              <small>Your details remain private and are handled according to your profile visibility.</small>
            </section>
          </section>
        ) : kind === "blocked-employers" ? (
          <section className="jobs-settings-page jobs-block-employers">
            <header><Link to="/services/jobs/settings">←</Link><h1>Block Employers</h1></header>
            <div>
              <p>Hide my profile from companies chosen below</p>
              <label>
                <SearchRoundedIcon />
                <input value={employerSearch} onChange={event => setEmployerSearch(event.target.value)} placeholder="Search verified company name" />
              </label>
              <div className="jobs-employer-suggestions">
                {employerSearch.trim() ? companies.filter(company => company.name.toLowerCase().includes(employerSearch.trim().toLowerCase()) && !blockedEmployers.includes(company.id)).slice(0, 6).map(company => (
                  <button type="button" key={company.id} onClick={() => {
                    setEmployerSearch("");
                    void toggleBlockedEmployer(company.id)
                      .then(result => setBlockedEmployers(result.blockedEmployerIds))
                      .catch(() => setActionMessage("This employer could not be blocked. Try again."));
                  }}><span>{company.name}</span><small>{company.verificationStatus === "verified" || company.verificationStatus === "pi_kyb" ? "Verified company" : company.field}</small><b>Block</b></button>
                )) : null}
              </div>
              {blockedEmployers.length ? <section className="jobs-blocked-list"><h2>Blocked employers</h2>{blockedEmployers.map(id => {
                const company = companies.find(item => item.id === id);
                return <div key={id}><span>{company?.name || id}</span><button type="button" onClick={() => {
                  void toggleBlockedEmployer(id)
                    .then(result => setBlockedEmployers(result.blockedEmployerIds))
                    .catch(() => setActionMessage("This employer could not be unblocked. Try again."));
                }}>Unblock</button></div>;
              })}</section> : null}
            </div>
          </section>
        ) : kind === "candidates" ? (
          <section className="jobs-candidates-page">
            {isCandidateSearchMode ? (
              <>
                <div className="jobs-candidates-title">
                  <h1>Candidate search results</h1>
                </div>
                <div className="jobs-candidate-toolbar">
                  <label>
                    <SearchRoundedIcon />
                    <input value={candidateQuery} readOnly placeholder="Search query" />
                  </label>
                  <Link to="/services/jobs/post" className="private-primary-button">Create new job</Link>
                </div>
                {candidateSearchLoading ? (
                  <div className="jobs-candidate-loading">Loading candidates...</div>
                ) : candidateSearchError ? (
                  <div className="workspace-empty">
                    <SearchRoundedIcon />
                    <h2>Could not load candidates</h2>
                    <p>{candidateSearchError}</p>
                  </div>
                ) : candidateSearchResults.length === 0 ? (
                  <div className="workspace-empty">
                    <SearchRoundedIcon />
                    <h2>No candidates found</h2>
                    <p>Try adjusting your search criteria.</p>
                  </div>
                ) : (
                  <div className="jobs-candidate-search-results">
                    {candidateSearchResults.map(candidate => (
                      <CandidateCard key={candidate.userId} candidate={candidate} />
                    ))}
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="jobs-candidates-title">
                  <h1>Candidates</h1>
                </div>
                <nav className="jobs-candidate-tabs" aria-label="Candidate stages">
                  {(["All", ...candidateStages] as Array<"All" | (typeof candidateStages)[number]>).map(stage => {
                    const count =
                      stage === "All"
                        ? employerApplications.length
                        : employerApplications.filter(item => candidateStageForStatus(item.status) === stage).length;
                    return (
                      <button
                        type="button"
                        key={stage}
                        className={candidateStageFilter === stage ? "active" : ""}
                        onClick={() => setCandidateStageFilter(stage)}
                      >
                        <span>{stage}</span>
                        <b>{count}</b>
                      </button>
                    );
                  })}
                </nav>
                <div className="jobs-candidate-toolbar">
                  <label>
                    <SearchRoundedIcon />
                    <input value={candidateQuery} onChange={event => setCandidateQuery(event.target.value)} placeholder="Search candidates, jobs, skills, location" />
                  </label>
                  <select value={candidateStageFilter} onChange={event => setCandidateStageFilter(event.target.value as typeof candidateStageFilter)}>
                    <option value="All">All stages</option>
                    {candidateStages.map(stage => <option key={stage}>{stage}</option>)}
                  </select>
                  <div className="jobs-candidate-view-toggle">
                    <button type="button" className={candidateView === "pipeline" ? "active" : ""} onClick={() => setCandidateView("pipeline")}>Pipeline</button>
                    <button type="button" className={candidateView === "list" ? "active" : ""} onClick={() => setCandidateView("list")}>List</button>
                  </div>
                  <Link to="/services/jobs/post" className="private-primary-button">Create new job</Link>
                </div>
                {candidateView === "pipeline" ? (
                  <div className="jobs-candidate-pipeline">
                    {candidateStages.map(stage => (
                      <section key={stage}>
                        <h2>{stage} <span>{filteredCandidates.filter(item => candidateStageForStatus(item.status) === stage).length}</span></h2>
                        {filteredCandidates.filter(item => candidateStageForStatus(item.status) === stage).map(application => (
                          <button type="button" key={application.id} onClick={() => { setSelectedCandidate(application); setCandidateDrawerTab("Profile"); }}>
                            {renderCandidateAvatar(application)}
                            <span>
                              <b>{application.profileSnapshot?.title || "Candidate"}</b>
                              <small>{application.jobTitle}</small>
                              <small>{application.profileSnapshot?.location || application.company}</small>
                            </span>
                          </button>
                        ))}
                      </section>
                    ))}
                  </div>
                ) : (
                  <div className="jobs-candidate-list">
                    {filteredCandidates.map(application => (
                      <button type="button" key={application.id} onClick={() => { setSelectedCandidate(application); setCandidateDrawerTab("Profile"); }}>
                        {renderCandidateAvatar(application)}
                        <span className="jobs-candidate-list-identity"><b>{application.profileSnapshot?.title || "Candidate"}</b><small>{application.profileSnapshot?.location || "Location not added"}</small></span>
                        <span className="jobs-candidate-list-job">{application.jobTitle}</span>
                        <b className="jobs-candidate-list-stage">{candidateStageForStatus(application.status)}</b>
                      </button>
                    ))}
                  </div>
                )}
                {!filteredCandidates.length ? <div className="workspace-empty"><SearchRoundedIcon /><h2>No candidates found</h2><p>Try another search or stage filter.</p></div> : null}
                {selectedCandidate ? (
                  <aside className="jobs-candidate-drawer" role="dialog" aria-modal="true" aria-label="Candidate profile">
                    <button type="button" aria-label="Close candidate profile" onClick={() => setSelectedCandidate(null)}>x</button>
                    <header>
                      {renderCandidateAvatar(selectedCandidate)}
                      <div>
                        <h2>{selectedCandidate.profileSnapshot?.title || "Candidate profile"}</h2>
                      <p>{selectedCandidate.jobTitle} · {candidateStageForStatus(selectedCandidate.status)}</p>
                      </div>
                    </header>
                    <nav>
                      {candidateDrawerTabs.map(tab => <button type="button" key={tab} className={candidateDrawerTab === tab ? "active" : ""} onClick={() => setCandidateDrawerTab(tab)}>{tab}</button>)}
                    </nav>
                    <section>
                      {candidateDrawerTab === "Profile" ? (
                        <div className="jobs-candidate-profile-grid">
                          <article><span>Professional title</span><b>{selectedCandidate.profileSnapshot?.title || "Not added"}</b></article>
                          <article><span>Location</span><b>{selectedCandidate.profileSnapshot?.location || "Not added"}</b></article>
                          <article><span>Availability</span><b>{selectedCandidate.profileSnapshot?.availability || "Not added"}</b></article>
                          <article>
                            <span>Skills</span>
                            <b>
                              {Array.isArray(selectedCandidate.profileSnapshot?.skills)
                                ? selectedCandidate.profileSnapshot?.skills.join(", ")
                                : selectedCandidate.profileSnapshot?.skills || "Not added"}
                            </b>
                          </article>
                          <article className="wide"><span>Summary</span><p>{selectedCandidate.profileSnapshot?.summary || "No professional summary added."}</p></article>
                        </div>
                      ) : null}
                      {candidateDrawerTab === "Application" ? (
                        <div className="jobs-candidate-profile-grid">
                          <article><span>Applied for</span><b>{selectedCandidate.jobTitle}</b></article>
                          <article>
                            <span>Status</span>
                            <select
                              aria-label={`Status for ${selectedCandidate.jobTitle}`}
                              value={selectedCandidate.status}
                              onChange={event => void changeApplicationStatus(selectedCandidate.id, event.target.value)}
                            >
                              <option value="submitted">submitted</option>
                              <option value="reviewing">reviewing</option>
                              <option value="shortlisted">shortlisted</option>
                              <option value="rejected">rejected</option>
                              <option value="hired">hired</option>
                            </select>
                          </article>
                          <article><span>Company</span><b>{selectedCandidate.company}</b></article>
                          <article><span>Applied on</span><b>{new Date(selectedCandidate.createdAt).toLocaleDateString()}</b></article>
                          <article className="wide"><span>Cover note</span><p>{selectedCandidate.coverNote || "No cover note was provided."}</p></article>
                        </div>
                      ) : null}
                      {candidateDrawerTab === "Messages" ? (
                        <div className="jobs-candidate-message-start">
                          <p>Start a private Jobs conversation about this application.</p>
                          <button type="button" onClick={() => void startEmployerConversation(selectedCandidate)}>Message candidate</button>
                        </div>
                      ) : null}
                      {candidateDrawerTab === "Interviews" ? (
                        <div className="jobs-candidate-interviews">
                          {(selectedCandidate.interviews || []).length ? (
                            <ul>
                              {selectedCandidate.interviews!.map((interview: JobsApiInterview) => (
                                <li key={interview.id}>
                                  <div>
                                    <b>{new Date(interview.scheduledAt).toLocaleString()}</b>
                                    {interview.note ? <p>{interview.note}</p> : null}
                                  </div>
                                  <button type="button" onClick={() => void cancelCandidateInterview(interview.id)}>Cancel</button>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p>No interviews scheduled.</p>
                          )}
                          <div className="jobs-schedule-interview">
                            <label>
                              Date and time
                              <input
                                type="datetime-local"
                                value={interviewDateDraft}
                                onChange={event => setInterviewDateDraft(event.target.value)}
                              />
                            </label>
                            <label>
                              Note (optional)
                              <input
                                value={interviewNoteDraft}
                                onChange={event => setInterviewNoteDraft(event.target.value)}
                                placeholder="Video call, location, or agenda"
                              />
                            </label>
                            <button
                              type="button"
                              disabled={!interviewDateDraft || interviewSubmitting}
                              onClick={() => void scheduleCandidateInterview()}
                            >
                              {interviewSubmitting ? "Scheduling…" : "Schedule interview"}
                            </button>
                          </div>
                        </div>
                      ) : null}
                      {candidateDrawerTab === "Notes" ? (
                        <div className="jobs-candidate-notes">
                          <textarea
                            value={candidateNotesDraft}
                            onChange={event => setCandidateNotesDraft(event.target.value)}
                            placeholder="Private notes for your hiring team"
                            rows={6}
                          />
                          <button type="button" disabled={candidateNotesSaving} onClick={() => void saveCandidateNotes()}>
                            {candidateNotesSaving ? "Saving…" : "Save notes"}
                          </button>
                        </div>
                      ) : null}
                      {candidateDrawerTab === "Activity" ? <p>Applied on {new Date(selectedCandidate.createdAt).toLocaleDateString()} with status {selectedCandidate.status}.</p> : null}
                    </section>
                  </aside>
                ) : null}
              </>
            )}
          </section>
        ) : kind === "my-earnings" ? (
          <section className="jobs-earnings-page">
            <header className="jobs-page-heading">
              <span className="jobs-kicker">JOB SEEKER EARNINGS</span>
              <h1>My Earnings</h1>
              <p>Compensation from jobs you have been hired for through SMAJ Jobs.</p>
            </header>
            {earningsLoading ? (
              <p className="jobs-status" role="status">Loading earnings…</p>
            ) : earningsSummary ? (
              <>
                <div className="jobs-earnings-summary">
                  <article>
                    <strong>{formatJobsPi(earningsSummary.totalEarnedPi)}</strong>
                    <span>Agreed compensation</span>
                  </article>
                  <article>
                    <strong>{formatJobsPi(earningsSummary.pendingEarningsPi)}</strong>
                    <span>Pending earnings</span>
                  </article>
                  <article>
                    <strong>{formatJobsPi(earningsSummary.completedPaymentsPi)}</strong>
                    <span>Completed payments</span>
                  </article>
                  <article>
                    <strong>{earningsSummary.hiredCount}</strong>
                    <span>Hired positions</span>
                  </article>
                </div>
                <div className="jobs-page-heading" style={{ marginTop: 32 }}>
                  <h2>Payment history</h2>
                  <small>GCV reference: {PI_USDT_RATE.toLocaleString()} USDT per Pi</small>
                </div>
                {earnings.length ? (
                  <div className="jobs-earnings-list">
                    {earnings.map(item => (
                      <article key={item.applicationId} className={`jobs-earning-card ${item.status === "hired" ? "hired" : "pending"}`}>
                        <div className="jobs-earning-main">
                          <h3>{item.jobTitle}</h3>
                          <p>{item.company} · {item.period}</p>
                          <small>Applied {formatJobDate(item.createdAt)}</small>
                        </div>
                        <div className="jobs-earning-amount">
                          <strong>{formatJobsPi(item.completedPaymentsPi)}</strong>
                          <span>{item.pendingPaymentsPi > 0 ? `${formatJobsPi(item.pendingPaymentsPi)} awaiting confirmation` : "Confirmed earnings"}</span>
                          <small>Offer: {formatJobsPi(item.agreedCompensationPi)} / {item.period}</small>
                        </div>
                        {item.payments?.length ? (
                          <div className="jobs-salary-records">
                            {item.payments.map(payment => (
                              <article key={payment.paymentRecordId} className="jobs-salary-record">
                                <div>
                                  <strong>{formatJobsPi(payment.amountPi)}</strong>
                                  <span>{payment.status.replaceAll("_", " ")}</span>
                                  <small>Transaction: {payment.txid}</small>
                                  <small>{formatJobDate(payment.createdAt)}</small>
                                </div>
                                {payment.status === "awaiting_candidate_confirmation" ? (
                                  <div className="jobs-salary-actions">
                                    <button type="button" onClick={() => void respondToSalaryPayment(item, payment.paymentRecordId, "confirmed")}>Confirm received</button>
                                    <button type="button" className="secondary" onClick={() => void respondToSalaryPayment(item, payment.paymentRecordId, "disputed")}>Dispute</button>
                                  </div>
                                ) : null}
                              </article>
                            ))}
                          </div>
                        ) : <p className="jobs-salary-empty">No salary transaction has been recorded yet.</p>}
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="workspace-empty jobs-earnings-empty">
                    <WorkOutlineRoundedIcon />
                    <h2>No earnings yet</h2>
                    <p>Apply to jobs and get hired to see your compensation history here.</p>
                    <Link to="/services/jobs/search">Find jobs</Link>
                  </div>
                )}
              </>
            ) : (
              <div className="workspace-empty jobs-earnings-empty">
                <WorkOutlineRoundedIcon />
                <h2>No earnings data</h2>
                <p>Earnings from hired positions will appear here.</p>
              </div>
            )}
          </section>
        ) : kind === "payments-billing" ? (
          <section className="jobs-payments-page">
            <header className="jobs-page-heading">
              <span className="jobs-kicker">EMPLOYER PAYMENTS</span>
              <h1>Payments & Billing</h1>
              <p>Manage Pi payments for SMAJ Jobs employer plans and services.</p>
            </header>
            {employerPaymentsLoading ? (
              <p className="jobs-status" role="status">Loading payments…</p>
            ) : employerPaymentsSummary ? (
              <>
                <div className="jobs-payments-summary">
                  <article>
                    <strong>{formatJobsPi(employerPaymentsSummary.total)}</strong>
                    <span>Total paid</span>
                  </article>
                  <article>
                    <strong>{formatJobsPi(employerPaymentsSummary.pending)}</strong>
                    <span>Pending payments</span>
                  </article>
                  <article>
                    <strong>{formatJobsPi(employerPaymentsSummary.paid)}</strong>
                    <span>Completed payments</span>
                  </article>
                  <article>
                    <strong>{formatJobsPi(employerPaymentsSummary.cancelled)}</strong>
                    <span>Cancelled</span>
                  </article>
                </div>
                <div className="jobs-page-heading" style={{ marginTop: 32 }}>
                  <h2>Payment history</h2>
                  <small>GCV reference: {PI_USDT_RATE.toLocaleString()} USDT per Pi</small>
                </div>
                {employerPayments.length ? (
                  <div className="jobs-payments-list">
                    {employerPayments.map(payment => (
                      <article key={payment.billingId} className={`jobs-payment-card ${payment.status}`}>
                        <div className="jobs-payment-main">
                          <h3>{payment.planName}</h3>
                          <p>{payment.jobId ? `Job: ${payment.jobId}` : "Employer plan"}</p>
                          <small>Created {formatJobDateTime(payment.createdAt)}</small>
                          {payment.paidAt ? <small>Paid {formatJobDateTime(payment.paidAt)}</small> : null}
                        </div>
                        <div className="jobs-payment-meta">
                          <div className="jobs-payment-amount">
                            <strong>{formatJobsPi(payment.amountPi)}</strong>
                            <span>{formatUsdAmount(payment.amountUsdt)}</span>
                          </div>
                          <div className={`jobs-payment-status jobs-status-badge ${payment.status}`}>
                            {payment.status}
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="workspace-empty jobs-payments-empty">
                    <WorkOutlineRoundedIcon />
                    <h2>No payments yet</h2>
                    <p>Payments for employer plans and job promotions will appear here.</p>
                    <Link to="/services/jobs/post">Post a job</Link>
                  </div>
                )}
              </>
            ) : (
              <div className="workspace-empty jobs-payments-empty">
                <WorkOutlineRoundedIcon />
                <h2>No payment data</h2>
                <p>Authorized Pi payments through SMAJ Jobs will be recorded here.</p>
              </div>
            )}
          </section>
        ) : kind === "saved" || kind === "applications" ? (
          <section className="jobs-my-jobs-page">
            <header className="jobs-my-jobs-header">
              <nav aria-label="My jobs sections">
                {[
                  ["saved", "Saved", savedJobs.length, "/services/jobs/saved"],
                  ["applied", "Applied", activeApplications.length, "/services/jobs/applications"],
                  ["interviews", "Interviews", 0, "/services/jobs/saved?tab=interviews"],
                  ["archived", "Archived", archivedApplications.length, "/services/jobs/saved?tab=archived"],
                ].map(([tab, label, count, to]) => (
                  <Link key={String(tab)} to={String(to)} className={myJobsTab === tab ? "active" : ""}>
                    <span>{label}</span>
                    {tab !== "archived" ? <b>{count}</b> : null}
                  </Link>
                ))}
              </nav>
            </header>
            {myJobsTab === "saved" ? (
              savedJobs.length ? (
                <div className="jobs-my-jobs-list">
                  {savedJobs.map(job => (
                    <article key={job.id} className="jobs-my-job-card">
                      <button type="button" className="jobs-my-job-menu" aria-label={`Manage ${job.title}`}>
                        ⋮
                      </button>
                      <h2>{job.title}</h2>
                      <p>{job.company}</p>
                      <p>{job.location}</p>
                      <small>Saved to SMAJ PI HUB Jobs</small>
                      <Link to={`/services/jobs/job/${job.id}`}>View job</Link>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="jobs-my-jobs-empty saved">
                  <div className="jobs-empty-illustration saved" aria-hidden="true">
                    <span />
                    <i />
                  </div>
                  <h2>No saved jobs yet</h2>
                  <p>Track jobs you're interested in by saving them. Your saved jobs will appear here.</p>
                  <Link to="/services/jobs/search">Find jobs <ArrowForwardRoundedIcon /></Link>
                  <button type="button">Not seeing a job?</button>
                </div>
              )
            ) : myJobsTab === "applied" ? (
              <div className="jobs-my-jobs-list">
                <h2>Past 14 days</h2>
                {activeApplications.map(application => {
                  const applicationUi = getCandidateApplicationUi(application.status);
                  return (
                    <article key={application.id} className="jobs-my-job-card applied">
                      <div className="jobs-application-status-line">
                        {!readApplicationUpdates.has(applicationUpdateKey(application)) ? (
                          <span className="jobs-my-job-dot" aria-label="New application update" />
                        ) : null}
                        <span className={`jobs-status-badge ${applicationUi.tone}`}>{applicationUi.badge}</span>
                      </div>
                      <button
                        type="button"
                        className="jobs-my-job-menu"
                        aria-label={`Manage ${application.jobTitle}`}
                        onClick={() => {
                          markApplicationUpdateRead(application);
                          setManagedJobApplication(application);
                        }}
                      >
                        ⋮
                      </button>
                      <h2>{application.jobTitle}</h2>
                      <p>{application.company}</p>
                      <p>{application.profileSnapshot?.location || "Abu Dhabi"}</p>
                      <small>Applied on SMAJ PI HUB Jobs on {new Date(application.createdAt).toLocaleDateString()}</small>
                      {application.offer?.status === "sent" ? (
                        <div className="jobs-application-update-card jobs-offer-response">
                          <p><b>Offer received:</b> {formatJobsPi(application.offer.amountPi)} / {application.offer.period}</p>
                          {application.offer.terms ? <p>{application.offer.terms}</p> : null}
                          <button type="button" onClick={() => void respondToCandidateOffer(application, "accepted")}>Accept offer</button>
                          <button type="button" onClick={() => void respondToCandidateOffer(application, "declined")}>Decline</button>
                        </div>
                      ) : null}
                      {applicationUi.action === "status" ? (
                        <button type="button" className="jobs-update-status-button">Update status</button>
                      ) : null}
                      {applicationUi.action === "updates" ? (
                        <div className="jobs-application-update-card">
                          <button type="button" aria-label="Dismiss update prompt">×</button>
                          <p>Any updates since you applied?</p>
                          <button type="button">I'm interviewing</button>
                          <button type="button">I have another update</button>
                        </div>
                      ) : null}
                    </article>
                  );
                })}
                {!activeApplications.length ? (
                  <div className="jobs-my-jobs-empty">
                    <h2>No applications yet</h2>
                    <p>Jobs you apply for will appear here.</p>
                    <Link to="/services/jobs/search">Find jobs <ArrowForwardRoundedIcon /></Link>
                  </div>
                ) : null}
              </div>
            ) : myJobsTab === "interviews" ? (
              <div className="jobs-my-jobs-empty interviews">
                <div className="jobs-empty-illustration calendar" aria-hidden="true">
                  <span />
                  <i />
                </div>
                <h2>No upcoming interviews</h2>
                <p>Your scheduled interviews will appear here.</p>
                <button type="button">Not seeing an interview?</button>
              </div>
            ) : archivedApplications.length ? (
              <div className="jobs-my-jobs-list">
                {archivedApplications.map(application => (
                  <article key={application.id} className="jobs-my-job-card applied">
                    <span className="jobs-status-badge archived">Archived</span>
                    <h2>{application.jobTitle}</h2>
                    <p>{application.company}</p>
                    <small>Archived from your active applications</small>
                    <Link to={`/services/jobs/job/${application.jobId}`}>View job</Link>
                  </article>
                ))}
              </div>
            ) : (
              <div className="jobs-my-jobs-empty archived">
                <div className="jobs-empty-illustration archived" aria-hidden="true"><span /><i /></div>
                <h2>No archived applications</h2>
                <p>Applications you archive will appear here.</p>
              </div>
            )}
            {managedJobApplication ? (
              <div className="jobs-bottom-sheet-backdrop" role="presentation" onClick={() => setManagedJobApplication(null)}>
                <section
                  className="jobs-bottom-sheet"
                  role="dialog"
                  aria-modal="true"
                  aria-label="Manage this job"
                  onClick={event => event.stopPropagation()}
                >
                  <header>
                    <h2>Manage this job</h2>
                    <button type="button" aria-label="Close manage job" onClick={() => setManagedJobApplication(null)}>
                      ×
                    </button>
                  </header>
                  <button
                    type="button"
                    onClick={() => {
                      const jobId = managedJobApplication.jobId;
                      setManagedJobApplication(null);
                      navigate(`/services/jobs/job/${jobId}`);
                    }}
                  >
                    <WorkOutlineRoundedIcon />
                    <span>View and Manage Details</span>
                  </button>
                  <button type="button" onClick={() => void archiveCandidateApplication(managedJobApplication)}>
                    <ArchiveOutlinedIcon />
                    <span>Archive</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setWithdrawJobApplication(managedJobApplication);
                      setManagedJobApplication(null);
                    }}
                  >
                    <RemoveCircleOutlineRoundedIcon />
                    <span>Withdraw application</span>
                  </button>
                </section>
              </div>
            ) : null}
            {withdrawJobApplication ? (
              <div className="jobs-bottom-sheet-backdrop" role="presentation" onClick={() => setWithdrawJobApplication(null)}>
                <section
                  className="jobs-bottom-sheet jobs-withdraw-sheet"
                  role="dialog"
                  aria-modal="true"
                  aria-label="Withdraw your application"
                  onClick={event => event.stopPropagation()}
                >
                  <header>
                    <h2>Withdraw your application</h2>
                    <button type="button" aria-label="Close withdraw application" onClick={() => setWithdrawJobApplication(null)}>
                      ×
                    </button>
                  </header>
                  <div>
                    <h3>{withdrawJobApplication.jobTitle}</h3>
                    <p>{withdrawJobApplication.profileSnapshot?.location || "Abu Dhabi"}</p>
                  </div>
                  <button
                    type="button"
                    className="danger"
                    onClick={() => void withdrawCandidateApplication(withdrawJobApplication)}
                  >
                    Withdraw application
                  </button>
                  <button type="button" onClick={() => setWithdrawJobApplication(null)}>
                    Keep this application
                  </button>
                </section>
              </div>
            ) : null}
          </section>
        ) : kind === "post" || kind === "profile" || kind === "employer" ? (
          <section className="jobs-workspace">
            {kind !== "profile" && kind !== "post" ? <div className="jobs-page-heading">
              <span className="jobs-kicker">YOUR JOBS WORKSPACE</span>
              <h1>
                {kind === "employer"
                      ? "Employer dashboard"
                      : "Applications"}
              </h1>
              <p>Everything you need to manage your next step in the Pi economy.</p>
            </div> : null}
            {kind === "post" && postStep === "contact" ? (
              <form
                className="jobs-employer-contact-form"
                onSubmit={event => {
                  event.preventDefault();
                  void submitContactStep(event.currentTarget);
                }}
              >
                <button type="button" className="jobs-step-back" onClick={() => navigate("/services/jobs/employer")}>
                  <ArrowBackRoundedIcon /> Back
                </button>
                <header>
                  <h2>Company Info</h2>
                  <p>Tell us about your company and the primary contact for this posting.</p>
                </header>
                <label>
                  Company name *
                  <input name="companyName" required minLength={2} maxLength={120} />
                </label>
                <label>
                  Company website (optional)
                  <input name="companyWebsite" type="url" placeholder="https://www.example.com" />
                </label>
                <label>
                  First name *
                  <input
                    name="firstName"
                    required
                    defaultValue={(user?.displayName || "").split(" ")[0]?.toUpperCase()}
                  />
                </label>
                <label>
                  Last name *
                  <input
                    name="lastName"
                    required
                    defaultValue={(user?.displayName || "").split(" ").slice(1).join(" ").toUpperCase()}
                  />
                </label>
                <label>
                  Phone number
                  <small>For account management communication. Not visible to job seekers.</small>
                  <span className="jobs-phone-input">
                    <select name="phoneCountry" defaultValue="+234" aria-label="Phone country code">
                      {JOB_PHONE_CODES.map(entry => (
                        <option key={entry.code} value={entry.dialCode}>
                          {entry.code} {entry.dialCode}
                        </option>
                      ))}
                    </select>
                    <input name="phoneNumber" type="tel" placeholder="806-161-7175" defaultValue={user?.contactPhone} />
                  </span>
                </label>
                <label>
                  How did you hear about us?
                  <select name="referralSource" defaultValue="">
                    <option value="" disabled>
                      Select an option
                    </option>
                    <option>Pi Network community</option>
                    <option>SMAJ PI HUB</option>
                    <option>Friend or colleague</option>
                    <option>Social media</option>
                    <option>Search engine</option>
                  </select>
                </label>
                <label className="jobs-employer-consent">
                  <input type="checkbox" name="marketingConsent" />
                  <span>
                    By clicking this box and providing your telephone or wireless number, you agree to receive marketing
                    and informational calls and texts from SMAJ PI HUB Jobs at the telephone or wireless number
                    provided. Your agreement to this is not required to obtain any product or service.
                  </span>
                </label>
                <footer>
                  <button type="submit" disabled={!isStepValid || contactSubmitting} aria-busy={contactSubmitting}>
                    {contactSubmitting ? "Saving…" : <>Continue <ArrowForwardRoundedIcon /></>}
                  </button>
                </footer>
              </form>
            ) : kind === "post" && postStep === "title" ? (
              <form
                className="jobs-employer-title-form"
                onSubmit={event => {
                  event.preventDefault();
                  if (postJobTitle.trim()) setPostStep("location");
                }}
              >
                {previousStep(postStep) ? <button type="button" className="jobs-step-back" onClick={() => setPostStep(previousStep(postStep)!)}>← Back</button> : null}
                <header>
                  <h2>Job title *</h2>
                  <p>
                    Job post will be in{" "}
                    <select
                      className="jobs-title-inline-select"
                      value={postLanguage}
                      onChange={event => setPostLanguage(event.target.value)}
                      aria-label="Job post language"
                    >
                      {JOB_LANGUAGES.map(language => (
                        <option key={language} value={language}>
                          {language}
                        </option>
                      ))}
                    </select>{" "}
                    in
                  </p>
                  <select
                    className="jobs-title-inline-select jobs-title-region-select"
                    value={postPostingRegion}
                    onChange={event => setPostPostingRegion(event.target.value)}
                    aria-label="Job post region"
                  >
                    {JOB_COUNTRIES.map(country => (
                      <option key={country.code} value={country.name}>
                        {country.name}
                      </option>
                    ))}
                  </select>
                </header>
                <label>
                  Job title *
                  <div className="jobs-title-suggest-wrap">
                    {filteredEmployerJobTitles.length ? (
                      <div className="jobs-title-suggestions">
                        {filteredEmployerJobTitles.map(title => (
                          <button type="button" key={title} onClick={() => setPostJobTitle(title)}>
                            {title}
                          </button>
                        ))}
                      </div>
                    ) : null}
                    <input
                      name="jobTitle"
                      required
                      autoFocus
                      value={postJobTitle}
                      onChange={event => setPostJobTitle(event.target.value)}
                      autoComplete="off"
                    />
                  </div>
                </label>
                <footer>
                  <button type="button" onClick={() => setPostStep("contact")}>← Back</button>
                  <button type="submit" disabled={!isStepValid}>
                    Continue <ArrowForwardRoundedIcon />
                  </button>
                </footer>
              </form>
            ) : kind === "post" && postStep === "location" ? (
              <form
                className="jobs-employer-location-form"
                onSubmit={event => {
                  event.preventDefault();
                  if (postCountry.trim()) setPostStep("hires");
                }}
              >
                {previousStep(postStep) ? <button type="button" className="jobs-step-back" onClick={() => setPostStep(previousStep(postStep)!)}>← Back</button> : null}
                <h2>Location type *</h2>
                <div className="jobs-location-type-options" role="radiogroup" aria-label="Location type">
                  {employerLocationTypes.map(option => (
                    <button
                      type="button"
                      key={option.id}
                      className={postLocationType === option.id ? "active" : ""}
                      onClick={() => setPostLocationType(option.id)}
                      role="radio"
                      aria-checked={postLocationType === option.id}
                    >
                      <span className={`jobs-location-type-icon ${option.icon}`} aria-hidden="true" />
                      <span>
                        <b>{option.title}</b>
                        <small>{option.detail}</small>
                      </span>
                    </button>
                  ))}
                </div>
                <footer>
                  <button type="button" onClick={() => setPostStep("title")}>
                    ← Back
                  </button>
                  <button type="submit" disabled={!isStepValid}>
                    Continue <ArrowForwardRoundedIcon />
                  </button>
                </footer>
              </form>
            ) : kind === "post" && postStep === "hires" ? (
              <form className="jobs-employer-step-form jobs-hires-step" onSubmit={event => { event.preventDefault(); setPostStep("timeframe"); }}>
                {previousStep(postStep) ? <button type="button" className="jobs-step-back" onClick={() => setPostStep(previousStep(postStep)!)}>← Back</button> : null}
                <h2>Number of hires *</h2>
                <div className="jobs-hires-control">
                  <button type="button" aria-label="Decrease hires" onClick={() => setPostHires(value => Math.max(0, value - 1))}>-</button>
                  <input value={postHires} onChange={event => setPostHires(Math.max(0, Number(event.target.value) || 0))} inputMode="numeric" aria-label="Number of hires" />
                  <button type="button" aria-label="Increase hires" onClick={() => setPostHires(value => value + 1)}>+</button>
                </div>
                <footer><button type="button" onClick={() => setPostStep("location")}>← Back</button><button type="submit" disabled={!isStepValid}>Continue <ArrowForwardRoundedIcon /></button></footer>
              </form>
            ) : kind === "post" && postStep === "timeframe" ? (
              <form className="jobs-employer-step-form" onSubmit={event => { event.preventDefault(); setPostStep("type"); }}>
                {previousStep(postStep) ? <button type="button" className="jobs-step-back" onClick={() => setPostStep(previousStep(postStep)!)}>← Back</button> : null}
                <h2>Hiring timeframe *</h2>
                <div className="jobs-post-option-stack">
                  {hiringTimeframes.map(item => (
                    <button type="button" key={item} className={postHiringTimeframe === item ? "active" : ""} onClick={() => setPostHiringTimeframe(item)}>
                      <b>{item}</b>
                    </button>
                  ))}
                </div>
                <footer><button type="button" onClick={() => setPostStep("hires")}>← Back</button><button type="submit" disabled={!isStepValid}>Continue <ArrowForwardRoundedIcon /></button></footer>
              </form>
            ) : kind === "post" && postStep === "type" ? (
              <form className="jobs-employer-step-form" onSubmit={event => { event.preventDefault(); setPostStep("salary"); }}>
                {previousStep(postStep) ? <button type="button" className="jobs-step-back" onClick={() => setPostStep(previousStep(postStep)!)}>← Back</button> : null}
                <h2>Job type *</h2>
                <div className="jobs-post-option-stack">
                  {employerJobTypes.map(item => (
                    <button type="button" key={item} className={postJobType === item ? "active" : ""} onClick={() => setPostJobType(item)}>
                      <span>+ {item}</span>
                    </button>
                  ))}
                </div>
                <footer><button type="button" onClick={() => setPostStep("timeframe")}>← Back</button><button type="submit" disabled={!isStepValid}>Continue <ArrowForwardRoundedIcon /></button></footer>
              </form>
            ) : kind === "post" && postStep === "salary" ? (
              <form className="jobs-employer-step-form jobs-salary-step" onSubmit={event => { event.preventDefault(); setPostStep("benefits"); }}>
                {previousStep(postStep) ? <button type="button" className="jobs-step-back" onClick={() => setPostStep(previousStep(postStep)!)}>← Back</button> : null}
                <h2>Salary *</h2>
                <section>
                  <h3>Pay</h3>
                  <p>Review the pay we estimated for your job and adjust as needed. Check your local minimum wage.</p>
                  <label>
                    Show pay by
                    <select
                      className="jobs-pay-type-select"
                      value={postPayType}
                      onChange={event => setPostPayType(event.target.value as typeof postPayType)}
                      aria-label="Show pay by"
                    >
                      <option value="range">Range</option>
                      <option value="starting">Starting amount</option>
                      <option value="maximum">Maximum amount</option>
                      <option value="exact">Exact amount</option>
                    </select>
                  </label>
                  {postPayType === "range" ? (
                    <div className="jobs-salary-inputs">
                      <label>Minimum<input value={payMin} onChange={event => setPayMin(event.target.value)} placeholder="$ 25.71" inputMode="decimal" /></label>
                      <span>to</span>
                      <label>Maximum<input value={payMax} onChange={event => setPayMax(event.target.value)} placeholder="$ 30.96" inputMode="decimal" /></label>
                    </div>
                  ) : postPayType === "starting" ? (
                    <label>Starting amount<input value={payMin} onChange={event => setPayMin(event.target.value)} placeholder="$ 25.71" inputMode="decimal" /></label>
                  ) : postPayType === "maximum" ? (
                    <label>Maximum amount<input value={payMax} onChange={event => setPayMax(event.target.value)} placeholder="$ 30.96" inputMode="decimal" /></label>
                  ) : (
                    <label>Exact amount<input value={payMin} onChange={event => setPayMin(event.target.value)} placeholder="$ 25.71" inputMode="decimal" /></label>
                  )}
                  {Number(payMin) > 0 ? (
                    <output className="jobs-salary-pi-output">
                      {formatUsdAmount(Number(payMin))}
                      {Number(payMax) > Number(payMin) ? `–${formatUsdAmount(Number(payMax))}` : ""} ={" "}
                      {formatPiAmount(piFromUsdt(Number(payMin)))}
                      {Number(payMax) > Number(payMin) ? `–${formatPiAmount(piFromUsdt(Number(payMax)))}` : ""}
                    </output>
                  ) : null}
                  <label>
                    Rate
                    <select
                      className="jobs-rate-select"
                      value={postCompensationPeriod}
                      onChange={event => setPostCompensationPeriod(event.target.value as typeof postCompensationPeriod)}
                      aria-label="Pay rate"
                    >
                      <option value="hour">per hour</option>
                      <option value="day">per day</option>
                      <option value="week">per week</option>
                      <option value="month">per month</option>
                    </select>
                  </label>
                </section>
                <footer><button type="button" onClick={() => setPostStep("type")}>← Back</button><button type="submit" disabled={!isStepValid}>Continue <ArrowForwardRoundedIcon /></button></footer>
              </form>
            ) : kind === "post" && postStep === "benefits" ? (
              <form className="jobs-employer-step-form" onSubmit={event => { event.preventDefault(); setPostStep("skills"); }}>
                {previousStep(postStep) ? <button type="button" className="jobs-step-back" onClick={() => setPostStep(previousStep(postStep)!)}>← Back</button> : null}
                <h2>Benefits</h2>
                <div className="jobs-post-option-stack">
                  {(benefitsExpanded ? employerBenefits : employerBenefits.slice(0, 4)).map(item => (
                    <button type="button" key={item} className={postBenefits.includes(item) ? "active" : ""} onClick={() => setPostBenefits(current => current.includes(item) ? current.filter(value => value !== item) : [...current, item])}>
                      <span>+ {item}</span>
                    </button>
                  ))}
                </div>
                {!benefitsExpanded && employerBenefits.length > 4 ? (
                  <button className="jobs-show-more" type="button" onClick={() => setBenefitsExpanded(true)}>
                    Show {employerBenefits.length - 4} more⌄
                  </button>
                ) : null}
                <footer><button type="button" onClick={() => setPostStep("salary")}>← Back</button><button type="submit" disabled={!isStepValid}>Continue <ArrowForwardRoundedIcon /></button></footer>
              </form>
            ) : kind === "post" && postStep === "skills" ? (
              <form className="jobs-employer-step-form" onSubmit={event => { event.preventDefault(); setPostStep("description"); }}>
                {previousStep(postStep) ? <button type="button" className="jobs-step-back" onClick={() => setPostStep(previousStep(postStep)!)}>← Back</button> : null}
                <h2>Skills *</h2>
                <p>Add skills that match this role. Separate multiple skills with commas.</p>
                <label>
                  Required skills
                  <input
                    value={postSkills}
                    onChange={event => setPostSkills(event.target.value)}
                    placeholder="React, Research, Communication"
                    autoFocus
                  />
                </label>
                <footer>
                  <button type="button" onClick={() => setPostStep("benefits")}>← Back</button>
                  <button type="submit" disabled={!isStepValid}>Continue <ArrowForwardRoundedIcon /></button>
                </footer>
              </form>
            ) : kind === "post" && postStep === "description" ? (
              <form className="jobs-employer-step-form jobs-description-step" onSubmit={event => { event.preventDefault(); setPostStep("review"); }}>
                {previousStep(postStep) ? <button type="button" className="jobs-step-back" onClick={() => setPostStep(previousStep(postStep)!)}>← Back</button> : null}
                <h2>Job description *</h2>
                <p>This is a SMAJ PI HUB-assisted job description. You can edit or replace it.</p>
                <div className="jobs-description-editor">
                  <div>
                    <button type="button" aria-label="Bold" onClick={() => wrapDescriptionSelection("**")}>
                      <b>B</b>
                    </button>
                    <button type="button" aria-label="Italic" onClick={() => wrapDescriptionSelection("_")}>
                      <i>I</i>
                    </button>
                    <button type="button" aria-label="Bullet list" onClick={() => insertDescriptionListItem()}>
                      <span>☷</span>
                    </button>
                    <button
                      type="button"
                      aria-label="Formatting help"
                      aria-expanded={descriptionHelpOpen}
                      onClick={() => setDescriptionHelpOpen(value => !value)}
                    >
                      ?
                    </button>
                  </div>
                  {descriptionHelpOpen ? (
                    <p className="jobs-description-help">
                      Select text and use <b>B</b> for **bold**, <i>I</i> for _italic_, or the list icon to start a
                      bullet line with "- ". This plain-text formatting is shown to candidates as written.
                    </p>
                  ) : null}
                  <textarea
                    ref={descriptionTextareaRef}
                    required
                    value={postDescription}
                    onChange={event => setPostDescription(event.target.value)}
                    placeholder={`Overview\n\nJoin our dynamic team as a ${postJobTitle || "team member"} and help customers in the Pi economy.`}
                  />
                </div>
                <footer><button type="button" onClick={() => setPostStep("skills")}>← Back</button><button type="submit" disabled={!isStepValid}>Continue <ArrowForwardRoundedIcon /></button></footer>
              </form>
            ) : kind === "post" && postStep === "review" ? (
              <form className="jobs-employer-step-form jobs-review-step" onSubmit={event => { event.preventDefault(); setPostStep("sponsor"); }}>
                {previousStep(postStep) ? <button type="button" className="jobs-step-back" onClick={() => setPostStep(previousStep(postStep)!)}>← Back</button> : null}
                <h2>Review</h2>
                <p>By selecting Confirm, you agree that this job post reflects your requirements and will be submitted through SMAJ PI HUB Jobs.</p>
                <section>
                  <h3>Job details</h3>
                  {[
                    ["Company", companies.find(company => company.id === postCompanyId)?.name || "Select company", "details"],
                    ["Job title", postJobTitle, "title"],
                    ["Location type", selectedPostLocationType.title, "location"],
                    ["Work mode", selectedPostLocationType.mode, "location"],
                    ["Country", postCountry || "Set on the next screen", "details"],
                    ["Number of hires", String(postHires), "hires"],
                    ["Hiring timeframe", postHiringTimeframe, "timeframe"],
                    ["Job type", postJobType, "type"],
                    ["Salary", `${formatUsdAmount(Number(payMin) || 0)}${Number(payMax) > Number(payMin) ? `–${formatUsdAmount(Number(payMax))}` : ""} / ${postCompensationPeriod}`, "salary"],
                    ["Pi equivalent", `${formatPiAmount(piFromUsdt(Number(payMin) || 0))}${Number(payMax) > Number(payMin) ? `–${formatPiAmount(piFromUsdt(Number(payMax)))}` : ""}`, "salary"],
                    ["Benefits", postBenefits.join(", ") || "None selected", "benefits"],
                    ["Description", postDescription ? `${postDescription.slice(0, 80)}${postDescription.length > 80 ? "…" : ""}` : "Add description", "description"],
                    [
                      "Category",
                      (postCategory === "Other" ? postCustomCategory : postCategory) || "Set on the next screen",
                      "details",
                    ],
                    ["Skills", postSkills || "Set on the next screen", "details"],
                    ["Sponsor plan", postSponsorPlan === "none" ? "No sponsor plan" : postSponsorPlan, "sponsor"],
                  ].map(([label, value, step]) => (
                    <div key={label}><small>{label}</small><span>{value}</span><button type="button" onClick={() => setPostStep(step as typeof postStep)}>Edit</button></div>
                  ))}
                </section>
                <footer><button type="button" onClick={() => setPostStep("description")}>← Back</button><button type="submit" disabled={!isStepValid}>Confirm <ArrowForwardRoundedIcon /></button></footer>
              </form>
            ) : kind === "post" && postStep === "sponsor" ? (
              <form className="jobs-employer-step-form jobs-sponsor-step" onSubmit={event => { event.preventDefault(); setPostStep("details"); }}>
                {previousStep(postStep) ? <button type="button" className="jobs-step-back" onClick={() => setPostStep(previousStep(postStep)!)}>← Back</button> : null}
                <h2>Sponsor job</h2>
                <h3>Choose a plan</h3>
                <div className="jobs-sponsor-plans">
                  {sponsorPlans.map(plan => (
                    <button type="button" key={plan.id} className={postSponsorPlan === plan.id ? "active" : ""} onClick={() => setPostSponsorPlan(plan.id)}>
                      <b>{plan.title}</b><span>{plan.price}</span><small>{plan.detail}</small>
                    </button>
                  ))}
                </div>
                <button className="jobs-show-more" type="button">Switch to a custom budget</button>
                <label>Plan duration<select defaultValue="continuous"><option value="continuous">Runs continuously</option><option value="7">7 days</option><option value="30">30 days</option></select></label>
                <p><b>Max budget:</b> $675.00 per week</p>
                <button type="button" className="jobs-no-thanks" onClick={() => { setPostSponsorPlan("none"); setPostStep("details"); }}>No thanks</button>
                <footer><button type="button" onClick={() => setPostStep("review")}>← Back</button><button type="submit" disabled={!isStepValid}>Save and continue</button></footer>
              </form>
            ) : kind === "post" ? (
              <form className="job-form" onSubmit={event => void submitJob(event)}>
                {previousStep(postStep) ? <button type="button" className="jobs-step-back" onClick={() => setPostStep(previousStep(postStep)!)}>← Back</button> : null}
                <label>
                  Job title
                  <input
                    name="title"
                    required
                    placeholder="e.g. Product Designer"
                    value={postJobTitle}
                    onChange={event => setPostJobTitle(event.target.value)}
                  />
                </label>
                <label>
                  Company
                  <select
                    name="companyId"
                    required
                    value={postCompanyId}
                    onChange={event => setPostCompanyId(event.target.value)}
                  >
                    <option value="" disabled>
                      Select your approved company
                    </option>
                    {[...companies]
                      .sort((left, right) =>
                        left.name === "SMAJ PI HUB"
                          ? -1
                          : right.name === "SMAJ PI HUB"
                            ? 1
                            : left.name.localeCompare(right.name)
                      )
                      .map(company => (
                        <option
                          value={company.id}
                          key={company.id}
                          disabled={!employerCompanies.some(owned => owned.id === company.id)}
                        >
                          {company.name}
                        </option>
                      ))}
                    <option value="__add__">＋ Add another company</option>
                  </select>
                </label>
                {postCompanyId === "__add__" ? (
                  <div className="job-add-company">
                    <label>
                      Company name
                      <input name="newCompanyName" required minLength={2} maxLength={120} />
                    </label>
                    <label>
                      Industry
                      <input name="newCompanyField" required maxLength={100} />
                    </label>
                    <small>
                      Your company is saved immediately and added to this dropdown. Jobs remain under moderation.
                    </small>
                  </div>
                ) : null}
                <div>
                  <label>
                    Country or work location
                    <input
                      name="country"
                      required
                      list="job-country-options"
                      value={postCountry}
                      onChange={event => setPostCountry(event.target.value)}
                      placeholder="Search country"
                      autoComplete="off"
                    />
                    <datalist id="job-country-options">
                      <option value="🌐 Worldwide" />
                      <option value="🏠 Remote" />
                      {JOB_COUNTRIES.map(country => (
                        <option key={country.code} value={country.label} />
                      ))}
                    </datalist>
                  </label>
                  <label>
                    Job type
                    <select name="type" value={postJobType} onChange={event => setPostJobType(event.target.value)}>
                      {employerJobTypes.map(item => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Work mode
                    <select name="mode" defaultValue={selectedPostLocationType.mode}>
                      <option>Remote</option>
                      <option>Hybrid</option>
                      <option>On-site</option>
                    </select>
                  </label>
                </div>
                <div>
                  <label>
                    Category
                    <input
                      name="category"
                      required
                      list="job-category-options"
                      value={postCategory}
                      onChange={event => setPostCategory(event.target.value)}
                      placeholder="Search 100+ categories"
                      autoComplete="off"
                    />
                    <datalist id="job-category-options">
                      {JOB_CATEGORIES.map(item => (
                        <option value={item} key={item} />
                      ))}
                    </datalist>
                  </label>
                </div>
                {postCategory === "Other" ? (
                  <label>
                    Custom category
                    <input
                      name="customCategory"
                      required
                      minLength={2}
                      maxLength={80}
                      value={postCustomCategory}
                      onChange={event => setPostCustomCategory(event.target.value)}
                      placeholder="Type the job category"
                    />
                  </label>
                ) : null}
                <label>
                  Description
                  <textarea
                    name="summary"
                    required
                    minLength={30}
                    rows={6}
                    defaultValue={postDescription}
                    placeholder="Describe the opportunity, responsibilities and requirements"
                  />
                </label>
                <fieldset className="job-compensation">
                  <legend>Compensation</legend>
                  <p>
                    Enter the genuine real-world amount. Store conversion: 1 Pi = {PI_USDT_RATE.toLocaleString()} USDT.
                  </p>
                  <div>
                    <label>
                      Minimum (USDT)
                      <input
                        name="compensationMin"
                        type="number"
                        min="1"
                        step="0.01"
                        required
                        value={payMin}
                        onChange={event => setPayMin(event.target.value)}
                        placeholder="e.g. 25.71"
                      />
                    </label>
                    <label>
                      Maximum (USDT)
                      <input
                        name="compensationMax"
                        type="number"
                        min={payMin || "1"}
                        step="0.01"
                        value={payMax}
                        onChange={event => setPayMax(event.target.value)}
                        placeholder="e.g. 30.96"
                      />
                    </label>
                    <label>
                      Pay period
                      <select
                        name="compensationPeriod"
                        value={postCompensationPeriod}
                        onChange={event => setPostCompensationPeriod(event.target.value as typeof postCompensationPeriod)}
                      >
                        <option value="hour">Per hour</option>
                        <option value="day">Per day</option>
                        <option value="week">Per week</option>
                        <option value="month">Per month</option>
                        <option value="year">Per year</option>
                        <option value="project">Fixed project</option>
                      </select>
                    </label>
                  </div>
                  {Number(payMin) > 0 ? (
                    <output>
                      {formatUsdAmount(Number(payMin))}
                      {Number(payMax) > Number(payMin) ? `–${formatUsdAmount(Number(payMax))}` : ""} ={" "}
                      {formatPiAmount(piFromUsdt(Number(payMin)))}
                      {Number(payMax) > Number(payMin) ? `–${formatPiAmount(piFromUsdt(Number(payMax)))}` : ""}
                    </output>
                  ) : null}
                  <label className="job-pay-confirm">
                    <input name="compensationConfirmed" type="checkbox" required /> I confirm this compensation is
                    genuine and can be honored.
                  </label>
                </fieldset>
                <footer>
                  <button type="button" onClick={() => setPostStep("sponsor")} disabled={postSubmitting}>
                    ← Back
                  </button>
                  <button type="submit" disabled={postSubmitting} aria-busy={postSubmitting}>
                    {postSubmitting ? <><span className="jobs-submit-spinner" /> Publishing…</> : "Publish job"}
                  </button>
                </footer>
              </form>
            ) : kind === "profile" ? (
              <div className="jobs-profile-workspace">
                <section className="jobs-profile-overview">
                  <div className="jobs-profile-summary-card">
                    <span className="jobs-profile-avatar">
                      {currentAvatar ? <img src={currentAvatar} alt="" /> : (user?.displayName || "P")[0]}
                    </span>
                    <div className="jobs-profile-intro">
                      <h2>Hi {user?.displayName || user?.piUsername || user?.username || "Pioneer"} !</h2>
                      <p>
                        {profile?.employment?.[0]?.position || profile?.title || "Add your professional title"}
                        {profile?.employment?.[0]?.employer ? ` at ${profile.employment[0].employer}` : ""}
                      </p>
                      <span><LocationOnOutlinedIcon /> {profile?.location || user?.country || "Add your country"}</span>
                      <span>
                        <CheckCircleRoundedIcon /> {user?.piUsername ? `@${user.piUsername}` : "SMAJ PI HUB account"}
                        {profile?.verificationStatus === "verified" ? <b>Verified</b> : null}
                      </span>
                      {user?.contactPhone ? <span><PhoneOutlinedIcon /> {user.contactPhone}</span> : null}
                    </div>
                    <div className="jobs-profile-completion">
                      <small>{profileCompletion}% Profile Completed</small>
                      <small>Updated Today</small>
                    </div>
                    <progress value={profileCompletion} max="100">
                      {profileCompletion}%
                    </progress>
                  </div>
                  {missingProfileItems ? (
                    <div className="jobs-profile-pending-card">
                      <div>
                        <b>{missingProfileItems} Pending Actions</b>
                        <p>Here is a list of information missing in your profile. Add these to reach a 100% profile completion score.</p>
                      </div>
                      <button type="button" onClick={() => setProfileEditor("basic")}>
                        View All
                      </button>
                    </div>
                  ) : null}
                  <div className="jobs-profile-card-grid">
                    <article>
                      <h3>CV Headline</h3>
                      <p>{profile?.title || "Not added"}</p>
                      <button type="button" onClick={() => setProfileEditor("headline")}>
                        Edit
                      </button>
                    </article>
                    <article>
                      <h3>Key Skills</h3>
                      <p>
                        {Array.isArray(profile?.skills) ? profile.skills.join(", ") : profile?.skills || "Not added"}
                      </p>
                      <button type="button" onClick={() => setProfileEditor("skills")}>
                        Edit
                      </button>
                    </article>
                    <article>
                      <h3>Basic Details</h3>
                      <p>{profile?.location || user?.country || "Not added"}</p>
                      <button type="button" onClick={() => setProfileEditor("basic")}>
                        Edit
                      </button>
                    </article>
                    <article>
                      <h3>Employment Details</h3>
                      <p>
                        {profile?.employment?.[0]
                          ? `${profile.employment[0].position} at ${profile.employment[0].employer}`
                          : "Not added"}
                      </p>
                      <button type="button" onClick={() => setProfileEditor("employment")}>
                        Edit
                      </button>
                    </article>
                    <article className="jobs-cv-card">
                      <header>
                        <h3>CV</h3>
                        {profile?.cv ? (
                          <details className="jobs-cv-menu">
                            <summary aria-label="CV options">⋮</summary>
                            <div>
                              <a href={profile.cv.url} target="_blank" rel="noreferrer">View CV</a>
                              <label>
                                Visibility
                                <select
                                  value={profile.cv.visibility}
                                  onChange={event =>
                                    void changeCvVisibility(
                                      event.target.value as "applications" | "verified_employers" | "private"
                                    )
                                  }
                                >
                                  <option value="applications">Applications</option>
                                  <option value="verified_employers">Verified employers</option>
                                  <option value="private">Private</option>
                                </select>
                              </label>
                              <button type="button" onClick={() => void removeCv()}>Delete CV</button>
                            </div>
                          </details>
                        ) : null}
                      </header>
                      {profile?.cv ? (
                        <>
                          <div className="jobs-cv-preview">
                            <div className="jobs-cv-document" aria-hidden="true">
                              <span>●</span>
                              <i />
                              <i />
                              <i />
                            </div>
                            <span>{profile.cv.name}</span>
                          </div>
                          <small>Last updated {new Date(profile.cv.updatedAt).toLocaleDateString()}</small>
                          <div className="jobs-cv-update-row">
                            <label className="jobs-cv-update">
                              {cvSaving ? "Uploading…" : "Update"}
                              <input
                                type="file"
                                accept="application/pdf,.pdf"
                                onChange={event => void uploadCv(event)}
                                disabled={cvSaving}
                              />
                            </label>
                          </div>
                        </>
                      ) : (
                        <label className="jobs-cv-upload">
                          {cvSaving ? "Uploading…" : "Upload PDF CV"}
                          <input
                            type="file"
                            accept="application/pdf,.pdf"
                            onChange={event => void uploadCv(event)}
                            disabled={cvSaving}
                          />
                        </label>
                      )}
                      {cvMessage ? <small>{cvMessage}</small> : null}
                    </article>
                  </div>
                </section>
                <datalist id="profile-country-options">
                  {JOB_COUNTRIES.map(country => (
                    <option key={country.code} value={country.label} />
                  ))}
                </datalist>
                {profileEditor ? (
                  <div className="jobs-profile-editor">
                    <form onSubmit={event => void saveProfileEditor(event)}>
                      <header>
                        <button type="button" onClick={() => setProfileEditor("")}>
                          ←
                        </button>
                        <div>
                          <h1>
                            {profileEditor === "headline"
                              ? "CV Headline"
                              : profileEditor === "skills"
                                ? "Key Skills"
                                : profileEditor === "employment"
                                  ? "Employment Details"
                                  : "Basic Details"}
                          </h1>
                          <p>Keep this information current for suitable job opportunities.</p>
                        </div>
                      </header>
                      {profileEditor === "headline" ? (
                        <label>
                          Professional headline
                          <input name="title" maxLength={80} required defaultValue={profile?.title} />
                          <small>Maximum 80 characters</small>
                        </label>
                      ) : null}
                      {profileEditor === "skills" ? (
                        <label>
                          Skills
                          <input
                            name="skills"
                            required
                            defaultValue={Array.isArray(profile?.skills) ? profile.skills.join(", ") : profile?.skills}
                            placeholder="Add skills separated by commas"
                          />
                        </label>
                      ) : null}
                      {profileEditor === "basic" ? (
                        <>
                          <label>
                            Full name
                            <input value={user?.displayName || user?.username || ""} disabled />
                          </label>
                          <label>
                            Country or city
                            <input
                              name="location"
                              list="profile-country-options"
                              defaultValue={profile?.location || user?.country}
                              placeholder="Search for your country"
                            />
                          </label>
                          <label>
                            Availability
                            <select name="availability" defaultValue={profile?.availability}>
                              <option>Available now</option>
                              <option>Open to offers</option>
                              <option>Not available</option>
                            </select>
                          </label>
                          <label>
                            Portfolio URL
                            <input name="portfolio" type="url" defaultValue={profile?.portfolio} />
                          </label>
                          <label>
                            Professional summary
                            <textarea name="summary" maxLength={3000} rows={7} defaultValue={profile?.summary} />
                          </label>
                        </>
                      ) : null}
                      {profileEditor === "employment" ? (
                        <>
                          <input type="hidden" name="id" defaultValue={profile?.employment?.[0]?.id} />
                          <label>
                            Designation / Position
                            <input name="position" required defaultValue={profile?.employment?.[0]?.position} />
                          </label>
                          <label>
                            Employer Name
                            <input name="employer" required defaultValue={profile?.employment?.[0]?.employer} />
                          </label>
                          <label className="jobs-editor-check">
                            <input name="current" type="checkbox" defaultChecked={profile?.employment?.[0]?.current} />{" "}
                            I currently work here
                          </label>
                          <label>
                            Employer location
                            <input name="employerLocation" defaultValue={profile?.employment?.[0]?.location} />
                          </label>
                          <label>
                            Employer Country
                            <input
                              name="country"
                              list="profile-country-options"
                              defaultValue={profile?.employment?.[0]?.country}
                            />
                          </label>
                          <div>
                            <label>
                              Started month
                              <input name="startMonth" defaultValue={profile?.employment?.[0]?.startMonth} />
                            </label>
                            <label>
                              Started year
                              <input
                                name="startYear"
                                inputMode="numeric"
                                defaultValue={profile?.employment?.[0]?.startYear}
                              />
                            </label>
                          </div>
                          <div>
                            <label>
                              Ended month
                              <input name="endMonth" defaultValue={profile?.employment?.[0]?.endMonth} />
                            </label>
                            <label>
                              Ended year
                              <input
                                name="endYear"
                                inputMode="numeric"
                                defaultValue={profile?.employment?.[0]?.endYear}
                              />
                            </label>
                          </div>
                          <label>
                            Describe your job profile
                            <textarea
                              name="description"
                              maxLength={1000}
                              rows={8}
                              defaultValue={profile?.employment?.[0]?.description}
                            />
                            <small>Maximum 1000 characters</small>
                          </label>
                        </>
                      ) : null}
                      <button className="jobs-editor-save" type="submit">
                        Save
                      </button>
                    </form>
                  </div>
                ) : null}
                <form className="job-form jobs-verification-form" onSubmit={submitCandidateVerification}>
                  <h2>Professional verification</h2>
                  <p>
                    Status: <b>{profile?.verificationStatus || "unverified"}</b>. Verification reviews evidence; it does
                    not guarantee a candidate's work.
                  </p>
                  <label>
                    Portfolio or work URL
                    <input
                      name="verificationPortfolio"
                      type="url"
                      defaultValue={profile?.portfolio}
                      placeholder="https://..."
                    />
                  </label>
                  <label>
                    Credential URL
                    <input name="credential" type="url" placeholder="https://..." />
                  </label>
                  <label>
                    Review notes
                    <textarea
                      name="verificationNotes"
                      rows={3}
                      placeholder="Explain what the reviewer should confirm"
                    />
                  </label>
                  <button type="submit">Request professional verification</button>
                </form>
                {actionMessage ? <p className="jobs-action-message">{actionMessage}</p> : null}
              </div>
            ) : kind === "employer" ? (
              <div className="jobs-employer-dashboard">
                <article>
                  <strong>
                    {jobs.filter(job => employerCompanies.some(company => company.id === job.companyId)).length}
                  </strong>
                  <span>Your opportunities</span>
                </article>
                <article>
                  <strong>{employerApplications.length}</strong>
                  <span>Candidate applications</span>
                </article>
                <article>
                  <strong>{employerCompanies.length}</strong>
                  <span>Your companies</span>
                </article>
                <Link to="/services/jobs/post">Post another job</Link>
                <section className="jobs-company-workspace">
                  <header className="jobs-company-workspace-head">
                    <div>
                      <span className="jobs-kicker">COMPANY WORKSPACE</span>
                      <h2>Your companies</h2>
                      <p>Manage company profiles, listing review, and verification from one place.</p>
                    </div>
                    <button type="button" onClick={() => setCompanyRegistrationOpen(open => !open)}>
                      {companyRegistrationOpen ? "Close" : "+ Add company"}
                    </button>
                  </header>

                  {companyRegistrationOpen || !employerCompanies.length ? (
                    <form className="job-form jobs-company-register-form" onSubmit={createCompany}>
                      <div>
                        <h3>Register an employer company</h3>
                        <p>Add the basic company details first. Admin listing review happens before verification.</p>
                      </div>
                      <label>
                        Company name
                        <input name="name" required minLength={2} maxLength={120} placeholder="Company name" />
                      </label>
                      <label>
                        Industry
                        <input name="field" required maxLength={100} placeholder="e.g. Software, Retail, Education" />
                      </label>
                      <button type="submit" disabled={companySubmitting} aria-busy={companySubmitting}>
                        {companySubmitting ? "Submitting…" : "Submit company for review"}
                      </button>
                    </form>
                  ) : null}

                  <div className="jobs-company-toolbar">
                    <label>
                      <SearchRoundedIcon />
                      <input
                        type="search"
                        value={employerCompanyQuery}
                        onChange={event => setEmployerCompanyQuery(event.target.value)}
                        placeholder="Search your companies"
                        aria-label="Search your companies"
                      />
                    </label>
                    <select
                      value={employerCompanyStatus}
                      onChange={event => setEmployerCompanyStatus(event.target.value)}
                      aria-label="Filter companies by status"
                    >
                      <option value="all">All statuses</option>
                      <option value="review">Listing review</option>
                      <option value="claimed">Needs verification</option>
                      <option value="pending">Verification pending</option>
                      <option value="verified">Verified</option>
                      <option value="pi_kyb">Pi KYB</option>
                      <option value="rejected">Rejected</option>
                    </select>
                  </div>

                  {filteredEmployerCompanies.length ? (
                    <div className="jobs-company-card-grid">
                      {filteredEmployerCompanies.map(company => {
                        const reviewStatus = company.moderationStatus === "pending"
                          ? "review"
                          : company.moderationStatus === "rejected"
                            ? "rejected"
                            : company.verificationStatus || "claimed";
                        const statusLabel = reviewStatus === "review"
                          ? "Listing review"
                          : reviewStatus === "pi_kyb"
                            ? "Pi KYB verified"
                            : reviewStatus === "claimed"
                              ? "Needs verification"
                              : reviewStatus.replace(/_/g, " ");
                        const canRequestVerification = company.moderationStatus === "approved" &&
                          !["pending", "verified", "pi_kyb"].includes(company.verificationStatus || "claimed");
                        return (
                          <article className="jobs-company-manage-card" key={company.id}>
                            <Link to={`/services/jobs/company/${company.id}`} className="jobs-company-card-main">
                              <span className="jobs-company-mark">{company.mark}</span>
                              <div>
                                <small className={`jobs-company-status ${reviewStatus}`}>{statusLabel}</small>
                                <h3>{company.name}</h3>
                                <p>{company.field}</p>
                              </div>
                              <ArrowForwardRoundedIcon />
                            </Link>
                            <footer>
                              <Link to={`/services/jobs/company/${company.id}`}>Open company profile</Link>
                              {canRequestVerification ? (
                                <button type="button" onClick={() => setVerificationCompanyId(current => current === company.id ? "" : company.id)}>
                                  {verificationCompanyId === company.id ? "Close form" : "Verify company"}
                                </button>
                              ) : (
                                <span>{reviewStatus === "review" ? "Waiting for listing review" : statusLabel}</span>
                              )}
                            </footer>
                          </article>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="jobs-company-empty-state">
                      <SearchRoundedIcon />
                      <h3>No matching companies</h3>
                      <p>Change the search or status filter.</p>
                    </div>
                  )}

                  {verificationCompanyId ? (() => {
                    const company = employerCompanies.find(item => item.id === verificationCompanyId);
                    return company ? (
                      <form
                        className="job-form jobs-verification-form jobs-verification-panel"
                        onSubmit={event => void submitCompanyVerification(event, company.id)}
                      >
                        <div className="jobs-verification-panel-head">
                          <span className="jobs-company-mark">{company.mark}</span>
                          <div><small>VERIFICATION REQUEST</small><h3>{company.name}</h3></div>
                          <button type="button" onClick={() => setVerificationCompanyId("")} aria-label="Close verification form">×</button>
                        </div>
                        <p>Provide business identity and representative evidence for admin review.</p>
                        <div className="jobs-verification-fields">
                          <label>Registration number<input name="registrationNumber" required placeholder="Official registration number" /></label>
                          <label>Business email<input name="businessEmail" type="email" required placeholder="name@company.com" /></label>
                          <label>Your role<input name="representativeRole" required placeholder="Owner, director, recruiter…" /></label>
                          <label className="wide">Evidence notes<textarea name="notes" rows={3} placeholder="Explain what the reviewer should confirm" /></label>
                        </div>
                        <button type="submit">Send verification request</button>
                      </form>
                    ) : null;
                  })() : null}
                </section>
                <section className="jobs-trust-section jobs-billing-plans">
                  <h2>Employer plans</h2>
                  <p>
                    Candidate profiles and applications stay free. Employer promotion and posting plans fund SMAJ PI
                    HUB; salaries remain between employer and worker.
                  </p>
                  {billingPlans.map(plan => (
                    <article key={plan.id}>
                      <h3>{plan.name}</h3>
                      <strong>{formatPiAmount(plan.pricePi)}</strong>
                      <small>{formatUsdAmount(plan.priceUsdt)} at the configured store rate</small>
                      {plan.id === "featured" && employerJobs.length ? (
                        <label>
                          Job to feature
                          <select
                            aria-label={`Job to feature for ${plan.name}`}
                            value={billingPlanJobId[plan.id] || ""}
                            onChange={event =>
                              setBillingPlanJobId(current => ({ ...current, [plan.id]: event.target.value }))
                            }
                          >
                            <option value="">Select a job you posted</option>
                            {employerJobs.map(job => (
                              <option key={job.id} value={job.id}>
                                {job.title}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : null}
                      <button
                        type="button"
                        disabled={
                          Boolean(billingSubmittingPlanId) ||
                          billingPaying ||
                          (plan.id === "featured" && employerJobs.length > 0 && !billingPlanJobId[plan.id])
                        }
                        aria-busy={billingSubmittingPlanId === plan.id}
                        onClick={() => void startBilling(plan.id)}
                      >
                        {billingSubmittingPlanId === plan.id ? "Processing payment…" : "Pay with Pi"}
                      </button>
                    </article>
                  ))}
                </section>
                {actionMessage ? <p className="jobs-action-message">{actionMessage}</p> : null}
                <div className="jobs-application-list">
                  {employerApplications.map(application => (
                    <article key={application.id}>
                      <div>
                        <h2>{application.jobTitle}</h2>
                        <p>
                          {application.profileSnapshot?.title || "Candidate"} · {application.company}
                        </p>
                      </div>
                      <select
                        aria-label={`Status for ${application.jobTitle}`}
                        value={application.status}
                        onChange={event => void changeApplicationStatus(application.id, event.target.value)}
                      >
                        <option>submitted</option>
                        <option>reviewing</option>
                        <option>shortlisted</option>
                        <option>rejected</option>
                        <option>hired</option>
                      </select>
                    </article>
                  ))}
                </div>
              </div>
            ) : (
              <div className="workspace-empty">
                <WorkOutlineRoundedIcon />
                <h2>{kind === "applications" ? "No active applications yet" : "Your workspace is ready"}</h2>
                <p>Your existing SMAJ PI HUB account securely manages this area—no separate Jobs login is needed.</p>
                <Link to="/services/jobs/search">Explore opportunities</Link>
              </div>
            )}
          </section>
        ) : (
          <section className={`jobs-directory${kind === "freelance" ? "" : " jobs-directory-filtered"}`}>
            {kind === "freelance" ? (
              <div className="jobs-page-heading">
                <span className="jobs-kicker">PROJECT-BASED WORK</span>
                <h1>Freelance projects</h1>
                <p>{listings.length} available opportunities.</p>
              </div>
            ) : null}
            <div className="jobs-results-layout">
              <aside>
                <b>Filter jobs</b>
                {["All", "Engineering", "Design", "Marketing", "Operations"].map(item => (
                  <button
                    className={category === item ? "active" : ""}
                    onClick={() => {
                      setCategory(item);
                      setPage(1);
                    }}
                    key={item}
                  >
                    {item}
                  </button>
                ))}
              </aside>
              <div className="jobs-list">
                {listings.map(job => (
                  <JobCard key={job.id} job={job} saved={saved.has(job.id)} onSave={() => saveJob(job.id)} />
                ))}
                {!listings.length ? (
                  <div className="workspace-empty">
                    <SearchRoundedIcon />
                    <h2>
                      {effectiveLocation ? `No jobs available in ${effectiveLocation}` : "No opportunities found"}
                    </h2>
                    <p>
                      {effectiveLocation
                        ? "Try another nearby location, choose Remote, or broaden your search."
                        : "Try another search or category."}
                    </p>
                  </div>
                ) : null}
                {pages > 1 ? (
                  <nav className="jobs-pagination" aria-label="Jobs pages">
                    <button type="button" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>
                      Previous
                    </button>
                    <span>
                      Page {page} of {pages}
                    </span>
                    <button type="button" disabled={page >= pages} onClick={() => setPage(value => value + 1)}>
                      Next
                    </button>
                  </nav>
                ) : null}
              </div>
            </div>
          </section>
        )}
        {kind !== "post" ? <nav className="jobs-mobile-nav">
          <NavLink end to="/services/jobs">
            <HomeRoundedIcon />
            <span>Home</span>
          </NavLink>
          {activeWorkspaceMode === "candidate" ? (
            <>
              <NavLink to="/services/jobs/search">
                <span className="jobs-nav-icon-badge">
                  <NotificationsNoneRoundedIcon />
                  {jobAlertsCount > 0 ? <b>{jobAlertsLabel}</b> : null}
                </span>
                <span>Job alerts</span>
              </NavLink>
              <NavLink to="/services/jobs/saved">
                <BookmarkBorderRoundedIcon />
                <span>My Jobs</span>
              </NavLink>
              <Link
                to="/services/jobs?tab=messages"
                className={kind === "home" && searchParams.get("tab") === "messages" ? "active" : ""}
              >
                <span className="jobs-nav-icon-badge">
                  <ChatOutlinedIcon />
                  {unreadJobMessages > 0 ? <b>{unreadJobMessages > 9 ? "9+" : unreadJobMessages}</b> : null}
                </span>
                <span>Messages</span>
              </Link>
              <NavLink to="/services/jobs/profile">
                <PersonOutlineRoundedIcon />
                <span>Profile</span>
              </NavLink>
            </>
          ) : (
            <>
              <Link
                to="/services/jobs?tab=messages"
                className={kind === "home" && searchParams.get("tab") === "messages" ? "active" : ""}
              >
                <span className="jobs-nav-icon-badge">
                  <ChatOutlinedIcon />
                  {unreadJobMessages > 0 ? <b>{unreadJobMessages > 9 ? "9+" : unreadJobMessages}</b> : null}
                </span>
                <span>Messages</span>
              </Link>
              <NavLink to="/services/jobs/candidates">
                <PersonOutlineRoundedIcon />
                <span>Candidates</span>
              </NavLink>
              <Link
                to="/services/jobs?tab=employer-applications"
                className={kind === "home" && searchParams.get("tab") === "employer-applications" ? "active" : ""}
              >
                <WorkOutlineRoundedIcon />
                <span>Applications</span>
              </Link>
              <NavLink to="/services/jobs/post">
                <WorkOutlineRoundedIcon />
                <span>Post job</span>
              </NavLink>
            </>
          )}
        </nav> : null}
      </main>
    </AppLayout>
  );
};

export default JobsPage;
