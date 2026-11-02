import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import ArrowBackIosNewOutlinedIcon from "@mui/icons-material/ArrowBackIosNewOutlined";
import SendOutlinedIcon from "@mui/icons-material/SendOutlined";
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import DownloadOutlinedIcon from "@mui/icons-material/DownloadOutlined";
import { useAuthContext } from "../../contexts/AuthContext";
import { serviceCatalog } from "../../content/serviceCatalog";
import { axiosClient } from "../../lib/axiosClient";
import { showFeedback } from "../../lib/feedback";
import EmbeddedServiceIcon from "./EmbeddedServiceIcon";
import "./embedded-ai.css";

type AiAction = {
  id: string;
  serviceId: string;
  recordId: string;
  kind: string;
  title: string;
  coverNote?: string;
  message?: string;
  storePreview?: {
    product: { recordId: string; sellerId: string; title: string; sellerName: string; pricePi: number; quantityAvailable: number };
  };
  applicationPreview?: {
    job: { title: string; company: string; location: string; type: string; mode: string; salary: string; category: string };
    profile: { title: string; skills: string[]; location: string; portfolio: string; summary: string; profilePhoto: string };
    cv: { attached: boolean; name?: string; size?: number; visibility?: string };
  };
};
type AiPlan = {
  summary: string;
  model?: string;
  generationStatus?: "pending" | "failed" | "complete";
  generationError?: string;
  services: string[];
  steps?: Array<{ serviceId: string; title: string; description: string; status: string; reason?: string }>;
  sources?: Array<{ title: string; file: string }>;
  warnings?: string[];
  proposedActions?: AiAction[];
  actionReviewHash?: string;
  summaryError?: { message: string };
  discovery?: {
    results: Array<{ serviceId: string; status: "read" | "unavailable"; records: unknown[]; error?: string }>;
  };
  execution?: {
    status: string;
    retryable?: boolean;
    error?: string;
    actions?: AiAction[];
    receipt?: { verifiedAt?: string };
    events?: Array<{ at: string; message: string }>;
  };
};
type AiTask = { id: string; task: string; plan: AiPlan; createdAt: string; conversationId?: string; requestKey?: string };
type PendingMessage = { id: string; text: string; conversationId: string; persistedConversation: boolean; requestKey: string; status: "sending" | "failed"; error?: string };
type StoredPendingRequest = { id: string; text: string; conversationId: string; persistedConversation: boolean; requestKey: string };
type AiConnection = { serviceId: string; connected: boolean; available: boolean; adapterMode: string };
type AiResponse<T> = T;
type Section = "chat" | "tasks" | "apps" | "approvals" | "results" | "settings";

const navigation: Array<{ section: Section; label: string; path: string }> = [
  { section: "chat", label: "Ask AI", path: "/ai" },
  { section: "tasks", label: "All Tasks", path: "/ai/tasks" },
  { section: "apps", label: "Connect Apps", path: "/ai/apps" },
  { section: "approvals", label: "Approvals", path: "/ai/approvals" },
  { section: "results", label: "Results", path: "/ai/results" },
  { section: "settings", label: "Settings", path: "/ai/settings" },
];

const sectionTitles: Record<Section, string> = {
  chat: "Ask AI",
  tasks: "All Tasks",
  apps: "Connect Apps",
  approvals: "Approvals",
  results: "Results",
  settings: "Settings",
};

const getSection = (path: string): { section: Section; taskId?: string; legacyConversationId?: string; legacyConversationList?: boolean } => {
  const parts = path.replace(/^\/ai\/?/, "").split("/").filter(Boolean);
  const section = navigation.find(item => item.section === parts[0] || item.path === `/ai/${parts[0]}`)?.section;
  if (!parts.length) return { section: "chat" };
  if (parts[0] === "history") return { section: "tasks" };
  if (parts[0] === "conversations") return parts[1]
    ? { section: "results", legacyConversationId: parts[1] }
    : { section: "tasks", legacyConversationList: true };
  if (parts[0] === "results") return { section: "results", taskId: parts[1] };
  return { section: section || "chat" };
};

const statusLabel = (plan: AiPlan) => {
  if (plan.execution?.status) {
    const labels: Record<string, string> = {
      awaiting_approval: "Awaiting approval",
      approved: "Approved",
      queued: "Queued",
      running: "Working",
      executing: "Executing",
      retrying: "Recovering",
      verifying: "Verifying",
      verified: "Verified",
      failed: "Needs attention",
    };
    return labels[plan.execution.status] || plan.execution.status.replaceAll("_", " ");
  }
  if (plan.proposedActions?.length) return "Awaiting approval";
  if (plan.discovery) return "Results ready";
  return "New";
};

