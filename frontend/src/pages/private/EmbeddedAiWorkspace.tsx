import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import ArrowBackIosNewOutlinedIcon from "@mui/icons-material/ArrowBackIosNewOutlined";
import SendOutlinedIcon from "@mui/icons-material/SendOutlined";
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import DownloadOutlinedIcon from "@mui/icons-material/DownloadOutlined";
import { useAuthContext } from "../../contexts/AuthContext";
import { serviceCatalog } from "../../content/serviceCatalog";
import { axiosClient } from "../../lib/axiosClient";
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
    receipt?: { verifiedAt?: string };
    events?: Array<{ at: string; message: string }>;
  };
};
type AiTask = { id: string; task: string; plan: AiPlan; createdAt: string };
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
  if (plan.execution?.status) return plan.execution.status.replaceAll("_", " ");
  if (plan.proposedActions?.length) return "Awaiting approval";
  if (plan.discovery) return "Results ready";
  return "New";
};

const serviceName = (id: string) => serviceCatalog.find(service => service.slug === id)?.name || id;
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

export default function EmbeddedAiWorkspace() {
  const { user } = useAuthContext();
  const location = useLocation();
  const navigate = useNavigate();
  const active = getSection(location.pathname);
  const [tasks, setTasks] = useState<AiTask[]>([]);
  const [connections, setConnections] = useState<AiConnection[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [selectedActions, setSelectedActions] = useState<string[]>([]);
  const [initialLoadFailed, setInitialLoadFailed] = useState(false);

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    setInitialLoadFailed(false);
    setError("");
    try {
      const [taskResponse, connectionResponse] = await Promise.all([
        axiosClient.get<AiResponse<{ tasks: AiTask[] }>>("/ai/tasks", { smajSkipReadRetry: true }),
        axiosClient.get<AiResponse<{ connections: AiConnection[] }>>("/ai/connections", { smajSkipReadRetry: true }),
      ]);
      setTasks(taskResponse.data.tasks || []);
      setConnections(connectionResponse.data.connections || []);
    } catch (loadError) {
      setInitialLoadFailed(true);
      setError(await responseMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadWorkspace(); }, [loadWorkspace]);

  const selectedTask = useMemo(
    () => active.taskId ? tasks.find(task => task.id === active.taskId) : undefined,
    [active.taskId, tasks],
  );
  const updateTask = (task: AiTask) => setTasks(current => [task, ...current.filter(item => item.id !== task.id)]);
  useEffect(() => {
    const task = selectedTask;
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
  }, [selectedTask?.id, selectedTask?.plan.execution?.status]);
  const openTask = (task: AiTask, section: "conversations" | "results" = "conversations") => {
    setSelectedActions([]);
    navigate(`/ai/${section}/${encodeURIComponent(task.id)}`);
  };

  const createTask = async (event: FormEvent) => {
    event.preventDefault();
    const request = draft.trim();
    if (!request || busy) return;
    setBusy("create");
    setError("");
    try {
      const { data } = await axiosClient.post<AiResponse<{ task: AiTask }>>("/ai/tasks", { task: request }, { timeout: 150000 });
      updateTask(data.task);
      setDraft("");
      openTask(data.task);
    } catch (createError) {
      setError(await responseMessage(createError));
    } finally {
      setBusy("");
    }
  };

  const runDiscovery = async (task: AiTask) => {
    setBusy(`discover:${task.id}`);
    setError("");
    try {
      const { data } = await axiosClient.post<AiResponse<{ task: AiTask }>>(`/ai/tasks/${encodeURIComponent(task.id)}/discover`, { approved: true }, { timeout: 180000 });
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
    setBusy(`connection:${connection.serviceId}`);
    setError("");
    try {
      const { data } = await axiosClient.post<AiResponse<{ connections: AiConnection[] }>>("/ai/connections", {
        serviceId: connection.serviceId,
        connected: !connection.connected,
      });
      setConnections(data.connections || []);
    } catch (connectionError) {
      setError(await responseMessage(connectionError));
    } finally {
      setBusy("");
    }
  };

  const deleteTask = async (task: AiTask) => {
    if (!window.confirm("Delete this saved task and its conversation?")) return;
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

  const sectionTitle = active.taskId
    ? active.section === "results" ? "Results" : "Conversation"
    : sectionTitles[active.section];
  const isBusy = Boolean(busy);

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
      {error && <div className="embeddedAiError" role="alert">{error}<button type="button" onClick={() => setError("")} aria-label="Dismiss error">×</button></div>}
      <main className="embeddedAiMain" aria-busy={loading || isBusy}>
        {loading ? <div className="embeddedAiLoading" role="status"><span className="embeddedAiSpinner"/>Loading your SMAJ AI workspace…</div>
          : initialLoadFailed ? <div className="embeddedAiEmpty"><h2>Workspace unavailable</h2><p>Your Pi session and saved work are unchanged. Check your connection or try again.</p><button type="button" onClick={() => void loadWorkspace()}>Try again</button></div>
            : active.section === "chat" && !active.taskId ? <section className="embeddedAiChatHome">
              <p className="embeddedAiEyebrow">YOUR SMAJ AI WORKSPACE</p>
              <h1>What can I help you do?</h1>
              <p className="embeddedAiIntro">Describe a request. Review the plan, approve any actions, and track the result here.</p>
              <form className="embeddedAiComposer" onSubmit={createTask}>
                <label className="embeddedAiSrOnly" htmlFor="embedded-ai-prompt">Your request</label>
                <textarea id="embedded-ai-prompt" value={draft} maxLength={1900} rows={3} placeholder="Ask SMAJ AI anything…" onChange={event => setDraft(event.target.value)} />
                <div><span>Requests and progress are saved to your Pi account.</span><button type="submit" disabled={!draft.trim() || isBusy}>{busy === "create" ? <><span className="embeddedAiSpinner"/>Thinking…</> : <>Ask SMAJ AI <SendOutlinedIcon/></>}</button></div>
              </form>
              <div className="embeddedAiSuggestions">{["Find verified jobs for me", "Compare products in the Store", "Find creator videos on Stream"].map(text => <button key={text} type="button" disabled={isBusy} onClick={() => setDraft(text)}>{text}</button>)}</div>
              <TaskList tasks={tasks.slice(0, 5)} openTask={task => openTask(task)} empty="Your conversations will appear here." />
            </section>
              : active.section === "apps" ? <section className="embeddedAiPage">
                <h1>Connect Apps</h1><p className="embeddedAiIntro">Choose which SMAJ services SMAJ AI may use for approved requests.</p>
                <div className="embeddedAiConnections">{connections.map(connection => {
                  const service = serviceCatalog.find(item => item.slug === connection.serviceId);
                  const pending = busy === `connection:${connection.serviceId}`;
                  return <article key={connection.serviceId}><img src={connection.serviceId === "stream" ? "/assets/smaj-stream-logo.png" : `/assets/services/${connection.serviceId}.png`} alt="" onError={event => { event.currentTarget.hidden = true; }}/><div><h2>{service?.name || connection.serviceId}</h2><p>{service?.description || "SMAJ PI HUB service"}</p><small>{!connection.available ? "Planned" : connection.connected ? "Connected" : "Not connected"}</small></div><button type="button" disabled={!connection.available || pending || isBusy} onClick={() => void toggleConnection(connection)}>{pending ? "Updating…" : connection.connected ? "Disconnect" : connection.available ? "Connect" : "Unavailable"}</button></article>;
                })}</div>
              </section>
                : active.section === "settings" ? <section className="embeddedAiPage">
                  <h1>Settings</h1><p className="embeddedAiIntro">Your SMAJ AI workspace uses your current SMAJ PI HUB account.</p>
                  <div className="embeddedAiSettings"><span>Pi account</span><strong>{user?.piUsername || user?.username || "Signed in with Pi"}</strong><span>Saved tasks</span><strong>{tasks.length}</strong><span>Connected apps</span><strong>{connections.filter(connection => connection.connected).length}</strong><button type="button" onClick={() => navigate("/settings")}>Open SMAJ PI HUB account settings</button></div>
                </section>
                  : active.taskId ? selectedTask
                    ? <TaskConversation task={selectedTask} section={active.section} busy={isBusy} selectedActions={selectedActions} setSelectedActions={setSelectedActions} runDiscovery={runDiscovery} approveActions={approveActions} retryTask={retryTask} downloadReceipt={downloadReceipt} deleteTask={deleteTask} />
                    : <div className="embeddedAiEmpty"><h2>Conversation not found</h2><p>This saved task may have been deleted, or it is not available to your Pi account.</p><button type="button" onClick={() => navigate("/ai")}>Back to Ask AI</button></div>
                    : active.section === "approvals" ? <section className="embeddedAiPage"><h1>Approvals</h1><p className="embeddedAiIntro">Review actions that SMAJ AI prepared. Nothing is submitted until you approve it.</p><TaskList tasks={tasks.filter(task => task.plan.proposedActions?.length && !task.plan.execution)} openTask={task => openTask(task)} empty="No actions are waiting for approval." /></section>
                      : active.section === "results" ? <section className="embeddedAiPage"><h1>Results</h1><p className="embeddedAiIntro">Completed searches and verified task results.</p><TaskList tasks={tasks.filter(task => task.plan.discovery || task.plan.execution)} openTask={task => openTask(task, "results")} empty="Your results will appear here after a search." /></section>
                        : <section className="embeddedAiPage"><h1>{sectionTitle}</h1><p className="embeddedAiIntro">{active.section === "tasks" ? "Saved tasks, progress, and results." : "Your saved SMAJ AI conversations."}</p><TaskList tasks={tasks} openTask={task => openTask(task)} empty="Your saved conversations will appear here." /></section>}
      </main>
    </div>
  </div>;
}

function TaskList({ tasks, openTask, empty }: { tasks: AiTask[]; openTask: (task: AiTask) => void; empty: string }) {
  if (!tasks.length) return <div className="embeddedAiEmpty"><p>{empty}</p></div>;
  return <div className="embeddedAiTaskList">{tasks.map(task => <button key={task.id} type="button" onClick={() => openTask(task)}>
    <span><strong>{task.task}</strong><small>{taskTime(task.createdAt)}</small></span><i>{statusLabel(task.plan)}</i>
  </button>)}</div>;
}

function TaskConversation({
  task, section, busy, selectedActions, setSelectedActions, runDiscovery, approveActions, retryTask, downloadReceipt, deleteTask,
}: {
  task: AiTask;
  section: Section;
  busy: boolean;
  selectedActions: string[];
  setSelectedActions: (update: (current: string[]) => string[]) => void;
  runDiscovery: (task: AiTask) => void;
  approveActions: (task: AiTask) => void;
  retryTask: (task: AiTask) => void;
  downloadReceipt: (task: AiTask, format: "pdf" | "json") => void;
  deleteTask: (task: AiTask) => void;
}) {
  const plan = task.plan;
  const execution = plan.execution;
  const showResults = section === "results" || section === "conversations";
  return <section className="embeddedAiPage embeddedAiConversation">
    <p className="embeddedAiEyebrow">{section === "results" ? "TASK RESULTS" : "CONVERSATION"} · {taskTime(task.createdAt)}</p>
    <div className="embeddedAiMessage user"><span>You</span><p>{task.task}</p></div>
    <div className="embeddedAiMessage assistant"><img src="/smaj-ai-logo.png" alt="" /><div><span>SMAJ AI · {plan.model || "Meta AI"}</span><p>{plan.summary || "Your request is ready for review."}</p></div></div>
    {!!plan.steps?.length && <section className="embeddedAiPlan"><h2>Plan</h2>{plan.steps.map(step => <article key={`${step.serviceId}:${step.title}`}><strong>{step.title}</strong><span>{serviceName(step.serviceId)} · {step.status.replaceAll("_", " ")}</span>{step.description && <p>{step.description}</p>}{step.reason && <small>{step.reason}</small>}</article>)}</section>}
    {!!plan.sources?.length && <details className="embeddedAiSources"><summary>Sources used</summary>{plan.sources.map(source => <p key={`${source.file}:${source.title}`}>{source.title} · {source.file}</p>)}</details>}
    {!!plan.warnings?.length && <div className="embeddedAiWarnings">{plan.warnings.map((warning, index) => <p key={`${index}:${warning}`}>{warning}</p>)}</div>}
    {plan.summaryError && <p className="embeddedAiInlineError" role="alert">{plan.summaryError.message}</p>}
    {showResults && plan.discovery && <section className="embeddedAiResults"><h2>Live results</h2>{plan.discovery.results.map(result => <section key={result.serviceId}><h3>{serviceName(result.serviceId)} · {result.status === "read" ? "Results" : "Unavailable"}</h3>{result.error && <p className="embeddedAiInlineError">{result.error}</p>}{result.status === "read" && !result.records.length && <p>No matching listings were found.</p>}<div className="embeddedAiCards">{result.records.map((item, index) => {
      const record = item && typeof item === "object" ? item as Record<string, unknown> : {};
      const sample = result.serviceId === "jobs" && record.listingProvenance !== "employer_backed";
      return <article key={String(record.id || index)}><strong>{String(record.title || "SMAJ PI HUB listing")}</strong><span>{String(record.company || record.creatorName || record.sellerName || serviceName(result.serviceId))}</span>{record.salary != null && <span>{String(record.salary)}</span>}{result.serviceId === "jobs" && <b>{sample ? "Sample listing · Not verified" : record.employerVerified === true ? "Verified employer" : "Employer not verified"}</b>}</article>;
    })}</div></section>)}</section>}
    {!plan.discovery && plan.services?.some(id => ["jobs", "store", "stream"].includes(id)) && !execution && <div className="embeddedAiApproval"><strong>Approve live search?</strong><p>SMAJ AI will read public listings and share listing details with Meta for analysis. No purchase or application will be made.</p><button type="button" disabled={busy} onClick={() => runDiscovery(task)}>{busy ? "Searching…" : "Approve search"}</button></div>}
    {!!plan.proposedActions?.length && !execution && <section className="embeddedAiApproval"><h2>Review actions</h2><p>Choose the exact actions you approve. Nothing is submitted until you confirm.</p>{plan.proposedActions.map(action => <label key={action.id}><input type="checkbox" checked={selectedActions.includes(action.id)} onChange={event => setSelectedActions(current => event.target.checked ? [...current, action.id] : current.filter(id => id !== action.id))}/><span><strong>{action.title}</strong><small>{serviceName(action.serviceId)} · {action.recordId}</small>{action.coverNote && <small>Application note: {action.coverNote}</small>}{action.applicationPreview && <small>Job: {action.applicationPreview.job.title} · {action.applicationPreview.job.company}<br/>Location: {action.applicationPreview.job.location} · {action.applicationPreview.job.type} · {action.applicationPreview.job.mode}<br/>Salary: {action.applicationPreview.job.salary} · {action.applicationPreview.job.category}<br/>Profile: {action.applicationPreview.profile.title} · {action.applicationPreview.profile.skills.join(", ") || "No listed skills"} · {action.applicationPreview.profile.location || "Location not specified"}<br/>Summary: {action.applicationPreview.profile.summary || "None"} · Portfolio: {action.applicationPreview.profile.portfolio || "None"}<br/>CV: {action.applicationPreview.cv.attached ? `${action.applicationPreview.cv.name || "Attached"} (${action.applicationPreview.cv.size || 0} bytes; ${action.applicationPreview.cv.visibility || "visibility not specified"})` : `Not attached${action.applicationPreview.cv.visibility ? ` · ${action.applicationPreview.cv.visibility}` : ""}`}</small>}</span></label>)}<button type="button" disabled={busy || !selectedActions.length || !plan.actionReviewHash} onClick={() => approveActions(task)}>Approve {selectedActions.length} selected actions</button></section>}
    {execution && <section className="embeddedAiExecution"><h2>Task status · {execution.status.replaceAll("_", " ")}</h2>{execution.error && <p className="embeddedAiInlineError" role="alert">{execution.error}</p>}{execution.events?.map((event, index) => <p key={`${event.at}:${index}`}>{event.message}</p>)}{execution.status === "failed" && execution.retryable && <button type="button" disabled={busy} onClick={() => retryTask(task)}><RefreshOutlinedIcon/> Retry safely</button>}{execution.receipt && execution.status === "verified" && <div><p>Independently verified · {execution.receipt.verifiedAt || "Verified"}</p><button type="button" disabled={busy} onClick={() => downloadReceipt(task, "pdf")}><DownloadOutlinedIcon/> Download PDF receipt</button><button type="button" disabled={busy} onClick={() => downloadReceipt(task, "json")}>Download verification data</button></div>}</section>}
    <div className="embeddedAiConversationActions"><span>{statusLabel(plan)}</span><button type="button" disabled={busy} onClick={() => deleteTask(task)}><DeleteOutlineOutlinedIcon/> Delete task</button></div>
  </section>;
}
