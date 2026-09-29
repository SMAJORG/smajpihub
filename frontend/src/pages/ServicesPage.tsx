import { Link } from "react-router-dom";
import AppLayout from "../layouts/AppLayout";
import ServiceArt from "../components/ServiceArt";
import { serviceLaunchNavigationState } from "../components/ServiceLaunchGate";
import AccountBalanceWalletOutlinedIcon from "@mui/icons-material/AccountBalanceWalletOutlined";
import ArrowForwardOutlinedIcon from "@mui/icons-material/ArrowForwardOutlined";
import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined";
import SecurityOutlinedIcon from "@mui/icons-material/SecurityOutlined";
import StorefrontOutlinedIcon from "@mui/icons-material/StorefrontOutlined";
import VerifiedUserOutlinedIcon from "@mui/icons-material/VerifiedUserOutlined";
import { orderedPlatformDefinitions } from "../content/platforms";
import { getServiceLaunchLabel, getServiceLaunchStatus, serviceCatalog } from "../content/serviceCatalog";
import useSliceReveal from "../hooks/useSliceReveal";

const servicePath = (routeSegment: string) => `/services/${routeSegment}`;

const servicePrinciples = [
  ["Verified access", "Pi identity and provider checks create stronger trust signals.", VerifiedUserOutlinedIcon],
  ["Pi wallet flow", "Services are designed around one wallet access point.", AccountBalanceWalletOutlinedIcon],
  ["Marketplace first", "SMAJ Store is the launch layer for practical Pi commerce.", StorefrontOutlinedIcon],
  ["Partner ready", "Each service can grow with providers, merchants, and communities.", GroupsOutlinedIcon],
] as const;

const ServicesPage = () => {
  useSliceReveal();

  return (
    <AppLayout>
      <main className="home-page services-company-page">
        <section className="home-hero services-company-hero">
          <div>
            <span className="home-kicker">SMAJ PI HUB SERVICES</span>
            <h1>One company hub for real Pi-powered services.</h1>
            <p>
              SMAJ PI HUB connects marketplace, jobs, education, health, transport, housing, entertainment, utility
              tools, and partner services through one familiar Pi-first experience.
            </p>
            <div className="home-hero-cta">
              <Link to="/services/store" className="home-hero-primary-btn">
                Start with SMAJ Store
              </Link>
              <Link to="/how-it-works" className="home-hero-secondary-btn">
                See How It Works
              </Link>
            </div>
          </div>
          <aside className="services-company-hero-card">
            <SecurityOutlinedIcon />
            <strong>Built for trusted utility</strong>
            <span>One Pi identity, one wallet, multiple service paths.</span>
          </aside>
        </section>

        <section className="home-section services-company-section">
          <div className="home-section-head">
            <span className="home-kicker">SERVICE MODEL</span>
            <h2>Simple enough for users. Structured enough for a real company.</h2>
          </div>
          <div className="services-principle-grid">
            {servicePrinciples.map(([title, text, Icon]) => (
              <article key={title}>
                <Icon />
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="home-section services-company-section">
          <div className="home-section-head">
            <span className="home-kicker">PLATFORM DIRECTORY</span>
            <h2>15 connected services, clean status, clear next step.</h2>
            <p>
              SMAJ Store is live as the marketplace starting point. Other services are staged for expansion as the hub
              grows with providers, safety systems, and real demand.
            </p>
          </div>
          <div className="services-directory-grid">
            {orderedPlatformDefinitions.map((platform) => {
              const catalogItem = serviceCatalog.find((item) => item.slug === (platform.routeSegment === "food-delivery" ? "food" : platform.routeSegment));
              const status = getServiceLaunchStatus(catalogItem?.slug || platform.routeSegment);
              const isLive = status === "live";
              const inProgress = status === "in-progress";
              const card = <>
                {catalogItem ? <ServiceArt index={catalogItem.atlasIndex} /> : <StorefrontOutlinedIcon />}
                <div>
                  <span className={isLive ? "live-rating-badge service-live-boil" : status === "coming-soon" ? "service-coming-soon-badge" : "service-in-progress-badge"}>{getServiceLaunchLabel(catalogItem?.slug || platform.routeSegment)}</span>
                  <h3>{platform.name}</h3>
                  <p>{platform.description}</p>
                </div>
                {!inProgress ? <ArrowForwardOutlinedIcon /> : null}
              </>;

              return <Link to={servicePath(platform.routeSegment)} state={serviceLaunchNavigationState(catalogItem?.slug || platform.routeSegment)} key={platform.routeSegment} className={`services-directory-card${inProgress ? " service-in-progress-card" : ""}`}>{card}</Link>;
            })}
          </div>
        </section>
      </main>
    </AppLayout>
  );
};

export default ServicesPage;