const serviceName = (id: string) => serviceCatalog.find(service => service.slug === id)?.name || id;
const serviceExamples: Record<string, string> = {
  store: "Find a product and ask its seller if it is available",
  stream: "Build a weekend watchlist",
  jobs: "Find matching jobs and prepare applications",
  education: "Create a learning path for product design",
  sports: "Plan which matches to follow this week",
  food: "Plan affordable meals near me",
  health: "Prepare questions for a doctor visit",
  transport: "Plan transport for my appointments",
  agro: "Create a crop-to-market checklist",
  energy: "Create an energy-saving plan",
  charity: "Help me assess causes before donating",
  housing: "Prepare a safe rental search",
  events: "Plan events for my weekend",
  swap: "Explain the peer-to-peer exchange vision",
  token: "Explain available reward pathways",
};
const responseMessage = async (error: unknown) => {
  const data = (error as { response?: { data?: unknown } })?.response?.data;
  if (data instanceof Blob) {
    try {
      const parsed = JSON.parse(await data.text()) as { message?: unknown };
      if (typeof parsed.message === "string") return parsed.message;
    } catch { /* Use the standard error when a response is not JSON. */ }
  }
  const message = (data as { message?: unknown } | undefined)?.message;
  return typeof message === "string" ? message : "SMAJ AI could not complete that request. Please try again.";
};
const taskTime = (date: string) => {
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
};
const taskTimestamp = (date: string) => {
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
};
const dateGroup = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Earlier";
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const daysAgo = Math.round((todayStart - day) / 86_400_000);
  if (daysAgo === 0) return "Today";
  if (daysAgo === 1) return "Yesterday";
  if (daysAgo >= 2 && daysAgo < 7) return "Previous 7 days";
  return date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: date.getFullYear() === today.getFullYear() ? undefined : "numeric" });
};
const PENDING_REQUEST_STORAGE_KEY = "smaj-ai-pending-request";
const mergeTask = (current: AiTask | undefined, incoming: AiTask): AiTask => {
  if (!current) return incoming;
  if (current.plan.generationStatus === "complete" && incoming.plan.generationStatus === "pending") return current;
  const plan = { ...current.plan, ...incoming.plan };
  if (!incoming.plan.summary && current.plan.summary) plan.summary = current.plan.summary;
  if (!incoming.plan.discovery && current.plan.discovery) plan.discovery = current.plan.discovery;
  if (!incoming.plan.execution && current.plan.execution) plan.execution = current.plan.execution;
  return { ...current, ...incoming, plan };
};
const mergeTasks = (current: AiTask[], incoming: AiTask[]) => {
  const byId = new Map(current.map(task => [task.id, task]));
  for (const task of incoming) byId.set(task.id, mergeTask(byId.get(task.id), task));
  return [...byId.values()].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
};
const readStoredPendingRequest = (): StoredPendingRequest | null => {
  try {
    const raw = window.sessionStorage.getItem(PENDING_REQUEST_STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<StoredPendingRequest>;
    if (typeof value.id !== "string" || typeof value.text !== "string" || typeof value.conversationId !== "string" || typeof value.requestKey !== "string") return null;
    return { id: value.id, text: value.text, conversationId: value.conversationId, persistedConversation: value.persistedConversation === true, requestKey: value.requestKey };
  } catch {
    return null;
  }
};

export default function EmbeddedAiWorkspace() {
  const { user } = useAuthContext();
  const location = useLocation();
  const navigate = useNavigate();
  const active = getSection(location.pathname);
  const [tasks, setTasks] = useState<AiTask[]>([]);
  const tasksRef = useRef<AiTask[]>([]);
  const [connections, setConnections] = useState<AiConnection[]>([]);
  const [pendingMessage, setPendingMessage] = useState<PendingMessage|null>(null);
  const [resolvingTaskId, setResolvingTaskId] = useState("");
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [connectionBusy, setConnectionBusy] = useState<string[]>([]);
  const pendingConnections = useRef(new Set<string>());
  const taskSubmissionPending = useRef(false);
  const discoveryInFlight = useRef(new Set<string>());
  const automaticDiscoveryStarted = useRef(new Set<string>());
  const promptInput = useRef<HTMLTextAreaElement>(null);
  const [error, setError] = useState("");
  const [selectedService, setSelectedService] = useState("");
  const [showAllServices, setShowAllServices] = useState(false);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [selectedActions, setSelectedActions] = useState<string[]>([]);
  const [initialLoadFailed, setInitialLoadFailed] = useState(false);
  const [preferences, setPreferences] = useState<string[]>([]);
  const [preferencesDraft, setPreferencesDraft] = useState("");
  const [preferencesStatus, setPreferencesStatus] = useState("");
  const [preferencesBusy, setPreferencesBusy] = useState(false);
  const [taskQuery, setTaskQuery] = useState("");
  const [taskServiceFilter, setTaskServiceFilter] = useState("all");
  const [taskFilterOpen, setTaskFilterOpen] = useState(false);
  const [navigationMenuOpen, setNavigationMenuOpen] = useState(false);
  const navigationMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!navigationMenuOpen) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (event.target instanceof Node && !navigationMenuRef.current?.contains(event.target)) setNavigationMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setNavigationMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [navigationMenuOpen]);

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    setInitialLoadFailed(false);
    setError("");
    try {
      const [taskResponse, connectionResponse] = await Promise.all([
        axiosClient.get<AiResponse<{ tasks: AiTask[] }>>("/ai/tasks", { smajSkipReadRetry: true, headers: { "X-SMAJ-Silent": "true" } }),
        axiosClient.get<AiResponse<{ connections: AiConnection[] }>>("/ai/connections", { smajSkipReadRetry: true, headers: { "X-SMAJ-Silent": "true" } }),
      ]);
      const loadedTasks = taskResponse.data.tasks || [];
      setTasks(current => mergeTasks(current, loadedTasks));
      const latestTask = loadedTasks[0];
      const unfinished = latestTask?.plan.generationStatus === "pending" || latestTask?.plan.generationStatus === "failed" ? latestTask : undefined;
      if (unfinished?.requestKey) {
        setPendingMessage({
          id: unfinished.id,
          text: unfinished.task,
          conversationId: unfinished.conversationId || unfinished.id,
          persistedConversation: true,
          requestKey: unfinished.requestKey,
          status: unfinished.plan.generationStatus === "pending" ? "sending" : "failed",
          error: unfinished.plan.generationError || "Your message is saved. Retry to get the AI response.",
        });
      }
      setConnections(connectionResponse.data.connections || []);
    } catch (loadError) {
      setInitialLoadFailed(true);
      setError(await responseMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadWorkspace(); }, [loadWorkspace]);
  useEffect(() => { tasksRef.current = tasks; }, [tasks]);
  useEffect(() => {
    if (!active.legacyConversationId || loading) return;
    let activeRequest = true;
    void axiosClient.get<AiResponse<{ tasks: AiTask[] }>>(`/ai/conversations/${encodeURIComponent(active.legacyConversationId)}`, { smajSkipReadRetry: true, headers: { "X-SMAJ-Silent": "true" } })
      .then(({ data }) => {
        if (!activeRequest) return;
        const history = data.tasks || [];
        setTasks(current => mergeTasks(current, history));
        const latest = history.at(-1);
        navigate(latest ? `/ai/results/${encodeURIComponent(latest.id)}` : "/ai/tasks", { replace: true });
      })
      .catch(async failure => {
        if (activeRequest) {
          setError(await responseMessage(failure));
          navigate("/ai/tasks", { replace: true });
        }
      });
    return () => { activeRequest = false; };
  }, [active.legacyConversationId, loading, navigate]);
  useEffect(() => {
    if (!active.taskId || loading || active.section !== "results" || active.taskId.startsWith("pending-")) return;
    let activeRequest = true;
    void (async () => {
      try {
        let task = tasksRef.current.find(item => item.id === active.taskId);
        if (!task) {
          setResolvingTaskId(active.taskId!);
          const response = await axiosClient.get<AiResponse<{ task: AiTask }>>(`/ai/tasks/${encodeURIComponent(active.taskId!)}`, { smajSkipReadRetry: true, headers: { "X-SMAJ-Silent": "true" } });
          task = response.data.task;
        }
        if (!activeRequest || !task) return;
        setTasks(current => mergeTasks(current, [task!]));
        const conversationId = task?.conversationId || task?.id;
        if (!conversationId) return;
        const { data } = await axiosClient.get<AiResponse<{ tasks: AiTask[] }>>(`/ai/conversations/${encodeURIComponent(conversationId)}`, { smajSkipReadRetry: true, headers: { "X-SMAJ-Silent": "true" } });
        if (!activeRequest) return;
        const history = data.tasks || [];
        setTasks(current => mergeTasks(current, history));
        const latest = history.at(-1);
        const latestRequestKey = latest?.requestKey;
        if (latest && latestRequestKey && (latest.plan.generationStatus === "pending" || latest.plan.generationStatus === "failed")) {
          setPendingMessage(current => current || {
            id: latest.id,
            text: latest.task,
            conversationId: latest.conversationId || latest.id,
            persistedConversation: true,
            requestKey: latestRequestKey,
            status: latest.plan.generationStatus === "pending" ? "sending" : "failed",
            error: latest.plan.generationError || "Your message is saved. Retry to get the AI response.",
          });
        }
      } catch (failure) {
        if (activeRequest) setError(await responseMessage(failure));
      } finally {
        if (activeRequest) setResolvingTaskId(current => current === active.taskId ? "" : current);
      }
    })();
    return () => { activeRequest = false; setResolvingTaskId(current => current === active.taskId ? "" : current); };
  }, [active.section, active.taskId, loading, pendingMessage?.id]);
  useEffect(() => {
    if (loading || !active.taskId?.startsWith("pending-")) return;
    const stored = readStoredPendingRequest();
    if (!stored || stored.id !== active.taskId) return;
    let cancelled = false;
    let timer = 0;
    let attempts = 0;
    setResolvingTaskId(active.taskId);
    const restoreCanonicalTask = (task: AiTask) => {
      if (cancelled) return;
      setTasks(current => mergeTasks(current, [task]));
      setPendingMessage(task.plan.generationStatus === "pending" || task.plan.generationStatus === "failed" ? {
          id: task.id,
          text: task.task,
          conversationId: task.conversationId || task.id,
          persistedConversation: true,
          requestKey: task.requestKey || stored.requestKey,
          status: task.plan.generationStatus === "pending" ? "sending" : "failed",
          error: task.plan.generationError || "Your message is saved. Retry to get the AI response.",
        } : null);
      try { window.sessionStorage.removeItem(PENDING_REQUEST_STORAGE_KEY); } catch { /* Ignore unavailable session storage. */ }
      setResolvingTaskId("");
      navigate(`/ai/results/${encodeURIComponent(task.id)}`, { replace: true });
    };
    const findTask = async () => {
      const localTask = tasksRef.current.find(task => task.requestKey === stored.requestKey);
      if (localTask) {
        restoreCanonicalTask(localTask);
        return;
      }
      try {
        const { data } = await axiosClient.get<AiResponse<{ tasks: AiTask[] }>>("/ai/tasks", { smajSkipReadRetry: true, headers: { "X-SMAJ-Silent": "true" } });
        if (cancelled) return;
        const loadedTasks = data.tasks || [];
        setTasks(current => mergeTasks(current, loadedTasks));
        const task = loadedTasks.find(item => item.requestKey === stored.requestKey);
        if (task) {
          restoreCanonicalTask(task);
          return;
        }
      } catch {
        if (cancelled) return;
      }
      attempts += 1;
      if (attempts < 60 && !cancelled) timer = window.setTimeout(() => { void findTask(); }, 2500);
      else if (!cancelled) {
        setResolvingTaskId("");
        setPendingMessage({
          ...stored,
          status: "failed",
          error: "The saved task could not be located yet. Retry to safely check again.",
        });
      }
    };
    void findTask();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      setResolvingTaskId(current => current === active.taskId ? "" : current);
    };
  }, [active.taskId, loading, navigate]);
  useEffect(() => {
    if (active.legacyConversationList) navigate("/ai/tasks", { replace: true });
  }, [active.legacyConversationList, navigate]);
  useEffect(() => {
    if (error) showFeedback(error, "error");
  }, [error]);
  useEffect(() => {
    if (draft) return;
    const timer = window.setInterval(() => setPlaceholderIndex(index => (index + 1) % serviceCatalog.length), 3000);
    return () => window.clearInterval(timer);
  }, [draft]);

  const selectedTask = useMemo(
    () => active.taskId ? tasks.find(task => task.id === active.taskId) : undefined,
    [active.taskId, tasks],
  );
  const activeConversationId = selectedTask?.conversationId || selectedTask?.id;
  const conversationTasks = useMemo(
    () => activeConversationId ? tasks.filter(task => (task.conversationId || task.id) === activeConversationId).sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)) : [],
    [activeConversationId, tasks],
  );
  const updateTask = (task: AiTask) => setTasks(current => mergeTasks(current, [task]));
  useEffect(() => {
    const task = selectedTask;
    if (active.section !== "results" || !task || task.plan.generationStatus !== "pending" || !task.requestKey) return;
    const controller = new AbortController();
    let attempts = 0;
    const refresh = async () => {
      attempts += 1;
      try {
        const { data } = await axiosClient.get<AiResponse<{ task: AiTask }>>(`/ai/tasks/${encodeURIComponent(task.id)}`, {
          signal: controller.signal,
          smajSkipReadRetry: true,
          headers: { "X-SMAJ-Silent": "true" },
        });
        if (controller.signal.aborted || !data.task) return;
        updateTask(data.task);
        if (data.task.plan.generationStatus === "complete") {
          setPendingMessage(current => current?.id === task.id ? null : current);
          const stored = readStoredPendingRequest();
          if (stored?.requestKey === task.requestKey && !data.task.plan.services.some(id => ["jobs", "store", "stream"].includes(id))) {
            try { window.sessionStorage.removeItem(PENDING_REQUEST_STORAGE_KEY); } catch { /* Ignore unavailable session storage. */ }
          }
        } else if (data.task.plan.generationStatus === "failed") {
          setPendingMessage(current => current?.id === task.id ? { ...current, status: "failed", error: data.task.plan.generationError || "Your message is saved. Retry to get the AI response." } : current);
        } else if (attempts >= 48) {
          setPendingMessage(current => current?.id === task.id ? { ...current, status: "failed", error: "SMAJ AI is taking longer than expected. Retry to safely check the saved request." } : current);
        }
      } catch {
        if (!controller.signal.aborted && attempts >= 48) {
          setPendingMessage(current => current?.id === task.id ? { ...current, status: "failed", error: "The response status could not be refreshed. Your saved message is safe; retry to check again." } : current);
        }
      }
    };
    void refresh();
    const timer = window.setInterval(() => { if (attempts < 48) void refresh(); }, 2500);
    return () => { window.clearInterval(timer); controller.abort(); };
  }, [active.section, selectedTask?.id, selectedTask?.plan.generationStatus]);
  useEffect(() => {
    const task = selectedTask;
    if (!task || !["queued", "running", "retrying", "verifying"].includes(task.plan.execution?.status || "")) return;
    const controller = new AbortController();
    const timer = window.setInterval(() => {
      void axiosClient.get<AiResponse<{ task: AiTask }>>(`/ai/tasks/${encodeURIComponent(task.id)}`, {
        signal: controller.signal,
        smajSkipReadRetry: true,
        headers: { "X-SMAJ-Silent": "true" },
      }).then(({ data }) => {
        if (data.task) setTasks(current => mergeTasks(current, [data.task]));
        setError(current => current.startsWith("Task progress could not be refreshed") ? "" : current);
      }).catch(() => {
        if (!controller.signal.aborted) setError(current => current || "Task progress could not be refreshed. Your saved task is safe; try reopening it.");
      });
    }, 2500);
    return () => { window.clearInterval(timer); controller.abort(); };
  }, [selectedTask?.id, selectedTask?.plan.execution?.status]);
  useEffect(() => {
    const task = selectedTask;
    if (active.section !== "results" || !task || task.plan.generationStatus !== "complete" || task.plan.discovery || task.plan.execution || !task.plan.services.some(id => ["jobs", "store", "stream"].includes(id))) return;
    if (automaticDiscoveryStarted.current.has(task.id)) return;
    automaticDiscoveryStarted.current.add(task.id);
    void runDiscovery(task);
  }, [active.section, selectedTask?.id, selectedTask?.plan.generationStatus, selectedTask?.plan.discovery, selectedTask?.plan.execution]);
  const openTask = (task: AiTask) => {
    setSelectedActions([]);
    navigate(`/ai/results/${encodeURIComponent(task.id)}`);
  };

  const createTask = async (event: FormEvent) => {
    event.preventDefault();
    const request = draft.trim();
    if (!request || busy) return;
    const service = serviceCatalog.find(item => item.slug === selectedService);
    await submitTask(service ? `${service.name}: ${request}` : request);
  };

  const submitTask = async (request: string, conversationId?: string, retryPending?: PendingMessage): Promise<boolean> => {
    if (!request.trim() || busy || taskSubmissionPending.current) return false;
    taskSubmissionPending.current = true;
    const optimistic = retryPending || {
      id: `pending-${crypto.randomUUID()}`,
      text: request.trim(),
      conversationId: conversationId || crypto.randomUUID(),
      persistedConversation: Boolean(conversationId),
      requestKey: crypto.randomUUID(),
      status: "sending" as const,
    };
    setBusy("create");
    setError("");
    setPendingMessage({ ...optimistic, status: "sending", error: undefined });
    try {
      window.sessionStorage.setItem(PENDING_REQUEST_STORAGE_KEY, JSON.stringify(optimistic));
    } catch { /* The active request still works when browser storage is unavailable. */ }
    if (!conversationId) navigate(`/ai/results/${encodeURIComponent(optimistic.id)}`);
    try {
      const { data } = await axiosClient.post<AiResponse<{ task: AiTask }>>("/ai/tasks", { task: request.trim(), ...(conversationId ? { conversationId } : {}) }, { timeout: 250000, headers: { "Idempotency-Key": optimistic.requestKey, "X-SMAJ-Silent": "true" } });
      if (!data.task?.plan) throw new Error("SMAJ AI could not answer. Please try again.");
      updateTask(data.task);
      setDraft("");
      setPendingMessage(data.task.plan.generationStatus === "pending" ? { ...optimistic, id: data.task.id, conversationId: data.task.conversationId || data.task.id, persistedConversation: true, status: "sending", error: undefined } : null);
      navigate(`/ai/results/${encodeURIComponent(data.task.id)}`);
      const needsDiscovery = data.task.plan.generationStatus !== "pending" && !data.task.plan.discovery && data.task.plan.services.some(id => ["jobs", "store", "stream"].includes(id));
      try {
        if (needsDiscovery) {
          window.sessionStorage.setItem(PENDING_REQUEST_STORAGE_KEY, JSON.stringify({
            ...optimistic,
            id: data.task.id,
            conversationId: data.task.conversationId || data.task.id,
            persistedConversation: true,
          }));
        } else {
          window.sessionStorage.removeItem(PENDING_REQUEST_STORAGE_KEY);
        }
      } catch { /* Ignore unavailable session storage. */ }
      if (needsDiscovery) {
        window.setTimeout(() => { void runDiscovery(data.task); }, 0);
      }
      return true;
    } catch (createError) {
      const message = await responseMessage(createError);
      setError(message);
      setPendingMessage(current => current?.id === optimistic.id ? { ...current, status: "failed", error: message } : current);
      return false;
    } finally {
      taskSubmissionPending.current = false;
      setBusy("");
    }
  };
  const retryPendingMessage = () => {
    if (!pendingMessage) return;
    void submitTask(pendingMessage.text, pendingMessage.persistedConversation ? pendingMessage.conversationId : undefined, pendingMessage);
  };

  const runDiscovery = async (task: AiTask) => {
    if (discoveryInFlight.current.has(task.id)) return;
    discoveryInFlight.current.add(task.id);
    setBusy(`discover:${task.id}`);
    setError("");
    try {
      const { data } = await axiosClient.post<AiResponse<{ task: AiTask }>>(`/ai/tasks/${encodeURIComponent(task.id)}/discover`, {}, { timeout: 240000, headers: { "X-SMAJ-Silent": "true" } });
      updateTask(data.task);
    } catch (discoveryError) {
      setError(await responseMessage(discoveryError));
    } finally {
      discoveryInFlight.current.delete(task.id);
      const stored = readStoredPendingRequest();
      if (stored?.requestKey === task.requestKey) {
        try { window.sessionStorage.removeItem(PENDING_REQUEST_STORAGE_KEY); } catch { /* Ignore unavailable session storage. */ }
      }
      setBusy("");
    }
  };

  const approveActions = async (task: AiTask) => {
    if (!selectedActions.length) return;
    setBusy(`approve:${task.id}`);
    setError("");
    try {
      const { data } = await axiosClient.post<AiResponse<{ task: AiTask }>>(`/ai/tasks/${encodeURIComponent(task.id)}/approve`, {
        approved: true,
        actionIds: selectedActions,
        reviewHash: task.plan.actionReviewHash,
      });
      updateTask(data.task);
      setSelectedActions([]);
    } catch (approvalError) {
      setError(await responseMessage(approvalError));
    } finally {
      setBusy("");
    }
  };

  const retryTask = async (task: AiTask) => {
    setBusy(`retry:${task.id}`);
    setError("");
    try {
      const { data } = await axiosClient.post<AiResponse<{ task: AiTask }>>(`/ai/tasks/${encodeURIComponent(task.id)}/retry`, {});
      updateTask(data.task);
    } catch (retryError) {
      setError(await responseMessage(retryError));
    } finally {
      setBusy("");
    }
  };

  const toggleConnection = async (connection: AiConnection) => {
    if (pendingConnections.current.has(connection.serviceId)) return;
    pendingConnections.current.add(connection.serviceId);
    setConnectionBusy(current => [...current, connection.serviceId]);
    setError("");
    try {
      const { data } = await axiosClient.post<AiResponse<{ connections: AiConnection[] }>>("/ai/connections", {
        serviceId: connection.serviceId,
        connected: !connection.connected,
      });
      const updated = data.connections?.find(item => item.serviceId === connection.serviceId);
      if (!updated) throw new Error("The app connection state could not be confirmed.");
      setConnections(current => current.map(item => item.serviceId === connection.serviceId ? updated : item));
    } catch (connectionError) {
      setError(await responseMessage(connectionError));
    } finally {
      pendingConnections.current.delete(connection.serviceId);
      setConnectionBusy(current => current.filter(id => id !== connection.serviceId));
    }
  };

  const deleteTask = async (task: AiTask) => {
    if (!window.confirm("Delete this saved task?")) return;
    setBusy(`delete:${task.id}`);
    setError("");
    try {
      await axiosClient.delete(`/ai/tasks/${encodeURIComponent(task.id)}`);
      setTasks(current => current.filter(item => item.id !== task.id));
      if (active.taskId === task.id) navigate("/ai/tasks");
    } catch (deleteError) {
      setError(await responseMessage(deleteError));
    } finally {
      setBusy("");
    }
  };

  const downloadReceipt = async (task: AiTask, format: "pdf" | "json") => {
    setBusy(`receipt:${task.id}`);
    setError("");
    try {
      const { data } = await axiosClient.get<Blob>(`/ai/tasks/${encodeURIComponent(task.id)}/receipt${format === "pdf" ? "/pdf" : ""}`, {
        responseType: "blob",
      });
      const url = URL.createObjectURL(data);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `smaj-verification-${task.id}.${format}`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (receiptError) {
      setError(await responseMessage(receiptError));
    } finally {
      setBusy("");
    }
  };

  useEffect(() => {
    if (active.section !== "settings") return;
    let activeRequest = true;
    void axiosClient.get<AiResponse<{ preferences: string[] }>>("/ai/preferences", { smajSkipReadRetry: true }).then(({ data }) => {
      if (!activeRequest) return;
      const saved = Array.isArray(data.preferences) ? data.preferences : [];
      setPreferences(saved);
      setPreferencesDraft(saved.join("\n"));
      setPreferencesStatus("");
    }).catch(async failure => {
      if (activeRequest) setPreferencesStatus(await responseMessage(failure));
    });
    return () => { activeRequest = false; };
  }, [active.section]);

  const savePreferences = async (event: FormEvent) => {
    event.preventDefault();
    setPreferencesBusy(true);
    setPreferencesStatus("");
    try {
      const { data } = await axiosClient.put<AiResponse<{ preferences: string[] }>>("/ai/preferences", {
        preferences: preferencesDraft.split("\n").map(item => item.trim()).filter(Boolean),
      });
      setPreferences(data.preferences);
      setPreferencesDraft(data.preferences.join("\n"));
      setPreferencesStatus("Preferences saved.");
    } catch (failure) {
      setPreferencesStatus(await responseMessage(failure));
    } finally {
      setPreferencesBusy(false);
    }
  };

  const sectionTitle = sectionTitles[active.section];
  const isBusy = Boolean(busy);
  const orderedServices = useMemo(() => {
    const connectionById = new Map(connections.map(connection => [connection.serviceId, connection]));
    const allServices = serviceCatalog.map(service => ({ service, connection: connectionById.get(service.slug) }));
    const connected = allServices.filter(item => item.connection?.available && item.connection.connected);
    const connectedIds = new Set(connected.map(item => item.service.slug));
    return [...connected, ...allServices.filter(item => !connectedIds.has(item.service.slug))];
  }, [connections]);
  const visibleServices = showAllServices ? orderedServices : orderedServices.slice(0, 5);
  const placeholderService = serviceCatalog[placeholderIndex % serviceCatalog.length];
  const selectedServiceDefinition = serviceCatalog.find(service => service.slug === selectedService);
  const selectedConnection = connections.find(connection => connection.serviceId === selectedService);
  const selectedServiceState = !selectedConnection?.available ? "planned" : selectedConnection.connected ? "connected" : "disconnected";
  const filteredTasks = tasks.filter(task => {
    const services = [...new Set([...task.plan.services, ...(task.plan.steps || []).map(step => step.serviceId)])];
    const matchesService = taskServiceFilter === "all" || services.includes(taskServiceFilter);
    return matchesService && JSON.stringify(task).toLowerCase().includes(taskQuery.trim().toLowerCase());
  });

  return <div className="embeddedAi">
    <header className="embeddedAiHeader">
      <button className="embeddedAiBack" type="button" aria-label="Back to SMAJ PI HUB" title="Back to SMAJ PI HUB" onClick={() => navigate("/dashboard")}>
        <ArrowBackIosNewOutlinedIcon />
      </button>
      <img src="/smaj-ai-logo.png" alt="" />
      <div><strong>SMAJ AI</strong><span>{sectionTitle}</span></div>
      <div className="embeddedAiHeaderMenu" ref={navigationMenuRef}>
        <button
          type="button"
          className="embeddedAiHeaderMenuTrigger"
          aria-label="Open SMAJ AI navigation"
          aria-haspopup="menu"
          aria-expanded={navigationMenuOpen}
          onClick={() => setNavigationMenuOpen(open => !open)}
        >⋮</button>
        {navigationMenuOpen && <nav className="embeddedAiHeaderMenuDropdown" aria-label="SMAJ AI navigation" role="menu">
          {navigation.map(item => <button
            key={item.section}
            type="button"
            role="menuitem"
            aria-current={active.section === item.section ? "page" : undefined}
            className={active.section === item.section ? "active" : ""}
            onClick={() => {
              setNavigationMenuOpen(false);
              navigate(item.path);
            }}
          >{item.label}</button>)}
        </nav>}
      </div>
    </header>
    <div className="embeddedAiShell">
      <main className={`embeddedAiMain${active.taskId && active.section === "results" ? " embeddedAiMainChat" : ""}`} aria-busy={loading || isBusy}>
        {loading ? <div className="embeddedAiLoading" role="status"><span className="embeddedAiSpinner"/>Loading your SMAJ AI workspace…</div>
          : initialLoadFailed ? <div className="embeddedAiEmpty"><h2>Workspace unavailable</h2><p>Your Pi session and saved work are unchanged. Check your connection or try again.</p><button type="button" onClick={() => void loadWorkspace()}>Try again</button></div>
            : active.section === "chat" && !active.taskId ? <section className="embeddedAiChatHome launcherHome">
              <p className="embeddedAiEyebrow">YOUR WORKSPACE</p>
              <h1>What can I help you do?</h1>
              <form className="embeddedAiComposer compactComposer" onSubmit={createTask} aria-label="Create an AI task" aria-busy={busy === "create"}>
                <label className="embeddedAiSrOnly" htmlFor="embedded-ai-prompt">Your AI task</label>
                <div className="embeddedAiPromptInput">
                  <textarea ref={promptInput} id="embedded-ai-prompt" value={draft} maxLength={1900} rows={3} placeholder="" onChange={event => setDraft(event.target.value)} />
                  {!draft && <span key={placeholderService.slug}>{serviceExamples[placeholderService.slug] || "Tell SMAJ AI what you need"}…</span>}
                </div>
                <div className="embeddedAiComposerToolbar">
                  {selectedServiceDefinition && <button type="button" className="embeddedAiSelectedService" onClick={() => setSelectedService("")} aria-label={`Clear ${selectedServiceDefinition.name} context`}><EmbeddedServiceIcon service={selectedServiceDefinition}/><span>{selectedServiceDefinition.name.replace(/^SMAJ /, "")}</span><b className="embeddedAiSelectedClear" aria-hidden="true">×</b></button>}
                  <button type="submit" className="embeddedAiAskButton" disabled={!draft.trim() || isBusy}>{busy === "create" ? <><span className="embeddedAiSpinner"/>Asking AI…</> : <>Ask SMAJ AI <span aria-hidden="true">↗</span></>}</button>
                </div>
              </form>
              {selectedServiceDefinition && <div className="serviceContext" role="status"><span><strong>{selectedServiceDefinition.name}</strong> · {selectedServiceState === "planned" ? "Planned" : selectedServiceState === "connected" ? "Connected" : "Not connected"}{selectedServiceState === "planned" ? " — integration not available yet." : selectedServiceState === "disconnected" ? " — use Connect Apps to connect this app." : " — task context selected."}</span></div>}
              <div className="embeddedAiSuggestions" aria-label="Suggested requests">{[
                { label: "Find jobs", prompt: "Find software engineering jobs" },
                { label: "Shop cars", prompt: "Find cars under $30,000" },
                { label: "Explore courses", prompt: "Show available online courses" },
                { label: "Health services", prompt: "Find nearby health services" },
              ].map(suggestion => <button key={suggestion.label} type="button" onClick={() => {setSelectedService("");setDraft(suggestion.prompt);promptInput.current?.focus({preventScroll:true});}}>{suggestion.label}</button>)}</div>
              <div className="embeddedAiServicesHeading"><div><h2>Connected services</h2></div></div>
              <div className="launcherLegend" aria-label="Service status legend"><span><i className="statusDot connected"/>Connected</span><span><i className="statusDot disconnected"/>Not connected</span><span><i className="statusDot unavailable"/>Planned</span></div>
              <div id="home-services-list" className="embeddedAiServiceGrid" aria-label="Choose a service">{visibleServices.map(({ connection, service }) => {
                const state = !connection?.available ? "planned" : connection.connected ? "connected" : "disconnected";
                return <button key={service.slug} type="button" aria-pressed={selectedService === service.slug} aria-label={`${service.name}, ${state === "planned" ? "Planned" : state === "connected" ? "Connected" : "Not connected"}`} onClick={() => {setSelectedService(service.slug);setDraft(serviceExamples[service.slug] || "");promptInput.current?.focus({preventScroll:true});}}>
                  <span className="embeddedAiServiceArt"><EmbeddedServiceIcon service={service}/></span>
                  <span>{service.name.replace(/^SMAJ /, "")}<i className={`statusDot ${state === "planned" ? "unavailable" : state}`}/></span>
                </button>;
              })}</div>
              {orderedServices.length > 5 && <button type="button" className="embeddedAiShowAll" aria-expanded={showAllServices} aria-controls="home-services-list" onClick={() => setShowAllServices(value => !value)}>{showAllServices ? "Show fewer services" : "Show all services"}</button>}
            </section>
              : active.section === "apps" ? <section className="embeddedAiPage">
                <h1>Connect Apps</h1><p className="embeddedAiIntro">Choose which SMAJ services SMAJ AI may use for approved requests.</p>
                <div className="embeddedAiConnections">{connections.map(connection => {
                  const service = serviceCatalog.find(item => item.slug === connection.serviceId);
                  const pending = connectionBusy.includes(connection.serviceId);
                  return <article key={connection.serviceId}><img src={connection.serviceId === "stream" ? "/assets/smaj-stream-logo.png" : `/assets/services/${connection.serviceId}.png`} alt="" onError={event => { event.currentTarget.hidden = true; }}/><div><h2>{service?.name || connection.serviceId}</h2><p>{service?.description || "SMAJ PI HUB service"}</p><small>{!connection.available ? "Planned" : connection.connected ? "Connected" : "Not connected"}</small></div><button type="button" aria-busy={pending} disabled={!connection.available || pending} onClick={() => void toggleConnection(connection)}>{pending ? "Updating…" : connection.connected ? "Disconnect" : connection.available ? "Connect" : "Unavailable"}</button></article>;
                })}</div>
              </section>
                : active.section === "settings" ? <section className="embeddedAiPage">
                  <h1>Settings</h1><p className="embeddedAiIntro">Your SMAJ AI workspace uses your current SMAJ PI HUB account.</p>
                  <div className="embeddedAiSettings"><span>Pi account</span><strong>{user?.piUsername || user?.username || "Signed in with Pi"}</strong><span>Saved tasks</span><strong>{tasks.length}</strong><span>Connected apps</span><strong>{connections.filter(connection => connection.connected).length}</strong><button type="button" onClick={() => navigate("/settings")}>Open SMAJ PI HUB account settings</button></div>
                  <form className="embeddedAiPreferences" onSubmit={savePreferences}><h2>AI preferences</h2><p>Save up to 10 preferences to personalize recommendations. Avoid passwords, payment details, and sensitive personal information.</p><label htmlFor="embedded-ai-preferences">One preference per line</label><textarea id="embedded-ai-preferences" value={preferencesDraft} maxLength={1210} rows={5} onChange={event => setPreferencesDraft(event.target.value)} placeholder={"Remote work\nPrefer Pi-denominated prices"}/><small>{preferences.length}/10 saved</small><button type="submit" disabled={preferencesBusy}>{preferencesBusy ? "Saving…" : "Save preferences"}</button>{preferencesStatus&&<p role="status">{preferencesStatus}</p>}</form>
                </section>
                  : active.taskId?.startsWith("pending-") && pendingMessage?.id === active.taskId ? <section className="embeddedAiPage embeddedAiConversation">
                    <div className="embeddedAiConversationScroll"><div className="embeddedAiMessage user"><span>You</span><p>{pendingMessage.text}</p></div>
                      {pendingMessage.status === "sending" ? <div className="embeddedAiTyping" role="status" aria-label="SMAJ AI is responding"><img src="/smaj-ai-logo.png" alt=""/><span className="embeddedAiTypingDots" aria-hidden="true"><i/><i/><i/></span></div>
                        : <div className="embeddedAiRetryPrompt" role="status"><span>Message saved</span><button type="button" disabled={isBusy} onClick={retryPendingMessage}>Retry</button></div>}
                    </div><FollowUpComposer busy={isBusy} onSubmit={message => submitTask(message, pendingMessage.persistedConversation ? pendingMessage.conversationId : undefined)}/>
                  </section>
                    : active.taskId && resolvingTaskId === active.taskId ? <div className="embeddedAiLoading" role="status"><span className="embeddedAiSpinner"/>Restoring your saved task…</div>
                      : active.taskId ? selectedTask
                      ? <TaskConversation task={selectedTask} section={active.section} busy={isBusy} pending={pendingMessage?.conversationId === (selectedTask.conversationId || selectedTask.id) ? pendingMessage : null} retryPending={retryPendingMessage} turns={conversationTasks.filter(item => item.id !== selectedTask.id)} selectedActions={selectedActions} setSelectedActions={setSelectedActions} approveActions={approveActions} retryTask={retryTask} downloadReceipt={downloadReceipt} onFollowUp={(message:string)=>submitTask(message,selectedTask.conversationId || selectedTask.id)} />
                      : <div className="embeddedAiEmpty"><h2>Task not found</h2><p>This saved task may have been deleted, or it is not available to your Pi account.</p><button type="button" onClick={() => navigate("/ai/tasks")}>Back to All Tasks</button></div>
                    : active.section === "approvals" ? <section className="embeddedAiPage"><h1>Approvals</h1><p className="embeddedAiIntro">Review actions that SMAJ AI prepared. Nothing is submitted until you approve it.</p><TaskList tasks={tasks.filter(task => task.plan.proposedActions?.length && !task.plan.execution)} openTask={task => openTask(task)} empty="No actions are waiting for approval." /></section>
                      : active.section === "results" ? <section className="embeddedAiPage"><h1>Results</h1><p className="embeddedAiIntro">Completed searches and verified task results.</p><TaskList tasks={tasks.filter(task => task.plan.discovery || task.plan.execution)} openTask={openTask} empty="Your results will appear here after a search." /></section>
                        : active.section === "tasks" ? <section className="embeddedAiPage embeddedAiHistoryPage">
                            <h1>All Tasks</h1>
                            <div className="embeddedAiHistoryFilters">
                              <div className="embeddedAiHistoryToolbar">
                                <label className="embeddedAiHistorySearch"><span className="embeddedAiSrOnly">Search saved tasks and messages</span><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg><input type="search" value={taskQuery} onChange={event => setTaskQuery(event.target.value)} placeholder="Search saved tasks and messages"/></label>
                                <button type="button" className={`embeddedAiHistoryFilter${taskServiceFilter !== "all" ? " active" : ""}`} aria-label="Filter by service" aria-expanded={taskFilterOpen} aria-controls="embedded-ai-task-filter" onClick={() => setTaskFilterOpen(value => !value)}><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 5h16l-6.2 7.1v5.2l-3.6 1.8v-7z"/></svg></button>
                                {taskFilterOpen && <div className="embeddedAiServiceMenu" id="embedded-ai-task-filter" role="group" aria-label="Filter tasks by service">{serviceCatalog.map(service => <button type="button" key={service.slug} className={taskServiceFilter === service.slug ? "selected" : ""} aria-pressed={taskServiceFilter === service.slug} onClick={() => {setTaskServiceFilter(service.slug);setTaskFilterOpen(false);}}>{service.name.replace(/^SMAJ /, "")}</button>)}<button type="button" className="clear" onClick={() => {setTaskServiceFilter("all");setTaskFilterOpen(false);}}>Clear filter</button></div>}
                              </div>
                            </div>
                            <p className="embeddedAiHistoryIntro">Open a saved request to review its conversation, results, approvals, and status.</p>
                            <TaskHistoryList tasks={filteredTasks} busy={busy} openTask={openTask} deleteTask={deleteTask} empty={taskQuery || taskServiceFilter !== "all" ? "No tasks match your search." : "Your saved tasks will appear here."}/>
                          </section>
                            : <section className="embeddedAiPage"><h1>{sectionTitle}</h1><p className="embeddedAiIntro">Your SMAJ AI workspace.</p><TaskList tasks={tasks} openTask={openTask} empty="Your saved tasks will appear here." /></section>}
      </main>
    </div>
  </div>;
}

