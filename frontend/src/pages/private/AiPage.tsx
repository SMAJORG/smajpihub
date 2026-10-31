import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { axiosClient } from "../../lib/axiosClient";
import "./ai.css";

type Task = { id: string; task: string; plan: { summary: string; warnings: string[]; services?: string[]; steps: { id: string; title: string; description: string }[]; discovery?: { results: { serviceId: string; status: string; error?: string; records: Record<string, unknown>[] }[] } } };
const config = { timeout: 70000, headers: { "X-SMAJ-Silent": "true" }, smajSkipReadRetry: true };
export default function AiPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  async function run(action: () => Promise<void>) {
    setBusy(true); setError("");
    try { await action(); }
    catch (err) { const e = err as { response?: { data?: { message?: string } } }; setError(e.response?.data?.message || "SMAJ AI could not be reached. Please try again."); }
    finally { setBusy(false); }
  }
  const load = () => run(async () => { const { data } = await axiosClient.get("/ai/tasks", config); setTasks(data.tasks); setLoaded(true); });
  useEffect(() => { void load(); }, []);
  const send = (event: FormEvent) => {
    event.preventDefault();
    if (busy || !message.trim()) return;
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
    <header><Link to="/dashboard">← Hub</Link><h1 id="hub-ai-title">SMAJ AI</h1><p>Your assistant, using your existing Pi login.</p><Link to="/smaj-pi-jobs">Browse SMAJ Jobs</Link></header>
    {error && <div role="alert"><p>{error}</p><button disabled={busy} onClick={() => void load()}>Retry connection</button></div>}
    {!loaded && busy && <p role="status">Connecting to SMAJ AI…</p>}
    <form onSubmit={send}><label htmlFor="ai-message">How can I help?</label><textarea id="ai-message" value={message} onChange={e => setMessage(e.target.value)} maxLength={2000} rows={3} placeholder="Find remote jobs that match my skills…" required /><button disabled={busy || !message.trim()} type="submit">{busy ? "Please wait…" : "Send"}</button></form>
    <div aria-live="polite">{tasks.map(task => <article key={task.id}><h2>{task.task}</h2><p className="hub-ai-summary">{task.plan.summary}</p>{task.plan.steps.map(step => <div key={step.id}><strong>{step.title}</strong><p>{step.description}</p></div>)}{task.plan.warnings.map((warning, index) => <p key={index}>{warning}</p>)}
      {task.plan.services?.some(id => ["jobs", "store", "stream"].includes(id)) && <><p>Allow read-only catalog discovery and share listing metadata with the AI to find matches.</p><button disabled={busy} onClick={() => void discover(task)}>Approve and find matches</button></>}
      {task.plan.discovery?.results.map((result, index) => <div key={index}><h3>{result.serviceId}</h3>{result.error && <p>{result.error}</p>}{result.status === "read" && !result.records.length && <p>No matching listings found.</p>}{result.records.map((record, i) => <div key={i}><strong>{String(record.title || record.name || "Listing")}</strong><p>{String(record.company || record.summary || record.description || "")}</p></div>)}</div>)}
    </article>)}</div>
  </section>;
}
