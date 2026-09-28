import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import ArrowForwardOutlinedIcon from "@mui/icons-material/ArrowForwardOutlined";
import ServiceArt from "../../components/ServiceArt";
import { getServiceLaunchLabel, getServiceLaunchStatus, serviceAppPath, serviceCatalog } from "../../content/serviceCatalog";
import AmbassadorServicesPanel from "../../components/AmbassadorServicesPanel";
import { serviceLaunchNavigationState } from "../../components/ServiceLaunchGate";

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
  const visible = useMemo(() => orderedServices.filter((service) => [service.name, service.description, ...service.items].join(" ").toLowerCase().includes(search.trim().toLowerCase())), [search]);

  return <main className="private-page services-launcher">
    <div className="services-desktop-view">
      <section className="private-page-head"><div><p className="private-kicker">SMAJ ECOSYSTEM</p><h1>All SMAJ PI HUB Services</h1><p>Explore one connected ecosystem for everyday life.</p></div></section>
      <label className="services-search"><SearchOutlinedIcon /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Discover anything..." /></label>
      <section className="services-hub-grid">{visible.map((service) => <Link key={service.slug} to={servicePath(service.slug, service.live)} state={serviceLaunchNavigationState(service.slug)}><ServiceArt index={service.atlasIndex} /><span className={`service-status ${getServiceLaunchStatus(service.slug)}${getServiceLaunchStatus(service.slug) === "live" ? " service-live-boil" : ""}`}>{getServiceLaunchLabel(service.slug)}</span><strong>{service.name}</strong><p>{service.description}</p><i><ArrowForwardOutlinedIcon /></i></Link>)}</section>
      {!visible.length ? <div className="private-state">No service matches your search.</div> : null}
    </div>

    <section className="services-mobile-view">
      <header><h1>Services</h1><p>Access multiple digital services from anywhere you are.</p></header>
      <AmbassadorServicesPanel />
      <div className="mobile-services-grid">{orderedServices.map((service) => <Link key={service.slug} to={servicePath(service.slug, service.live)} state={serviceLaunchNavigationState(service.slug)}><ServiceArt index={service.atlasIndex} />{getServiceLaunchStatus(service.slug) === "live" ? <em className="live-card-badge service-live-boil">LIVE</em> : <em className={getServiceLaunchStatus(service.slug) === "coming-soon" ? "service-coming-soon-badge" : "service-in-progress-badge"}>{getServiceLaunchLabel(service.slug)}</em>}<strong>{service.name.replace("SMAJ ", "")}</strong><span>{serviceHints[service.slug]}</span></Link>)}</div>
    </section>
  </main>;
};

export default ServicesHubPage;
