import { Link, useNavigate } from "react-router-dom";
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import KeyboardArrowDownOutlinedIcon from "@mui/icons-material/KeyboardArrowDownOutlined";
import ServiceArt from "../../components/ServiceArt";
import { serviceLaunchNavigationState } from "../../components/ServiceLaunchGate";
import { serviceAppPath, serviceCatalog, type ServiceDefinition } from "../../content/serviceCatalog";

type DiscoveryMode = "trending" | "lifestyle" | "categories";

const ratings: Record<string, string> = {
  store: "4.8", food: "4.6", jobs: "4.5", education: "4.7", health: "4.6",
  transport: "4.4", agro: "4.3", energy: "4.5", charity: "4.9", housing: "4.4",
  events: "4.6", swap: "4.3", stream: "4.7", sports: "4.6", token: "4.5",
};

const lifestyleSlugs = ["food", "health", "housing", "transport", "education", "charity", "events", "agro"];
const trendingSlugs = ["store", "stream", "sports", "events", "food", "jobs", "education", "health", "housing", "transport"];
const routeFor = (service: ServiceDefinition) => {
  return service.live ? serviceAppPath(service.slug) : `/app/services/${service.slug}`;
};

const DiscoveryTabs = ({ active }: { active: Exclude<DiscoveryMode, "categories"> }) => (
  <nav className="discovery-tabs" aria-label="Discover SMAJ PI HUB">
    <Link to="/dashboard">For you</Link>
    <Link className={active === "trending" ? "active" : ""} to="/trending">Trending</Link>
    <Link className={active === "lifestyle" ? "active" : ""} to="/lifestyle">Lifestyle</Link>
    <Link to="/categories">Categories</Link>
  </nav>
);

const RankedServices = ({ mode }: { mode: "trending" | "lifestyle" }) => {
  const slugs = mode === "trending" ? trendingSlugs : lifestyleSlugs;
  const services = slugs.map((slug) => serviceCatalog.find((service) => service.slug === slug)).filter(Boolean) as ServiceDefinition[];
  return <main className="private-page service-discovery-page">
    <DiscoveryTabs active={mode} />
    <div className="discovery-filters">
      <button type="button">{mode === "trending" ? "Most popular" : "Daily life"}<KeyboardArrowDownOutlinedIcon /></button>
      <Link to="/categories">All services<KeyboardArrowDownOutlinedIcon /></Link>
    </div>
    <section className="discovery-ranking" aria-label={`${mode} SMAJ services`}>
      {services.map((service, index) => <Link to={routeFor(service)} key={service.slug} state={serviceLaunchNavigationState(service.slug)} className={service.inProgress ? "service-in-progress-card" : undefined}>
        <span className="discovery-rank">{index + 1}</span>
        <ServiceArt index={service.atlasIndex} />
        <span className="discovery-service-copy"><strong>{service.name}</strong><small>{service.experience} • {service.items.slice(0, 2).join(" • ")}</small><b>{ratings[service.slug]}★</b></span>
      </Link>)}
    </section>
  </main>;
};

const ServiceCategories = () => {
  const navigate = useNavigate();
  return <main className="service-categories-page">
    <header><button type="button" onClick={() => navigate(-1)} aria-label="Close categories"><CloseOutlinedIcon /></button><h1>Categories</h1></header>
    <section aria-label="All SMAJ PI HUB service categories">
      {serviceCatalog.map((service) => <Link to={routeFor(service)} key={service.slug} state={serviceLaunchNavigationState(service.slug)} className={service.inProgress ? "service-in-progress-card" : undefined}><ServiceArt index={service.atlasIndex} /><span><strong>{service.name}</strong><small>{service.inProgress ? "IN PROGRESS" : service.experience}</small></span></Link>)}
    </section>
  </main>;
};

const ServiceDiscoveryPage = ({ mode }: { mode: DiscoveryMode }) => mode === "categories" ? <ServiceCategories /> : <RankedServices mode={mode} />;
export default ServiceDiscoveryPage;
