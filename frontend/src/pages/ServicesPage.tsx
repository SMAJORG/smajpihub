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
  [
    "Verified access",
    "Pi sign-in supports access. Enhanced seller and provider checks are planned.",
    VerifiedUserOutlinedIcon,
  ],
  ["Pi wallet flow", "Services are designed around one wallet access point.", AccountBalanceWalletOutlinedIcon],
  [
    "Commerce and work first",
    "SMAJ Store and SMAJ PI Jobs form the initial economic foundation.",
    StorefrontOutlinedIcon,
  ],
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
            <h1>Commerce and Work in an Expanding Pi Economy</h1>
            <p>
              Store and Jobs form the initial economic foundation. The wider service architecture expands as user
              demand, trust, country readiness, and operating capacity support it.
            </p>
            <div className="home-hero-cta">
              <Link to="/services/store" className="home-hero-primary-btn">
                Start with SMAJ Store
              </Link>
              <Link to="/services/jobs" className="home-hero-secondary-btn">
                Explore SMAJ PI Jobs
              </Link>
              <Link to="/how-it-works" className="home-hero-secondary-btn">
                See How It Works
              </Link>
            </div>
          </div>
          <aside className="services-company-hero-card">
            <SecurityOutlinedIcon />
            <strong>Built for trusted utility</strong>
            <span>Commerce and work first. Additional services grow with demand and readiness.</span>
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
            <h2>Explore the Expanding Service Ecosystem</h2>
            <p>
              Store and Jobs lead the economic foundation. Other live services remain available, including Stream. Each
              status label shows current availability; the full catalogue is a long-term architecture, not a
              simultaneous launch promise.
            </p>
          </div>
          <div className="services-directory-grid">
            {orderedPlatformDefinitions.map(platform => {
              const catalogItem = serviceCatalog.find(
                item => item.slug === (platform.routeSegment === "food-delivery" ? "food" : platform.routeSegment)
              );
              const status = getServiceLaunchStatus(catalogItem?.slug || platform.routeSegment);
              const isLive = status === "live";
              const inProgress = status === "in-progress";
              const card = (
                <>
                  {catalogItem ? <ServiceArt index={catalogItem.atlasIndex} /> : <StorefrontOutlinedIcon />}
                  <div>
                    <span
                      className={
                        isLive
                          ? "live-rating-badge service-live-boil"
                          : status === "coming-soon"
                            ? "service-coming-soon-badge"
                            : "service-in-progress-badge"
                      }
                    >
                      {getServiceLaunchLabel(catalogItem?.slug || platform.routeSegment)}
                    </span>
                    <h3>{platform.name}</h3>
                    <p>{platform.description}</p>
                  </div>
                  {!inProgress ? <ArrowForwardOutlinedIcon /> : null}
                </>
              );

              return (
                <Link
                  to={servicePath(platform.routeSegment)}
                  state={serviceLaunchNavigationState(catalogItem?.slug || platform.routeSegment)}
                  key={platform.routeSegment}
                  className={`services-directory-card${inProgress ? " service-in-progress-card" : ""}`}
                >
                  {card}
                </Link>
              );
            })}
          </div>
        </section>
      </main>
    </AppLayout>
  );
};

export default ServicesPage;
