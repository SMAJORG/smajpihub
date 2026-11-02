import { useEffect, useRef, useState, type FormEvent } from "react";
import styles from "./AuthenticatedAiChatHome.module.css";
import { serviceCatalog } from "../../content/serviceCatalog";
import EmbeddedServiceIcon from "./EmbeddedServiceIcon";

type Props = {
  task: string;
  setTask: (value: string) => void;
  selectedService: string;
  selectService: (value: string) => void;
  routeTask: (event: FormEvent) => void;
  busy: string;
  connectedIds: Set<string>;
  availableIds: Set<string>;
};

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

export default function AuthenticatedAiChatHome({ task, setTask, selectedService, selectService, routeTask, busy, connectedIds, availableIds }: Props) {
  const input = useRef<HTMLTextAreaElement>(null);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [showAllServices, setShowAllServices] = useState(false);

  useEffect(() => {
    if (task.length > 0) return;
    const timer = window.setInterval(() => {
      setPlaceholderIndex(index => (index + 1) % serviceCatalog.length);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [task.length]);

  const selected = serviceCatalog.find(service => service.slug === selectedService);
  const orderedServices = [
    ...serviceCatalog.filter(service => connectedIds.has(service.slug)),
    ...serviceCatalog.filter(service => !connectedIds.has(service.slug)),
  ];
  const visibleServices = showAllServices ? orderedServices : orderedServices.slice(0, 5);
  const status = (id: string) => !availableIds.has(id) ? "Planned" : connectedIds.has(id) ? "Connected" : "Not connected";

  return <section className={`homeView launcherHome ${styles.root}`}>
    <p className={styles.eyebrow}>YOUR WORKSPACE</p><h1 className={styles.title}>What can I help you do?</h1>
    <form className={`centralComposer compactComposer ${styles.composer}`} onSubmit={routeTask} aria-label="Create an AI task" aria-busy={busy === "create"}>
      <label className="embeddedAiSrOnly" htmlFor="embedded-ai-prompt">Your AI task</label>
      <div className={styles.promptInput}>
        <textarea ref={input} id="embedded-ai-prompt" value={task} onChange={event => setTask(event.target.value)} placeholder="" maxLength={1900} rows={3} />
        {!task && <span className={styles.rotatingPlaceholder} aria-hidden="true"><span key={placeholderIndex}>{serviceExamples[serviceCatalog[placeholderIndex].slug] || "Tell SMAJ AI what you need"}…</span></span>}
      </div>
      <div className={styles.toolbar}>
        {selected && <button type="button" className={`${styles.tool} ${styles.apps}`} onClick={() => selectService("")} aria-label={`Clear ${selected.name.replace(/^SMAJ /, "")} context`}><EmbeddedServiceIcon service={selected}/><span>{selected.name.replace(/^SMAJ /, "")}</span><span className={styles.clear} aria-hidden="true">×</span></button>}
        <button type="submit" className={styles.submit} disabled={!task.trim() || Boolean(busy)}>{busy === "create" ? <><span className="embeddedAiSpinner"/>Asking AI…</> : <>Ask SMAJ AI <span aria-hidden="true">↗</span></>}</button>
      </div>
    </form>
    {selected && <div className="serviceContext" role="status"><span><strong>{selected.name}</strong> · {status(selected.slug)}{status(selected.slug) === "Planned" ? " — integration not available yet." : !connectedIds.has(selected.slug) ? " — use Connect Apps to connect this app." : " — task context selected."}</span></div>}
    <div className={styles.suggestions} aria-label="Suggested requests">
      {[{ label: "Find jobs", prompt: "Find software engineering jobs" }, { label: "Shop cars", prompt: "Find cars under $30,000" }, { label: "Explore courses", prompt: "Show available online courses" }, { label: "Health services", prompt: "Find nearby health services" }].map(suggestion => <button key={suggestion.label} type="button" onClick={() => { selectService(""); setTask(suggestion.prompt); input.current?.focus({ preventScroll: true }); }}>{suggestion.label}</button>)}
    </div>
    <div className={styles.servicesHeading}><div className={styles.servicesHeadingContent}><h2>Connected services</h2></div></div>
    <div className={`launcherLegend ${styles.legend}`} aria-label="Service status legend"><span><i className="statusDot connected"/>Connected</span><span><i className="statusDot disconnected"/>Not connected</span><span><i className="statusDot unavailable"/>Planned</span></div>
    <div id="home-services-list" className={styles.services} aria-label="Choose a service">
      {visibleServices.map(service => {
        const state = status(service.slug);
        return <button key={service.slug} type="button" className={styles.service} aria-pressed={selectedService === service.slug} aria-label={`${service.name.replace(/^SMAJ /, "")}, ${state}`} onClick={() => { selectService(service.slug); setTask(serviceExamples[service.slug] || ""); input.current?.focus({ preventScroll: true }); }}>
          <span className={styles.art}><EmbeddedServiceIcon service={service}/></span>
          <span className={styles.serviceLabel}>{service.name.replace(/^SMAJ /, "")}<i className={`statusDot ${state === "Connected" ? "connected" : state === "Planned" ? "unavailable" : "disconnected"}`}/></span>
        </button>;
      })}
    </div>
    {orderedServices.length > 5 && <button type="button" className={styles.showAll} aria-expanded={showAllServices} aria-controls="home-services-list" onClick={() => setShowAllServices(value => !value)}>{showAllServices ? "Show fewer services" : "Show all services"}</button>}
  </section>;
}