function TaskHistoryList({ tasks, busy, openTask, deleteTask, empty }: {
  tasks: AiTask[];
  busy: string;
  openTask: (task: AiTask) => void;
  deleteTask: (task: AiTask) => void;
  empty: string;
}) {
  if (!tasks.length) return <p className="embeddedAiHistoryEmpty">{empty}</p>;
  const grouped = new Map<string, AiTask[]>();
  for (const task of [...tasks].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))) {
    const label = dateGroup(task.createdAt);
    grouped.set(label, [...(grouped.get(label) || []), task]);
  }
  return <div className="embeddedAiHistoryGroups">{[...grouped.entries()].map(([label, entries]) => <section className="embeddedAiHistoryGroup" key={label} aria-label={label}>
    <h2>{label}</h2>
    <div>{entries.map(task => {
      const serviceIds = [...new Set([...task.plan.services, ...(task.plan.steps || []).map(step => step.serviceId)])];
      const results = task.plan.discovery?.results.reduce((total, result) => total + result.records.length, 0) || 0;
      const approvalCount = task.plan.execution ? task.plan.execution.actions?.length || 0 : task.plan.proposedActions?.length || 0;
      return <article className="embeddedAiHistoryRow" key={task.id}>
        <button type="button" className="embeddedAiHistoryOpen" onClick={() => openTask(task)}>
          <span className="embeddedAiHistoryTitle">{task.task}</span>
          <span className="embeddedAiHistoryMeta">{taskTimestamp(task.createdAt)} · {serviceIds.length ? serviceIds.map(serviceName).join(", ") : "SMAJ AI"}</span>
        </button>
        <span className={`embeddedAiHistoryStatus status-${task.plan.execution?.status || (task.plan.proposedActions?.length ? "awaiting_approval" : task.plan.discovery ? "results" : "new")}`}>{statusLabel(task.plan)}</span>
        <details className="embeddedAiHistoryMenu">
          <summary aria-label={`More actions for ${task.task}`}><span aria-hidden="true">⋮</span></summary>
          <div><button type="button" className="delete" disabled={Boolean(busy)} onClick={event => {event.currentTarget.closest("details")?.removeAttribute("open");deleteTask(task);}}>{busy === `delete:${task.id}` ? "Deleting…" : "Delete task"}</button></div>
        </details>
        {(approvalCount > 0 || task.plan.discovery || task.plan.execution?.receipt) && <div className="embeddedAiHistoryDetails">
          {approvalCount > 0 && <span>{approvalCount} {task.plan.execution ? "approved" : "pending approval"} {approvalCount === 1 ? "action" : "actions"}</span>}
          {task.plan.discovery && <span>{results} {results === 1 ? "result" : "results"}</span>}
          {task.plan.execution?.receipt && <span className="verified">Verified receipt</span>}
        </div>}
      </article>;
    })}</div>
  </section>)}</div>;
}

