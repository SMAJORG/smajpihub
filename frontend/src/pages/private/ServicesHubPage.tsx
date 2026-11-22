import { useMemo, useState } from "react";
import RewardedAdPlacement from "../../components/RewardedAdPlacement";
import { Link, useSearchParams } from "react-router-dom";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import ArrowForwardOutlinedIcon from "@mui/icons-material/ArrowForwardOutlined";
import TuneOutlinedIcon from "@mui/icons-material/TuneOutlined";
import KeyboardArrowDownOutlinedIcon from "@mui/icons-material/KeyboardArrowDownOutlined";
import CheckOutlinedIcon from "@mui/icons-material/CheckOutlined";
import ServiceArt from "../../components/ServiceArt";
import { getServiceLaunchLabel, getServiceLaunchStatus, serviceAppPath, serviceCatalog } from "../../content/serviceCatalog";
import AmbassadorServicesPanel from "../../components/AmbassadorServicesPanel";
import { serviceLaunchNavigationState } from "../../lib/serviceLaunch";

const serviceHints: Record<string, string> = {
  store: "Shopping • Deals",
  food: "Eat • Delivery",
  jobs: "Work • Hire",
  education: "Learn • Skills",
  health: "Care • Doctors",
  transport: "Ride • Move",
  agro: "Farm • Trade",
  energy: "Power • Bills",
  charity: "Give • Help",
  housing: "Rent • Buy",
  events: "Tickets • Fun",
  swap: "Trade • Exchange",
  stream: "Watch • Videos",
  sports: "Play • Scores",
  token: "Rewards • Utility",
};

const servicePath = (slug: string, live?: boolean) => {
  return live ? serviceAppPath(slug) : `/app/services/${slug}`;
};

const prioritySlugs = ["store", "stream", "sports"];
const orderedServices = [...serviceCatalog].sort((left, right) => {
  const leftIndex = prioritySlugs.indexOf(left.slug);
  const rightIndex = prioritySlugs.indexOf(right.slug);
  const leftPriority = leftIndex === -1 ? prioritySlugs.length : leftIndex;
  const rightPriority = rightIndex === -1 ? prioritySlugs.length : rightIndex;
  return leftPriority - rightPriority;
});
const ServicesHubPage = () => {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "live" | "in-progress" | "coming-soon">("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const statusOptions = [{ value: "all", label: "All services" }, { value: "live", label: "Live" }, { value: "in-progress", label: "In progress" }, { value: "coming-soon", label: "Coming soon" }] as const;
  const mobileServices = orderedServices.filter(service => statusFilter === "all" || getServiceLaunchStatus(service.slug) === statusFilter);
  const [searchParams] = useSearchParams();
  const ambassadorApplicationOpen = searchParams.get("ambassador") === "apply";
  const visible = useMemo(() => orderedServices.filter((service) => [service.name, service.description, ...service.items].join(" ").toLowerCase().includes(search.trim().toLowerCase())), [search]);

  return <main className={`private-page services-launcher${ambassadorApplicationOpen ? " ambassador-application-open" : ""}`}>
    <div className="services-desktop-view">
      <section className="private-page-head"><div><p className="private-kicker">SMAJ ECOSYSTEM</p><h1>All SMAJ PI HUB Services</h1><p>Explore one connected ecosystem for everyday life.</p></div></section>
      <label className="services-search"><SearchOutlinedIcon /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Discover anything..." /></label>
      <section className="services-hub-grid">{visible.map((service) => <Link key={service.slug} to={servicePath(service.slug, service.live)} state={serviceLaunchNavigationState(service.slug)}><ServiceArt index={service.atlasIndex} /><span className={`service-status ${getServiceLaunchStatus(service.slug)}${getServiceLaunchStatus(service.slug) === "live" ? " service-live-boil" : ""}`}>{getServiceLaunchLabel(service.slug)}</span><strong>{service.name}</strong><p>{service.description}</p><i><ArrowForwardOutlinedIcon /></i></Link>)}</section>
      {!visible.length ? <div className="private-state">No service matches your search.</div> : null}
    </div>

    <section className="services-mobile-view">
      <header><h1>Services</h1><p>Everything you need, in one place.</p></header>
      <AmbassadorServicesPanel />
      <div className="services-mobile-toolbar"><div><h2>Explore services</h2><span>{mobileServices.length} services</span></div><div className="services-status-filter"><button type="button" className="services-filter-trigger" aria-expanded={filterOpen} aria-haspopup="true" onClick={() => setFilterOpen(value => !value)}><TuneOutlinedIcon fontSize="small" /> {statusFilter === "all" ? "Filter" : statusOptions.find(option => option.value === statusFilter)?.label} <KeyboardArrowDownOutlinedIcon fontSize="small" /></button>{filterOpen ? <div className="services-filter-menu" role="group" aria-label="Filter services by availability"><strong>Show services</strong>{statusOptions.map(option => <button type="button" key={option.value} aria-pressed={statusFilter === option.value} onClick={() => { setStatusFilter(option.value); setFilterOpen(false); }}>{option.label}{statusFilter === option.value ? <CheckOutlinedIcon fontSize="small" /> : null}</button>)}</div> : null}</div></div>
      <div className="mobile-services-grid services-refined-grid">{mobileServices.map((service) => <Link key={service.slug} to={servicePath(service.slug, service.live)} state={serviceLaunchNavigationState(service.slug)}><ServiceArt index={service.atlasIndex} />{getServiceLaunchStatus(service.slug) === "live" ? <em className="live-card-badge service-live-boil">LIVE</em> : <em className={getServiceLaunchStatus(service.slug) === "coming-soon" ? "service-coming-soon-badge" : "service-in-progress-badge"}>{getServiceLaunchLabel(service.slug)}</em>}<strong>{service.name.replace("SMAJ ", "")}</strong><span>{serviceHints[service.slug]}</span></Link>)}{!mobileServices.length ? <p className="services-filter-empty">No services in this category yet.</p> : null}</div>
    </section>
    <RewardedAdPlacement />
  </main>;
};

export default ServicesHubPage;
