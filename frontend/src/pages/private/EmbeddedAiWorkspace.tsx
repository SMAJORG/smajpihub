import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import ArrowBackIosNewOutlinedIcon from "@mui/icons-material/ArrowBackIosNewOutlined";
import SendOutlinedIcon from "@mui/icons-material/SendOutlined";
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import DownloadOutlinedIcon from "@mui/icons-material/DownloadOutlined";
import { useAuthContext } from "../../contexts/AuthContext";
import { serviceCatalog } from "../../content/serviceCatalog";
import { axiosClient } from "../../lib/axiosClient";
import { showFeedback } from "../../lib/feedback";
import "./embedded-ai.css";

type AiAction = {
  id: string;
  serviceId: string;
  recordId: string;
  kind: string;
  title: string;
  coverNote?: string;
  applicationPreview?: {
    job: { title: string; company: string; location: string; type: string; mode: string; salary: string; category: string };
    profile: { title: string; skills: string[]; location: string; portfolio: string; summary: string; profilePhoto: string };
    cv: { attached: boolean; name?: string; size?: number; visibility?: string };
  };
};
type AiPlan = {
  summary: string;
  model?: string;
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
type AiTask = { id: string; task: string; plan: AiPlan; createdAt: string; conversationId?: string };
type AiConversation = { id: string; title: string; createdAt: string; updatedAt: string; taskCount: number; latestTaskId: string; lastMessage: string };
type PendingMessage = { id: string; text: string; conversationId: string; persistedConversation: boolean; status: "sending" | "failed"; error?: string };
type AiConnection = { serviceId: string; connected: boolean; available: boolean; adapterMode: string };
type AiResponse<T> = T;
type Section = "chat" | "tasks" | "conversations" | "apps" | "approvals" | "results" | "settings";

const navigation: Array<{ section: Section; label: string; path: string }> = [
  { section: "chat", label: "Ask AI", path: "/ai" },
  { section: "conversations", label: "Conversations", path: "/ai/conversations" },
  { section: "tasks", label: "All Tasks", path: "/ai/tasks" },
  { section: "apps", label: "Connect Apps", path: "/ai/apps" },
  { section: "approvals", label: "Approvals", path: "/ai/approvals" },
  { section: "results", label: "Results", path: "/ai/results" },
  { section: "settings", label: "Settings", path: "/ai/settings" },
];

const sectionTitles: Record<Section, string> = {
  chat: "Ask AI",
  tasks: "All Tasks",
  conversations: "Conversations",
  apps: "Connect Apps",
  approvals: "Approvals",
  results: "Results",
  settings: "Settings",
};

const getSection = (path: string): { section: Section; taskId?: string } => {
  const parts = path.replace(/^\/ai\/?/, "").split("/").filter(Boolean);
  const section = navigation.find(item => item.section === parts[0] || item.path === `/ai/${parts[0]}`)?.section;
  if (!parts.length) return { section: "chat" };
  if (parts[0] === "history") return { section: "tasks" };
  if (parts[0] === "conversations" || parts[0] === "results") return { section: parts[0], taskId: parts[1] };
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

export default function EmbeddedAiWorkspace() {
  const { user } = useAuthContext();
  const location = useLocation();
  const navigate = useNavigate();
  const active = getSection(location.pathname);
  const [tasks, setTasks] = useState<AiTask[]>([]);
  const [conversations, setConversations] = useState<AiConversation[]>([]);
  const [connections, setConnections] = useState<AiConnection[]>([]);
  const [pendingMessage, setPendingMessage] = useState<PendingMessage|null>(null);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [connectionBusy, setConnectionBusy] = useState<string[]>([]);
  const pendingConnections = useRef(new Set<string>());
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
  const [conversationQuery, setConversationQuery] = useState("");
  const [taskQuery, setTaskQuery] = useState("");
  const [conversationServiceFilter, setConversationServiceFilter] = useState("all");
  const [taskServiceFilter, setTaskServiceFilter] = useState("all");
  const [conversationFilterOpen, setConversationFilterOpen] = useState(false);
  const [taskFilterOpen, setTaskFilterOpen] = useState(false);
  const [renamingConversation, setRenamingConversation] = useState("");
  const [conversationTitleDraft, setConversationTitleDraft] = useState("");

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    setInitialLoadFailed(false);
    setError("");
    try {
      const [taskResponse, connectionResponse, conversationResponse] = await Promise.all([
        axiosClient.get<AiResponse<{ tasks: AiTask[] }>>("/ai/tasks", { smajSkipReadRetry: true }),
        axiosClient.get<AiResponse<{ connections: AiConnection[] }>>("/ai/connections", { smajSkipReadRetry: true }),
        axiosClient.get<AiResponse<{ conversations: AiConversation[] }>>("/ai/conversations", { smajSkipReadRetry: true }),
      ]);
      setTasks(taskResponse.data.tasks || []);
      setConnections(connectionResponse.data.connections || []);
      setConversations(conversationResponse.data.conversations || []);
    } catch (loadError) {
      setInitialLoadFailed(true);
      setError(await responseMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadWorkspace(); }, [loadWorkspace]);
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
  const activeConversationId = active.taskId
    ? tasks.find(task => task.id === active.taskId)?.conversationId || active.taskId
    : undefined;
  const conversationTasks = useMemo(
    () => activeConversationId ? tasks.filter(task => (task.conversationId || task.id) === activeConversationId).sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)) : [],
    [activeConversationId, tasks],
  );
  const activeConversationTask = active.section === "conversations" && active.taskId
    ? conversationTasks.at(-1)
    : selectedTask;
  const updateTask = (task: AiTask) => setTasks(current => [task, ...current.filter(item => item.id !== task.id)]);
  const updateConversationForTask = (task: AiTask) => {
    const id = task.conversationId || task.id;
    setConversations(current => {
      const existing = current.find(conversation => conversation.id === id);
      return [{
        id,
        title: existing?.title || task.task.slice(0, 120),
        createdAt: existing?.createdAt || task.createdAt,
        updatedAt: task.createdAt,
        taskCount: (existing?.taskCount || 0) + 1,
        latestTaskId: task.id,
        lastMessage: task.task,
      }, ...current.filter(conversation => conversation.id !== id)];
    });
  };
  useEffect(() => {
    const task = active.section === "conversations" ? activeConversationTask : selectedTask;
    if (!task || !["queued", "running", "retrying", "verifying"].includes(task.plan.execution?.status || "")) return;
    const controller = new AbortController();
    const timer = window.setInterval(() => {
      void axiosClient.get<AiResponse<{ task: AiTask }>>(`/ai/tasks/${encodeURIComponent(task.id)}`, {
        signal: controller.signal,
        smajSkipReadRetry: true,
      }).then(({ data }) => {
        if (data.task) setTasks(current => [data.task, ...current.filter(item => item.id !== data.task.id)]);
        setError(current => current.startsWith("Task progress could not be refreshed") ? "" : current);
      }).catch(() => {
        if (!controller.signal.aborted) setError(current => current || "Task progress could not be refreshed. Your saved task is safe; try reopening it.");
      });
    }, 2500);
    return () => { window.clearInterval(timer); controller.abort(); };
  }, [active.section, activeConversationTask?.id, activeConversationTask?.plan.execution?.status, selectedTask?.id, selectedTask?.plan.execution?.status]);
  const openConversation = (conversationId: string) => {
    setSelectedActions([]);
    navigate(`/ai/conversations/${encodeURIComponent(conversationId)}`);
  };
  const openTask = (task: AiTask, section: "conversations" | "results" = "results") => {
    setSelectedActions([]);
    if (section === "conversations") openConversation(task.conversationId || task.id);
    else navigate(`/ai/${section}/${encodeURIComponent(task.id)}`);
  };

  const createTask = async (event: FormEvent) => {
    event.preventDefault();
    const request = draft.trim();
    if (!request || busy) return;
    const service = serviceCatalog.find(item => item.slug === selectedService);
    await submitTask(service ? `${service.name}: ${request}` : request);
  };

  const submitTask = async (request: string, conversationId?: string, retryPending?: PendingMessage): Promise<boolean> => {
    if (!request.trim() || busy) return false;
    const optimistic = retryPending || {
      id: `pending-${crypto.randomUUID()}`,
      text: request.trim(),
      conversationId: conversationId || crypto.randomUUID(),
      persistedConversation: Boolean(conversationId),
      status: "sending" as const,
    };
    setBusy("create");
    setError("");
    setPendingMessage({ ...optimistic, status: "sending", error: undefined });
    if (!conversationId) openConversation(optimistic.conversationId);
    try {
      const { data } = await axiosClient.post<AiResponse<{ task: AiTask }>>("/ai/tasks", { task: request.trim(), ...(conversationId ? { conversationId } : {}) }, { timeout: 150000 });
      if (!data.task?.plan) throw new Error("SMAJ AI could not answer. Please try again.");
      updateTask(data.task);
      updateConversationForTask(data.task);
      setDraft("");
      setPendingMessage(null);
      openConversation(data.task.conversationId || data.task.id);
      if (data.task.plan.services.some(id => ["jobs", "store", "stream"].includes(id))) await runDiscovery(data.task);
      return true;
    } catch (createError) {
      const message = await responseMessage(createError);
      setError(message);
      setPendingMessage(current => current?.id === optimistic.id ? { ...current, status: "failed", error: message } : current);
      return false;
    } finally {
      setBusy("");
    }
  };
  const retryPendingMessage = () => {
    if (!pendingMessage) return;
    void submitTask(pendingMessage.text, pendingMessage.persistedConversation ? pendingMessage.conversationId : undefined, pendingMessage);
  };

  const runDiscovery = async (task: AiTask) => {
    setBusy(`discover:${task.id}`);
    setError("");
    try {
      const { data } = await axiosClient.post<AiResponse<{ task: AiTask }>>(`/ai/tasks/${encodeURIComponent(task.id)}/discover`, {}, { timeout: 180000 });
      updateTask(data.task);
    } catch (discoveryError) {
      setError(await responseMessage(discoveryError));
    } finally {
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
      const conversationId = task.conversationId || task.id;
      if (!tasks.some(item => item.id !== task.id && (item.conversationId || item.id) === conversationId)) {
        setConversations(current => current.filter(item => item.id !== conversationId));
      }
      if (active.taskId === task.id) navigate("/ai/tasks");
    } catch (deleteError) {
      setError(await responseMessage(deleteError));
    } finally {
      setBusy("");
    }
  };

  const renameConversation = async (conversation: AiConversation) => {
    const title = conversationTitleDraft.trim();
    if (!title || busy) return;
    setBusy(`rename:${conversation.id}`);
    setError("");
    try {
      const { data } = await axiosClient.patch<AiResponse<{ conversation: AiConversation }>>(`/ai/conversations/${encodeURIComponent(conversation.id)}`, { title });
      setConversations(current => current.map(item => item.id === conversation.id ? data.conversation : item));
      setRenamingConversation("");
      setConversationTitleDraft("");
    } catch (renameError) {
      setError(await responseMessage(renameError));
    } finally {
      setBusy("");
    }
  };

  const deleteConversation = async (conversation: AiConversation) => {
    if (!window.confirm("Delete this conversation and all of its saved tasks?")) return;
    setBusy(`delete-conversation:${conversation.id}`);
    setError("");
    try {
      await axiosClient.delete(`/ai/conversations/${encodeURIComponent(conversation.id)}`);
      setTasks(current => current.filter(task => (task.conversationId || task.id) !== conversation.id));
      setConversations(current => current.filter(item => item.id !== conversation.id));
      if (activeConversationId === conversation.id) navigate("/ai/conversations");
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

  const sectionTitle = active.taskId
    ? active.section === "results" ? "Results" : conversations.find(conversation => conversation.id === activeConversationId)?.title || "Conversation"
    : sectionTitles[active.section];
  const isBusy = Boolean(busy);
  const orderedServices = useMemo(() => {
    const availableServices = connections.map(connection => ({
      connection,
      service: serviceCatalog.find(item => item.slug === connection.serviceId),
    })).filter((item): item is { connection: AiConnection; service: (typeof serviceCatalog)[number] } => Boolean(item.service));
    const connected = availableServices.filter(item => item.connection.available && item.connection.connected);
    const connectedIds = new Set(connected.map(item => item.connection.serviceId));
    return [...connected, ...availableServices.filter(item => !connectedIds.has(item.connection.serviceId))];
  }, [connections]);
  const visibleServices = showAllServices ? orderedServices : orderedServices.slice(0, 5);
  const placeholderService = serviceCatalog[placeholderIndex % serviceCatalog.length];
  const filteredConversations = conversations.filter(conversation => {
    const turns = tasks.filter(task => (task.conversationId || task.id) === conversation.id);
    const searchable = `${conversation.title} ${conversation.lastMessage} ${turns.map(task => `${task.task} ${task.plan.summary}`).join(" ")}`;
    const services = new Set(turns.flatMap(task => [...task.plan.services, ...(task.plan.steps || []).map(step => step.serviceId)]));
    const matchesService = conversationServiceFilter === "all" || services.has(conversationServiceFilter);
    return matchesService && searchable.toLowerCase().includes(conversationQuery.trim().toLowerCase());
  });
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
    </header>
    <div className="embeddedAiShell">
      <nav className="embeddedAiNav" aria-label="SMAJ AI workspace">
        {navigation.map(item => <button
          key={item.section}
          type="button"
          className={active.section === item.section ? "active" : ""}
          aria-current={active.section === item.section ? "page" : undefined}
          onClick={() => navigate(item.path)}
        >{item.label}</button>)}
      </nav>
      <main className="embeddedAiMain" aria-busy={loading || isBusy}>
        {loading ? <div className="embeddedAiLoading" role="status"><span className="embeddedAiSpinner"/>Loading your SMAJ AI workspace…</div>
          : initialLoadFailed ? <div className="embeddedAiEmpty"><h2>Workspace unavailable</h2><p>Your Pi session and saved work are unchanged. Check your connection or try again.</p><button type="button" onClick={() => void loadWorkspace()}>Try again</button></div>
            : active.section === "chat" && !active.taskId ? <section className="embeddedAiChatHome">
              <p className="embeddedAiEyebrow">YOUR WORKSPACE</p>
              <h1>What can I help you do?</h1>
              <form className="embeddedAiComposer" onSubmit={createTask}>
                <label className="embeddedAiSrOnly" htmlFor="embedded-ai-prompt">Your request</label>
                <div className="embeddedAiPromptInput">
                  <textarea ref={promptInput} id="embedded-ai-prompt" value={draft} maxLength={1900} rows={3} placeholder="" onChange={event => setDraft(event.target.value)} />
                  {!draft && <span key={placeholderService.slug}>{serviceExamples[placeholderService.slug] || "Tell SMAJ AI what you need"}…</span>}
                </div>
                <div className="embeddedAiComposerToolbar">
                  {selectedService && (() => {
                    const selected = serviceCatalog.find(service => service.slug === selectedService);
                    return selected && <button type="button" className="embeddedAiSelectedService" onClick={() => setSelectedService("")} aria-label={`Clear ${selected.name} context`}><img src={`/assets/services/${selected.slug}.png`} alt=""/><span>{selected.name}</span><b aria-hidden="true">×</b></button>;
                  })()}
                  <span className="embeddedAiSavedNote">Requests and progress are saved to your Pi account.</span>
                  <button type="submit" disabled={!draft.trim() || isBusy}>{busy === "create" ? <><span className="embeddedAiSpinner"/>Asking AI…</> : <>Ask SMAJ AI <SendOutlinedIcon/></>}</button>
                </div>
              </form>
              {selectedService && (() => {
                const selected = serviceCatalog.find(service => service.slug === selectedService);
                const connection = connections.find(item => item.serviceId === selectedService);
                const state = !connection?.available ? "Planned" : connection.connected ? "Connected" : "Not connected";
                return selected && <div className="embeddedAiServiceContext" role="status"><strong>{selected.name}</strong> · {state}{state === "Planned" ? " — integration not available yet." : state === "Not connected" ? " — use Connect Apps to connect this app." : " — task context selected."}</div>;
              })()}
              <div className="embeddedAiSuggestions" aria-label="Suggested requests">{[
                { label: "Find jobs", prompt: "Find software engineering jobs" },
                { label: "Shop cars", prompt: "Find cars under $30,000" },
                { label: "Explore courses", prompt: "Show available online courses" },
                { label: "Health services", prompt: "Find nearby health services" },
              ].map(suggestion => <button key={suggestion.label} type="button" onClick={() => {setSelectedService("");setDraft(suggestion.prompt);promptInput.current?.focus({preventScroll:true});}}>{suggestion.label}</button>)}</div>
              <div className="embeddedAiServicesHeading"><h2>Connected services</h2></div>
              <div className="embeddedAiServiceLegend" aria-label="Service status legend"><span><i className="connected"/>Connected</span><span><i className="disconnected"/>Not connected</span><span><i className="planned"/>Planned</span></div>
              <div className="embeddedAiServiceGrid" aria-label="Choose a service">{visibleServices.map(({ connection, service }) => {
                const state = !connection.available ? "planned" : connection.connected ? "connected" : "disconnected";
                return <button key={service.slug} type="button" aria-pressed={selectedService === service.slug} aria-label={`${service.name}, ${state === "planned" ? "Planned" : state === "connected" ? "Connected" : "Not connected"}`} onClick={() => {setSelectedService(service.slug);setDraft(serviceExamples[service.slug] || "");promptInput.current?.focus({preventScroll:true});}}>
                  <span className="embeddedAiServiceArt"><img src={service.slug === "stream" ? "/assets/smaj-stream-logo.png" : `/assets/services/${service.slug}.png`} alt="" onError={event => {event.currentTarget.hidden = true;}}/></span>
                  <span>{service.name.replace(/^SMAJ /, "")}<i className={state}/></span>
                </button>;
              })}</div>
              {orderedServices.length > 5 && <button type="button" className="embeddedAiShowAll" aria-expanded={showAllServices} onClick={() => setShowAllServices(value => !value)}>{showAllServices ? "Show fewer services" : "Show all services"}</button>}
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
                  : active.taskId ? active.section === "conversations" && (activeConversationTask || pendingMessage?.conversationId === activeConversationId)
                    ? <ConversationThread title={conversations.find(conversation => conversation.id === activeConversationId)?.title || "Conversation"} turns={conversationTasks} latestTask={activeConversationTask} pending={pendingMessage?.conversationId === activeConversationId ? pendingMessage : null} retryPending={retryPendingMessage} openTask={task => openTask(task, "results")} onFollowUp={message => submitTask(message, activeConversationTask?.conversationId || activeConversationId)} busy={isBusy}/>
                    : selectedTask
                      ? <TaskConversation task={selectedTask} section={active.section} busy={isBusy} pending={pendingMessage?.conversationId === selectedTask.conversationId ? pendingMessage : null} retryPending={retryPendingMessage} selectedActions={selectedActions} setSelectedActions={setSelectedActions} runDiscovery={runDiscovery} approveActions={approveActions} retryTask={retryTask} downloadReceipt={downloadReceipt} deleteTask={deleteTask} onFollowUp={(message:string)=>submitTask(message,selectedTask.conversationId)} />
                      : <div className="embeddedAiEmpty"><h2>{active.section === "conversations" ? "Conversation not found" : "Task not found"}</h2><p>This saved work may have been deleted, or it is not available to your Pi account.</p><button type="button" onClick={() => navigate(active.section === "conversations" ? "/ai/conversations" : "/ai/tasks")}>Back to {active.section === "conversations" ? "Conversations" : "All Tasks"}</button></div>
                    : active.section === "approvals" ? <section className="embeddedAiPage"><h1>Approvals</h1><p className="embeddedAiIntro">Review actions that SMAJ AI prepared. Nothing is submitted until you approve it.</p><TaskList tasks={tasks.filter(task => task.plan.proposedActions?.length && !task.plan.execution)} openTask={task => openTask(task)} empty="No actions are waiting for approval." /></section>
                      : active.section === "results" ? <section className="embeddedAiPage"><h1>Results</h1><p className="embeddedAiIntro">Completed searches and verified task results.</p><TaskList tasks={tasks.filter(task => task.plan.discovery || task.plan.execution)} openTask={task => openTask(task, "results")} empty="Your results will appear here after a search." /></section>
                        : active.section === "conversations" ? <section className="embeddedAiPage embeddedAiHistoryPage">
                          <h1>Conversations</h1>
                          <div className="embeddedAiHistoryFilters">
                            <div className="embeddedAiHistoryToolbar">
                              <label className="embeddedAiHistorySearch"><span className="embeddedAiSrOnly">Search conversations</span><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg><input type="search" value={conversationQuery} onChange={event => setConversationQuery(event.target.value)} placeholder="Search conversations"/></label>
                              <button type="button" className={`embeddedAiHistoryFilter${conversationServiceFilter !== "all" ? " active" : ""}`} aria-label="Filter by service" aria-expanded={conversationFilterOpen} aria-controls="embedded-ai-conversation-filter" onClick={() => setConversationFilterOpen(value => !value)}><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 5h16l-6.2 7.1v5.2l-3.6 1.8v-7z"/></svg></button>
                              {conversationFilterOpen && <div className="embeddedAiServiceMenu" id="embedded-ai-conversation-filter" role="group" aria-label="Filter conversations by service">{serviceCatalog.map(service => <button type="button" key={service.slug} className={conversationServiceFilter === service.slug ? "selected" : ""} aria-pressed={conversationServiceFilter === service.slug} onClick={() => {setConversationServiceFilter(service.slug);setConversationFilterOpen(false);}}>{service.name.replace(/^SMAJ /, "")}</button>)}<button type="button" className="clear" onClick={() => {setConversationServiceFilter("all");setConversationFilterOpen(false);}}>Clear filter</button></div>}
                            </div>
                          </div>
                          <p className="embeddedAiHistoryIntro">Open a saved request to review its conversation, results, approvals, and status.</p>
                          <ConversationList conversations={filteredConversations} tasks={tasks} openConversation={openConversation} renameConversation={conversation => {setRenamingConversation(conversation.id);setConversationTitleDraft(conversation.title);}} deleteConversation={deleteConversation} renamingConversation={renamingConversation} conversationTitleDraft={conversationTitleDraft} setConversationTitleDraft={setConversationTitleDraft} saveRename={renameConversation} cancelRename={() => {setRenamingConversation("");setConversationTitleDraft("");}} busy={busy} empty={conversationQuery || conversationServiceFilter !== "all" ? "No conversations match your search." : "Your saved conversations will appear here."}/>
                        </section>
                          : active.section === "tasks" ? <section className="embeddedAiPage embeddedAiHistoryPage">
                            <h1>All Tasks</h1>
                            <div className="embeddedAiHistoryFilters">
                              <div className="embeddedAiHistoryToolbar">
                                <label className="embeddedAiHistorySearch"><span className="embeddedAiSrOnly">Search saved tasks</span><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg><input type="search" value={taskQuery} onChange={event => setTaskQuery(event.target.value)} placeholder="Search conversations and tasks"/></label>
                                <button type="button" className={`embeddedAiHistoryFilter${taskServiceFilter !== "all" ? " active" : ""}`} aria-label="Filter by service" aria-expanded={taskFilterOpen} aria-controls="embedded-ai-task-filter" onClick={() => setTaskFilterOpen(value => !value)}><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 5h16l-6.2 7.1v5.2l-3.6 1.8v-7z"/></svg></button>
                                {taskFilterOpen && <div className="embeddedAiServiceMenu" id="embedded-ai-task-filter" role="group" aria-label="Filter tasks by service">{serviceCatalog.map(service => <button type="button" key={service.slug} className={taskServiceFilter === service.slug ? "selected" : ""} aria-pressed={taskServiceFilter === service.slug} onClick={() => {setTaskServiceFilter(service.slug);setTaskFilterOpen(false);}}>{service.name.replace(/^SMAJ /, "")}</button>)}<button type="button" className="clear" onClick={() => {setTaskServiceFilter("all");setTaskFilterOpen(false);}}>Clear filter</button></div>}
                              </div>
                            </div>
                            <p className="embeddedAiHistoryIntro">Open a saved request to review its conversation, results, approvals, and status.</p>
                            <TaskHistoryList tasks={filteredTasks} busy={busy} openTask={task => openTask(task, "results")} deleteTask={deleteTask} empty={taskQuery || taskServiceFilter !== "all" ? "No tasks match your search." : "Your saved tasks will appear here."}/>
                          </section>
                            : <section className="embeddedAiPage"><h1>{sectionTitle}</h1><p className="embeddedAiIntro">Your SMAJ AI workspace.</p><TaskList tasks={tasks} openTask={task => openTask(task)} empty="Your saved conversations will appear here." /></section>}
      </main>
    </div>
  </div>;
}

function ConversationList({
  conversations, tasks, openConversation, empty, renameConversation, deleteConversation, renamingConversation,
  conversationTitleDraft, setConversationTitleDraft, saveRename, cancelRename, busy,
}: {
  conversations: AiConversation[];
  tasks: AiTask[];
  openConversation: (id: string) => void;
  empty: string;
  renameConversation?: (conversation: AiConversation) => void;
  deleteConversation?: (conversation: AiConversation) => void;
  renamingConversation?: string;
  conversationTitleDraft?: string;
  setConversationTitleDraft?: (value: string) => void;
  saveRename?: (conversation: AiConversation) => void;
  cancelRename?: () => void;
  busy?: string;
}) {
  if (!conversations.length) return <p className="embeddedAiHistoryEmpty">{empty}</p>;
  const grouped = new Map<string, AiConversation[]>();
  for (const conversation of [...conversations].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))) {
    const label = dateGroup(conversation.updatedAt);
    grouped.set(label, [...(grouped.get(label) || []), conversation]);
  }
  return <div className="embeddedAiHistoryGroups">{[...grouped.entries()].map(([label, entries]) => <section className="embeddedAiHistoryGroup" key={label} aria-label={label}>
    <h2>{label}</h2>
    <div>{entries.map(conversation => {
      const editing = renamingConversation === conversation.id && setConversationTitleDraft && saveRename;
      const menuId = `conversation:${conversation.id}`;
      const serviceIds = [...new Set(tasks.filter(task => (task.conversationId || task.id) === conversation.id).flatMap(task => [...task.plan.services, ...(task.plan.steps || []).map(step => step.serviceId)]))];
      return <article className="embeddedAiHistoryRow" key={menuId}>
        {editing
          ? <form className="embeddedAiRenameForm" onSubmit={event => {event.preventDefault(); saveRename(conversation);}}>
            <label className="embeddedAiSrOnly" htmlFor={`conversation-title-${conversation.id}`}>Conversation name</label>
            <input id={`conversation-title-${conversation.id}`} value={conversationTitleDraft || ""} maxLength={120} onChange={event => setConversationTitleDraft(event.target.value)} autoFocus/>
            <button type="submit" disabled={!conversationTitleDraft?.trim() || busy === `rename:${conversation.id}`}>{busy === `rename:${conversation.id}` ? "Saving…" : "Save"}</button>
            <button type="button" className="secondary" onClick={cancelRename}>Cancel</button>
          </form>
          : <>
            <button type="button" className="embeddedAiHistoryOpen" onClick={() => openConversation(conversation.id)}>
              <span className="embeddedAiHistoryTitle">{conversation.title}</span>
              <span className="embeddedAiHistoryMeta">{taskTimestamp(conversation.updatedAt)} · {serviceIds.length ? serviceIds.map(serviceName).join(", ") : "SMAJ AI"}</span>
              <span className="embeddedAiHistoryPreview">{conversation.lastMessage}</span>
            </button>
            <details className="embeddedAiHistoryMenu">
              <summary aria-label={`More actions for ${conversation.title}`}><span aria-hidden="true">⋮</span></summary>
              <div>
                <button type="button" disabled={Boolean(busy)} onClick={event => {event.currentTarget.closest("details")?.removeAttribute("open");openConversation(conversation.id);}}>Open/Continue</button>
                {renameConversation && <button type="button" disabled={Boolean(busy)} onClick={event => {event.currentTarget.closest("details")?.removeAttribute("open");renameConversation(conversation);}}>Rename</button>}
                {deleteConversation && <button type="button" className="delete" disabled={Boolean(busy)} onClick={event => {event.currentTarget.closest("details")?.removeAttribute("open");deleteConversation(conversation);}}>Delete</button>}
              </div>
            </details>
          </>}
      </article>;
    })}</div>
  </section>)}</div>;
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

function ConversationThread({ title, turns, latestTask, pending, retryPending, openTask, onFollowUp, busy }: {
  title: string;
  turns: AiTask[];
  latestTask?: AiTask;
  pending: PendingMessage|null;
  retryPending: () => void;
  openTask: (task: AiTask) => void;
  onFollowUp: (message: string) => Promise<boolean>;
  busy: boolean;
}) {
  return <section className="embeddedAiPage embeddedAiConversation">
    <h1>{title}</h1><p className="embeddedAiIntro">Saved conversation · {turns.length} {turns.length === 1 ? "message" : "messages"}</p>
    {turns.map(task => <article className="embeddedAiThreadTurn" key={task.id}>
      <div className="embeddedAiMessage user"><span>You · {taskTime(task.createdAt)}</span><p>{task.task}</p></div>
      <div className="embeddedAiMessage assistant"><img src="/smaj-ai-logo.png" alt="" /><div><p>{task.plan.summary || "Your request is ready for review."}</p><small className="embeddedAiTurnStatus">{statusLabel(task.plan)}</small><button type="button" className="embeddedAiViewTask" onClick={() => openTask(task)}>View task details</button></div></div>
    </article>)}
    {pending&&<article className="embeddedAiThreadTurn" key={pending.id}>
      <div className="embeddedAiMessage user"><span>You</span><p>{pending.text}</p></div>
      {pending.status === "sending"
        ? <div className="embeddedAiTyping" role="status" aria-label="SMAJ AI is responding"><img src="/smaj-ai-logo.png" alt=""/><span className="embeddedAiTypingDots" aria-hidden="true"><i/><i/><i/></span></div>
        : <div className="embeddedAiSendFailure" role="alert"><span>{pending.error || "SMAJ AI could not answer. Please try again."}</span><button type="button" disabled={busy} onClick={retryPending}>Retry</button></div>}
    </article>}
    {latestTask&&<FollowUpComposer key={latestTask.conversationId || latestTask.id} busy={busy||Boolean(pending)} onSubmit={onFollowUp}/>}
  </section>;
}

function TaskList({ tasks, openTask, empty }: { tasks: AiTask[]; openTask: (task: AiTask) => void; empty: string }) {
  if (!tasks.length) return <div className="embeddedAiEmpty"><p>{empty}</p></div>;
  return <div className="embeddedAiTaskList">{tasks.map(task => <button key={task.id} type="button" onClick={() => openTask(task)}>
    <span><strong>{task.task}</strong><small>{taskTime(task.createdAt)}</small></span><i>{statusLabel(task.plan)}</i>
  </button>)}</div>;
}

function TaskConversation({
  task, section, busy, pending, retryPending, selectedActions, setSelectedActions, runDiscovery, approveActions, retryTask, downloadReceipt, deleteTask, onFollowUp,
}: {
  task: AiTask;
  section: Section;
  busy: boolean;
  pending: PendingMessage|null;
  retryPending: () => void;
  selectedActions: string[];
  setSelectedActions: (update: (current: string[]) => string[]) => void;
  runDiscovery: (task: AiTask) => void;
  approveActions: (task: AiTask) => void;
  retryTask: (task: AiTask) => void;
  downloadReceipt: (task: AiTask, format: "pdf" | "json") => void;
  deleteTask: (task: AiTask) => void;
  onFollowUp: (message: string) => Promise<boolean>;
}) {
  const plan = task.plan;
  const execution = plan.execution;
  const showResults = section === "results" || section === "conversations";
  return <section className="embeddedAiPage embeddedAiConversation">
    <p className="embeddedAiEyebrow">{section === "results" ? "TASK RESULTS" : "CONVERSATION"} · {taskTime(task.createdAt)}</p>
    <div className="embeddedAiMessage user"><span>You</span><p>{task.task}</p></div>
    <div className="embeddedAiMessage assistant"><img src="/smaj-ai-logo.png" alt="" /><div><p>{plan.summary || "Your request is ready for review."}</p></div></div>
    {pending&&<article className="embeddedAiThreadTurn">
      <div className="embeddedAiMessage user"><span>You</span><p>{pending.text}</p></div>
      {pending.status === "sending"
        ? <div className="embeddedAiTyping" role="status" aria-label="SMAJ AI is responding"><img src="/smaj-ai-logo.png" alt=""/><span className="embeddedAiTypingDots" aria-hidden="true"><i/><i/><i/></span></div>
        : <div className="embeddedAiSendFailure" role="alert"><span>{pending.error || "SMAJ AI could not answer. Please try again."}</span><button type="button" disabled={busy} onClick={retryPending}>Retry</button></div>}
    </article>}
    {!!plan.steps?.length && <section className="embeddedAiPlan"><h2>Plan</h2>{plan.steps.map(step => <article key={`${step.serviceId}:${step.title}`}><strong>{step.title}</strong><span>{serviceName(step.serviceId)} · {step.status.replaceAll("_", " ")}</span>{step.description && <p>{step.description}</p>}{step.reason && <small>{step.reason}</small>}</article>)}</section>}
    {!!plan.sources?.length && <details className="embeddedAiSources"><summary>Sources used</summary>{plan.sources.map(source => <p key={`${source.file}:${source.title}`}>{source.title} · {source.file}</p>)}</details>}
    {!!plan.warnings?.length && <div className="embeddedAiWarnings">{plan.warnings.map((warning, index) => <p key={`${index}:${warning}`}>{warning}</p>)}</div>}
    {plan.summaryError && <p className="embeddedAiInlineError" role="alert">{plan.summaryError.message}</p>}
    {showResults && plan.discovery && <section className="embeddedAiResults"><h2>Live results</h2>{plan.discovery.results.map(result => <section key={result.serviceId}><h3>{serviceName(result.serviceId)} · {result.status === "read" ? "Results" : "Unavailable"}</h3>{result.error && <p className="embeddedAiInlineError">{result.error}</p>}{result.status === "read" && !result.records.length && <p>No matching listings were found.</p>}<div className="embeddedAiCards">{result.records.map((item, index) => {
      const record = item && typeof item === "object" ? item as Record<string, unknown> : {};
      const sample = result.serviceId === "jobs" && record.listingProvenance !== "employer_backed";
      return <article key={String(record.id || index)}><strong>{String(record.title || "SMAJ PI HUB listing")}</strong><span>{String(record.company || record.creatorName || record.sellerName || serviceName(result.serviceId))}</span>{record.salary != null && <span>{String(record.salary)}</span>}{result.serviceId === "jobs" && <b>{sample ? "Sample listing · Not verified" : record.employerVerified === true ? "Verified employer" : "Employer not verified"}</b>}</article>;
    })}</div></section>)}</section>}
    {!plan.discovery && plan.services?.some(id => ["jobs", "store", "stream"].includes(id)) && !execution && <div className="embeddedAiApproval"><strong>Public search is ready</strong><p>SMAJ AI reads published listings only. No purchase or application will be made.</p><button type="button" disabled={busy} onClick={() => runDiscovery(task)}>{busy ? "Searching…" : "Search public listings"}</button></div>}
    {!!plan.proposedActions?.length && !execution && <section className="embeddedAiApproval"><h2>Review actions</h2><p>Choose the exact actions you approve. Nothing is submitted until you confirm.</p>{plan.proposedActions.map(action => <label key={action.id}><input type="checkbox" checked={selectedActions.includes(action.id)} onChange={event => setSelectedActions(current => event.target.checked ? [...current, action.id] : current.filter(id => id !== action.id))}/><span><strong>{action.title}</strong><small>{serviceName(action.serviceId)} · {action.recordId}</small>{action.coverNote && <small>Application note: {action.coverNote}</small>}{action.applicationPreview && <small>Job: {action.applicationPreview.job.title} · {action.applicationPreview.job.company}<br/>Location: {action.applicationPreview.job.location} · {action.applicationPreview.job.type} · {action.applicationPreview.job.mode}<br/>Salary: {action.applicationPreview.job.salary} · {action.applicationPreview.job.category}<br/>Profile: {action.applicationPreview.profile.title} · {action.applicationPreview.profile.skills.join(", ") || "No listed skills"} · {action.applicationPreview.profile.location || "Location not specified"}<br/>Summary: {action.applicationPreview.profile.summary || "None"} · Portfolio: {action.applicationPreview.profile.portfolio || "None"}<br/>CV: {action.applicationPreview.cv.attached ? `${action.applicationPreview.cv.name || "Attached"} (${action.applicationPreview.cv.size || 0} bytes; ${action.applicationPreview.cv.visibility || "visibility not specified"})` : `Not attached${action.applicationPreview.cv.visibility ? ` · ${action.applicationPreview.cv.visibility}` : ""}`}</small>}</span></label>)}<button type="button" disabled={busy || !selectedActions.length || !plan.actionReviewHash} onClick={() => approveActions(task)}>Approve {selectedActions.length} selected actions</button></section>}
    {execution && <section className="embeddedAiExecution"><h2>Task status · {execution.status.replaceAll("_", " ")}</h2>{execution.error && <p className="embeddedAiInlineError" role="alert">{execution.error}</p>}{execution.events?.map((event, index) => <p key={`${event.at}:${index}`}>{event.message}</p>)}{execution.status === "failed" && execution.retryable && <button type="button" disabled={busy} onClick={() => retryTask(task)}><RefreshOutlinedIcon/> Retry safely</button>}{execution.receipt && execution.status === "verified" && <div><p>Independently verified · {execution.receipt.verifiedAt || "Verified"}</p><button type="button" disabled={busy} onClick={() => downloadReceipt(task, "pdf")}><DownloadOutlinedIcon/> Download PDF receipt</button><button type="button" disabled={busy} onClick={() => downloadReceipt(task, "json")}>Download verification data</button></div>}</section>}
    <FollowUpComposer busy={busy||Boolean(pending)} onSubmit={onFollowUp}/>
    <div className="embeddedAiConversationActions"><span>{statusLabel(plan)}</span><button type="button" disabled={busy} onClick={() => deleteTask(task)}><DeleteOutlineOutlinedIcon/> Delete task</button></div>
  </section>;
}

function FollowUpComposer({busy,onSubmit}:{busy:boolean;onSubmit:(message:string)=>Promise<boolean>}){
  const [message,setMessage]=useState("");
  const [sending,setSending]=useState(false);
  const submit=async(event:FormEvent)=>{event.preventDefault();if(!message.trim()||busy||sending)return;setSending(true);try{if(await onSubmit(message.trim()))setMessage("");}finally{setSending(false);}};
  return <form className="embeddedAiFollowUp" onSubmit={submit}>
    <label htmlFor="embedded-ai-follow-up">Continue this conversation</label>
    <textarea id="embedded-ai-follow-up" value={message} maxLength={1900} rows={2} placeholder="Ask a follow-up or refine your request" onChange={event=>setMessage(event.target.value)}/>
    <button type="submit" disabled={busy||sending||!message.trim()}>{busy||sending?"Working…":"Send follow-up"} <SendOutlinedIcon/></button>
  </form>;
}