function TaskList({ tasks, openTask, empty }: { tasks: AiTask[]; openTask: (task: AiTask) => void; empty: string }) {
  if (!tasks.length) return <div className="embeddedAiEmpty"><p>{empty}</p></div>;
  return <div className="embeddedAiTaskList">{tasks.map(task => <button key={task.id} type="button" onClick={() => openTask(task)}>
    <span><strong>{task.task}</strong><small>{taskTime(task.createdAt)}</small></span><i>{statusLabel(task.plan)}</i>
  </button>)}</div>;
}

function TaskConversation({
  task, section, busy, pending, retryPending, turns, selectedActions, setSelectedActions, approveActions, retryTask, downloadReceipt, onFollowUp,
}: {
  task: AiTask;
  section: Section;
  busy: boolean;
  pending: PendingMessage|null;
  retryPending: () => void;
  turns: AiTask[];
  selectedActions: string[];
  setSelectedActions: (update: (current: string[]) => string[]) => void;
  approveActions: (task: AiTask) => void;
  retryTask: (task: AiTask) => void;
  downloadReceipt: (task: AiTask, format: "pdf" | "json") => void;
  onFollowUp: (message: string) => Promise<boolean>;
}) {
  const plan = task.plan;
  const execution = plan.execution;
  const showResults = section === "results";
  const pendingIsCurrentTask = pending?.id === task.id;
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const shouldFollowRef = useRef(true);
  const entries = [...turns, task]
    .filter((entry, index, all) => all.findIndex(candidate => candidate.id === entry.id) === index)
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  const latestEntryId = entries.at(-1)?.id;
  useEffect(() => {
    const scrollElement = scrollRef.current;
    const contentElement = contentRef.current;
    if (!scrollElement || !contentElement) return;
    const followLatest = () => {
      if (shouldFollowRef.current) scrollElement.scrollTop = scrollElement.scrollHeight;
    };
    const observer = new ResizeObserver(followLatest);
    observer.observe(contentElement);
    followLatest();
    return () => observer.disconnect();
  }, []);
  return <section className="embeddedAiPage embeddedAiConversation">
    <div className="embeddedAiConversationScroll" ref={scrollRef} onScroll={event => {
      const element = event.currentTarget;
      shouldFollowRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 120;
    }}>
      <div ref={contentRef}>
        <p className="embeddedAiEyebrow">{section === "results" ? "TASK RESULTS" : "CONVERSATION"} · {taskTime(task.createdAt)}</p>
        {entries.map(turn => <article className="embeddedAiThreadTurn" key={turn.id}>
          <div className="embeddedAiMessage user"><span>You · {taskTime(turn.createdAt)}</span><p>{turn.task}</p></div>
          {turn.id === pending?.id && pending.status === "failed"
            ? <div className="embeddedAiRetryPrompt" role="status"><span>Message saved</span><button type="button" disabled={busy} onClick={retryPending}>Retry</button></div>
            : turn.plan.generationStatus === "pending" && !turn.plan.summary
            ? <div className="embeddedAiTyping" role="status" aria-label="SMAJ AI is responding"><img src="/smaj-ai-logo.png" alt=""/><span className="embeddedAiTypingDots" aria-hidden="true"><i/><i/><i/></span></div>
            : <div className="embeddedAiMessage assistant"><img src="/smaj-ai-logo.png" alt=""/><div>
              <ProgressiveResponse
                text={turn.plan.generationStatus === "failed" ? turn.plan.generationError || "This response did not complete." : turn.plan.summary || "Your request is ready for review."}
                animate={turn.id === latestEntryId}
              />
              {showResults && turn.plan.discovery && <TaskResults plan={turn.plan}/>}
            </div></div>}
        </article>)}
        {pending && !entries.some(entry => entry.id === pending.id) && <article className="embeddedAiThreadTurn">
          {!pendingIsCurrentTask && <div className="embeddedAiMessage user"><span>You</span><p>{pending.text}</p></div>}
          {pending.status === "sending"
            ? <div className="embeddedAiTyping" role="status" aria-label="SMAJ AI is responding"><img src="/smaj-ai-logo.png" alt=""/><span className="embeddedAiTypingDots" aria-hidden="true"><i/><i/><i/></span></div>
            : <div className="embeddedAiRetryPrompt" role="status"><span>Message saved</span><button type="button" disabled={busy} onClick={retryPending}>Retry</button></div>}
        </article>}
      </div>
      {!pendingIsCurrentTask&&!!plan.proposedActions?.length && !execution && <section className="embeddedAiApproval"><h2>Review actions</h2><p>Choose the exact actions you approve. Nothing is submitted until you confirm.</p>{plan.proposedActions.map(action => <label key={action.id}><input type="checkbox" checked={selectedActions.includes(action.id)} onChange={event => setSelectedActions(current => event.target.checked ? [...current, action.id] : current.filter(id => id !== action.id))}/><span><strong>{action.title}</strong><small>{serviceName(action.serviceId)} · {action.recordId}</small>{action.message && <small>Exact message to seller: “{action.message}”</small>}{action.storePreview?.product && <small>Verified product: {action.storePreview.product.title} · Seller: {action.storePreview.product.sellerName} · Seller ID: {action.storePreview.product.sellerId} · {action.storePreview.product.pricePi} Pi</small>}{action.coverNote && <small>Application note: {action.coverNote}</small>}{action.applicationPreview && <small>Job: {action.applicationPreview.job.title} · {action.applicationPreview.job.company}<br/>Location: {action.applicationPreview.job.location} · {action.applicationPreview.job.type} · {action.applicationPreview.job.mode}<br/>Salary: {action.applicationPreview.job.salary} · {action.applicationPreview.job.category}<br/>Profile: {action.applicationPreview.profile.title} · {action.applicationPreview.profile.skills.join(", ") || "No listed skills"} · {action.applicationPreview.profile.location || "Location not specified"}<br/>Summary: {action.applicationPreview.profile.summary || "None"} · Portfolio: {action.applicationPreview.profile.portfolio || "None"}<br/>CV: {action.applicationPreview.cv.attached ? `${action.applicationPreview.cv.name || "Attached"} (${action.applicationPreview.cv.size || 0} bytes; ${action.applicationPreview.cv.visibility || "visibility not specified"})` : `Not attached${action.applicationPreview.cv.visibility ? ` · ${action.applicationPreview.cv.visibility}` : ""}`}</small>}</span></label>)}<button type="button" disabled={busy || !selectedActions.length || !plan.actionReviewHash} onClick={() => approveActions(task)}>Approve {selectedActions.length} selected actions</button></section>}
      {!pendingIsCurrentTask&&execution && (execution.status === "failed" && execution.retryable || execution.receipt && execution.status === "verified") && <section className="embeddedAiExecution">{execution.status === "failed" && execution.retryable && <button type="button" disabled={busy} onClick={() => retryTask(task)}><RefreshOutlinedIcon/> Retry safely</button>}{execution.receipt && execution.status === "verified" && <div><span>Verified · {execution.receipt.verifiedAt || "Complete"}</span><button type="button" disabled={busy} onClick={() => downloadReceipt(task, "pdf")}><DownloadOutlinedIcon/> Download receipt</button><button type="button" disabled={busy} onClick={() => downloadReceipt(task, "json")}>Download data</button></div>}</section>}
    </div>
    <FollowUpComposer busy={busy||Boolean(pending)} onSubmit={onFollowUp}/>
  </section>;
}

