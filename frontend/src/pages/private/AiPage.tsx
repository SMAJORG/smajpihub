import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { axiosClient } from "../../lib/axiosClient";
import "./ai.css";

type Action = { id: string; serviceId: string; recordId: string; kind: string; title: string; coverNote?: string };
type Task = { id: string; task: string; plan: {
  activity?: {at:string;phase:string;message:string}[]; ai?: { model: string; responseId: string | null }; summaryAi?: { model: string; responseId: string | null }; summaryError?: { code: string; message: string };
  actionReviewHash?: string; proposedActions?: Action[]; execution?: { status: string; error?: string; receipt?: { verifiedAt: string; proofHash: string; evidence: unknown[] } };
  sources?: { id: string; title: string; url: string; file: string }[]; summary: string; warnings: string[]; services?: string[];
  steps: { id: string; title: string; description: string }[];
  discovery?: { completedAt: string; proofHash: string; results: { serviceId: string; status: string; error?: string; records: Record<string, unknown>[] }[] };
} };
const config = { timeout: 160000, headers: { "X-SMAJ-Silent": "true" }, smajSkipReadRetry: true };
export default function AiPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  async function run(action: () => Promise<void>) {
    setBusy(true); setError("");
    try { await action(); }
    catch (err) { const e = err as { response?: { data?: { message?: string } } }; setError(e.response?.data?.message || "SMAJ AI could not be reached. Please try again."); }
    finally { setBusy(false); setAnalyzing(false); }
  }
  const load = () => run(async () => { const { data } = await axiosClient.get("/ai/tasks", config); setTasks(data.tasks); setLoaded(true); });
  useEffect(() => { void load(); }, []);
  const pendingIds = tasks.filter(t => t.plan.execution && ["queued", "running", "verifying", "retrying"].includes(t.plan.execution.status)).map(t => t.id).join(",");
  useEffect(() => {
    if (!pendingIds) return;
    const timer = setInterval(() => { void axiosClient.get("/ai/tasks", config).then(({data}) => setTasks(data.tasks)).catch(() => setError("Could not refresh live execution status. Reopen the saved task to check its outcome.")); }, 3000);
    return () => clearInterval(timer);
  }, [pendingIds]);
  const approveLive = (task: Task) => run(async () => {
    const { data } = await axiosClient.post(`/ai/tasks/${task.id}/approve`, { approved: true, actionIds: selected[task.id] || [], reviewHash: task.plan.actionReviewHash }, config);
    setTasks(current => current.map(item => item.id === task.id ? data.task : item));
  });
  const download = (task: Task, format: "pdf" | "json") => run(async () => {
    const {data} = await axiosClient.get(`/ai/tasks/${task.id}/receipt?format=${format}`, {...config, responseType: "blob"});
    const url = URL.createObjectURL(data); const a = document.createElement("a"); a.href = url; a.download = `smaj-proof-${task.id}.${format}`; a.click(); URL.revokeObjectURL(url);
  });
  const phase = (task: Task) => task.plan.execution ? ({queued:"Queued",running:"Executing",verifying:"Verifying",retrying:"Retrying",failed:"Failed",verified:task.plan.execution.receipt?"Completed":"Verifying"}[task.plan.execution.status] || "Unavailable") : task.plan.summaryError ? "Failed" : task.plan.proposedActions?.length || (task.plan.steps.length && !task.plan.discovery) ? "Awaiting Approval" : "Completed";
  const send = (event: FormEvent) => {
    event.preventDefault();
    if (busy || !message.trim()) return;
    setAnalyzing(true);
    void run(async () => { const { data } = await axiosClient.post("/ai/tasks", { task: message.trim() }, config); setTasks(current => [data.task, ...current]); setMessage(""); });
  };
  const discover = (task: Task) => run(async () => {
    // This explicit action grants catalog consent and approval; opening AI does neither.
    const { data: connections } = await axiosClient.get("/ai/connections", config);
    const services = task.plan.services || [];
    for (const serviceId of services.filter(id => ["jobs", "store", "stream"].includes(id))) {
      if (!connections.connections.some((c: { serviceId: string; connected: boolean }) => c.serviceId === serviceId && c.connected)) {
        await axiosClient.post("/ai/connections", { serviceId, connected: true }, config);
      }
    }
    const { data } = await axiosClient.post(`/ai/tasks/${task.id}/discover`, { approved: true }, config);
    setTasks(current => current.map(item => item.id === task.id ? data.task : item));
  });
  return <section className="hub-ai" aria-labelledby="hub-ai-title">
    <header><Link to="/dashboard">← Hub</Link><span className="hub-ai-eyebrow">YOUR WORKSPACE</span><h1 id="hub-ai-title">AI Tasks &amp; Results.</h1><p>Every action planned. Every decision yours. Every result verifiable.</p><p>Ask about the White Paper, platform policies, and services. White Paper and policy answers need no task approval. Catalog reads and live actions require separate approvals.</p><Link to="/smaj-pi-jobs">Browse SMAJ Jobs</Link></header>
    {error && <div role="alert"><p>{error}</p><button disabled={busy} onClick={() => void load()}>Retry connection</button></div>}
    {analyzing && <p role="status">Analyzing · Waiting for the actual Meta response…</p>}
    {!loaded && busy && <p role="status">Connecting to SMAJ AI…</p>}
    <form onSubmit={send}><label htmlFor="ai-message">How can I help?</label><textarea id="ai-message" value={message} onChange={e => setMessage(e.target.value)} maxLength={2000} rows={3} placeholder="Find software engineering jobs, cars under $30,000, or content on SMAJ Stream…" required /><button disabled={busy || !message.trim()} type="submit">{busy ? "Request in progress…" : "Send"}</button></form>
    <div aria-live="polite">{tasks.map(task => <article key={task.id}><h2>{task.task}</h2><p role="status">{phase(task)}</p><p>Selected services: {task.plan.services?.join(", ") || "No service action required"}</p>{task.plan.activity?.map((event,index)=><p key={index}><small>{event.at}</small> · {event.phase}: {event.message}</p>)}<small>{task.plan.summaryError ? "System status · Meta analysis unavailable" : task.plan.summaryAi ? `Live Meta analysis · ${task.plan.summaryAi.model}` : task.plan.ai ? `Live Meta plan · ${task.plan.ai.model}` : "Saved response · model origin unverified"}</small>{task.plan.summaryError && <p role="alert">{task.plan.summaryError.message} ({task.plan.summaryError.code})</p>}<p className="hub-ai-summary">{task.plan.summary}</p>{task.plan.sources && task.plan.sources.length > 0 && <details><summary>Repository sources · {task.plan.sources.length} sections</summary><p>Source snapshot; current deployment availability may differ.</p><ul>{task.plan.sources.map(source => <li key={source.id}><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a><small>{source.id} · {source.file}</small></li>)}</ul></details>}{task.plan.steps.map(step => <div key={step.id}><strong>{step.title}</strong><p>{step.description}</p></div>)}{task.plan.warnings.map((warning, index) => <p key={index}>{warning}</p>)}
      {!task.plan.execution && task.plan.services?.some(id => ["jobs", "store", "stream"].includes(id)) && <><p>Allow read-only catalog discovery and share listing metadata with the AI to find matches.</p><button disabled={busy} onClick={() => void discover(task)}>Approve and find matches</button></>}
      {task.plan.discovery?.results.map((result, index) => <div key={index}><h3>{result.serviceId} · {result.status === "read" ? "Live API data" : "Unavailable"}</h3>{result.error && <p>{result.error}</p>}{result.status === "read" && !result.records.length && <p>No published listings were returned for this search.</p>}{result.records.map((record, i) => <div key={i}><strong>{String(record.title || record.name || "Listing")}</strong><p>{String(record.company || record.creatorName || "")}</p><p>{String(record.summary || record.description || "")}</p>{Boolean(record.price) && <p>{String(record.price)}{record.priceUsdt != null ? ` · ${record.priceUsdt} USDT reference` : ""}</p>}<small>Record ID: {String(record.id)}</small></div>)}</div>)}
      {!task.plan.execution && !!task.plan.proposedActions?.length && <section><h3>Review live actions</h3><p>These actions change your real Jobs applications or Store saved products. Review each draft and select actions to approve.</p>{task.plan.proposedActions.map(action => <label className="hub-ai-action" key={action.id}><input type="checkbox" checked={(selected[task.id] || []).includes(action.id)} onChange={e => setSelected(current => ({...current, [task.id]: e.target.checked ? [...(current[task.id] || []), action.id] : (current[task.id] || []).filter(id => id !== action.id)}))}/><span><strong>{action.title}</strong><small>{action.kind} · {action.recordId}</small>{action.coverNote && <p>{action.coverNote}</p>}</span></label>)}<button disabled={busy || !(selected[task.id] || []).length} onClick={() => void approveLive(task)}>Approve selected live actions</button></section>}
      {task.plan.execution && <section aria-live="polite"><h3>Live execution · {phase(task)}</h3>{task.plan.execution.error && <p role="alert">{task.plan.execution.error}</p>}{task.plan.execution.receipt && <p>Verified against backend records · {task.plan.execution.receipt.verifiedAt}</p>}</section>}
      {task.plan.execution?.status === "verified" && task.plan.execution.receipt && <><button disabled={busy} onClick={() => void download(task,"pdf")}>Download PDF proof</button><button disabled={busy} onClick={() => void download(task,"json")}>Download JSON proof</button></>}
    </article>)}</div>
  </section>;
}