function ProgressiveResponse({ text, animate }: { text: string; animate: boolean }) {
  const animateRef = useRef(animate);
  const renderedText = useRef(animate ? "" : text);
  const [visibleText, setVisibleText] = useState(renderedText.current);
  useEffect(() => {
    if (!text) return;
    const characters = Array.from(text);
    const previousCharacters = Array.from(renderedText.current);
    const continuesPrevious = previousCharacters.length <= characters.length
      && characters.slice(0, previousCharacters.length).join("") === renderedText.current;
    let position = continuesPrevious ? previousCharacters.length : 0;
    if (!animateRef.current && position === 0) {
      renderedText.current = text;
      setVisibleText(text);
      return;
    }
    if (!continuesPrevious) {
      renderedText.current = "";
      setVisibleText("");
    }
    if (position >= characters.length) return;
    let frame = 0;
    const renderFrame = () => {
      renderedText.current += characters[position];
      position += 1;
      setVisibleText(renderedText.current);
      if (position < characters.length) frame = requestAnimationFrame(renderFrame);
    };
    frame = requestAnimationFrame(renderFrame);
    return () => cancelAnimationFrame(frame);
  }, [text]);
  return <p className="embeddedAiResponseText">{visibleText}{visibleText.length < text.length && <span className="embeddedAiTypingCursor" aria-hidden="true"/>}</p>;
}

function TaskResults({ plan }: { plan: AiPlan }) {
  return <div className="embeddedAiResults" aria-label="Task results">
    {plan.discovery?.results.map(result => <section key={result.serviceId} aria-label={`${serviceName(result.serviceId)} results`}>
      <h2>{serviceName(result.serviceId)}{result.status === "unavailable" ? " · Unavailable" : ""}</h2>
      {result.status === "unavailable" && <p className="embeddedAiInlineError">{result.error || "Results are temporarily unavailable."}</p>}
      {result.status === "read" && !result.records.length && <p>No matching listings were found.</p>}
      <div className="embeddedAiCards">{result.records.map((item, index) => {
        const record = item && typeof item === "object" ? item as Record<string, unknown> : {};
        const sample = result.serviceId === "jobs" && record.listingProvenance !== "employer_backed";
        return <article key={String(record.id || index)}>
          <strong>{String(record.title || "SMAJ PI HUB listing")}</strong>
          <span>{String(record.company || record.creatorName || record.sellerName || serviceName(result.serviceId))}</span>
          {record.salary != null && <span>{String(record.salary)}</span>}
          {record.pricePi != null && <span>{String(record.pricePi)} Pi</span>}
          {result.serviceId === "jobs" && <b>{sample ? "Sample listing · Not verified" : record.employerVerified === true ? "Verified employer" : "Employer not verified"}</b>}
        </article>;
      })}</div>
    </section>)}
  </div>;
}

function FollowUpComposer({busy,onSubmit}:{busy:boolean;onSubmit:(message:string)=>Promise<boolean>}){
  const [message,setMessage]=useState("");
  const [sending,setSending]=useState(false);
  const sendingRef=useRef(false);
  const inputRef=useRef<HTMLTextAreaElement>(null);
  useEffect(()=>{
    const input=inputRef.current;
    if(!input)return;
    input.style.height="auto";
    input.style.height=`${Math.min(input.scrollHeight,160)}px`;
    input.style.overflowY=input.scrollHeight>160?"auto":"hidden";
  },[message]);
  const submit=async(event:FormEvent)=>{event.preventDefault();const submitted=message.trim();if(!submitted||busy||sendingRef.current)return;sendingRef.current=true;setMessage("");setSending(true);try{await onSubmit(submitted);}finally{sendingRef.current=false;setSending(false);}};
  return <form className="embeddedAiFollowUp" onSubmit={submit}>
    <label className="embeddedAiSrOnly" htmlFor="embedded-ai-follow-up">Message SMAJ AI</label>
    <textarea ref={inputRef} id="embedded-ai-follow-up" value={message} maxLength={1900} rows={1} placeholder="Message SMAJ AI…" onChange={event=>setMessage(event.target.value)}/>
    <button type="submit" aria-label={busy||sending?"Sending message":"Send message"} disabled={busy||sending||!message.trim()}><SendOutlinedIcon/></button>
  </form>;
}
