import { Link, Navigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import AppLayout from "../layouts/AppLayout";
import ServiceArt from "../components/ServiceArt";
import { serviceLaunchNavigationState } from "../components/ServiceLaunchGate";
import { getServiceLaunchLabel, getServiceLaunchStatus, serviceCatalog, type ServiceDefinition } from "../content/serviceCatalog";
import { useAuthContext } from "../contexts/AuthContext";
import LoginWithPiButton from "../components/LoginWithPiButton";
import DashboardWelcomeLoader from "../components/DashboardWelcomeLoader";
import AccountCircleOutlinedIcon from "@mui/icons-material/AccountCircleOutlined";
import ArrowBackIosNewOutlinedIcon from "@mui/icons-material/ArrowBackIosNewOutlined";
import ArrowForwardIosOutlinedIcon from "@mui/icons-material/ArrowForwardIosOutlined";
import ChatOutlinedIcon from "@mui/icons-material/ChatOutlined";
import CheckCircleOutlineOutlinedIcon from "@mui/icons-material/CheckCircleOutlineOutlined";
import HubOutlinedIcon from "@mui/icons-material/HubOutlined";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import PaymentsOutlinedIcon from "@mui/icons-material/PaymentsOutlined";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import ShoppingCartOutlinedIcon from "@mui/icons-material/ShoppingCartOutlined";
import SmartToyOutlinedIcon from "@mui/icons-material/SmartToyOutlined";
import TravelExploreOutlinedIcon from "@mui/icons-material/TravelExploreOutlined";
import VerifiedUserOutlinedIcon from "@mui/icons-material/VerifiedUserOutlined";
import WalletOutlinedIcon from "@mui/icons-material/WalletOutlined";
import { useTranslation } from "react-i18next";

const publicServicePath = (service: ServiceDefinition) =>
  `/services/${service.slug === "food" ? "food-delivery" : service.slug}`;
const publicServiceGroups = Array.from({ length: 5 }, (_, index) => serviceCatalog.slice(index * 3, index * 3 + 3));
let initialDashboardWelcomeAvailable = window.location.pathname === "/";

const valuePillars = [
  {
    title: "One Pi Identity",
    text: "Users enter through a verified Pi-first identity layer instead of repeating account setup across services.",
    Icon: AccountCircleOutlinedIcon,
  },
  {
    title: "One Pi Wallet",
    text: "Marketplace and service flows are designed around Pi wallet access, Pi pricing, and Pi utility.",
    Icon: WalletOutlinedIcon,
  },
  {
    title: "Multiple Services",
    text: "Commerce, jobs, health, education, transport, housing, media, and more connect through one hub.",
    Icon: HubOutlinedIcon,
  },
];

const howItWorks = [
  ["Connect", "Login with Pi and enter the SMAJ PI HUB experience.", AccountCircleOutlinedIcon],
  ["Verify", "Use identity and seller/provider checks to build trust.", VerifiedUserOutlinedIcon],
  ["Choose", "Open marketplace, jobs, health, education, housing, media, or other services.", TravelExploreOutlinedIcon],
  ["Use Pi", "Buy, sell, access services, and follow trusted platform flows.", PaymentsOutlinedIcon],
] as const;

const trustFeatures = [
  ["Verified Access", "Pi-first identity and account signals reduce fake participation.", ShieldOutlinedIcon],
  ["Marketplace Safety", "Escrow logic, reviews, ratings, and dispute support shape the MVP marketplace.", LockOutlinedIcon],
  ["AI Guidance", "A platform assistant helps users find services and understand next steps.", SmartToyOutlinedIcon],
  ["Clear Status", "Live and planned services are labeled so users know what is ready now.", CheckCircleOutlineOutlinedIcon],
] as const;

const mvpFeatures = [
  ["Product Listings", ShoppingCartOutlinedIcon],
  ["Buyer/Seller Chat", ChatOutlinedIcon],
  ["Pi Payment Flow", PaymentsOutlinedIcon],
  ["Dispute Support", LockOutlinedIcon],
  ["Reviews & Ratings", CheckCircleOutlineOutlinedIcon],
  ["Dispute Support", ShieldOutlinedIcon],
] as const;

const HomePage = () => {
  const { t } = useTranslation();
  const { isAuthenticated, isLoading } = useAuthContext();
  const [servicesPage, setServicesPage] = useState(0);
  const [isMobileServices, setIsMobileServices] = useState(false);
  const [showDashboardWelcome, setShowDashboardWelcome] = useState(initialDashboardWelcomeAvailable);

  useEffect(() => {
    if (!isAuthenticated || !showDashboardWelcome) return;
    initialDashboardWelcomeAvailable = false;
    const timer = window.setTimeout(() => setShowDashboardWelcome(false), 1600);
    return () => window.clearTimeout(timer);
  }, [isAuthenticated, showDashboardWelcome]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 1023px)");
    const updateServicesMode = () => setIsMobileServices(media.matches);

    updateServicesMode();
    media.addEventListener("change", updateServicesMode);
    return () => media.removeEventListener("change", updateServicesMode);
  }, []);

  const serviceCarouselPages = useMemo(() => {
    if (isMobileServices) return publicServiceGroups.map((group) => [group]);
    return Array.from({ length: Math.ceil(publicServiceGroups.length / 2) }, (_, index) =>
      publicServiceGroups.slice(index * 2, index * 2 + 2),
    );
  }, [isMobileServices]);

  const safeServicesPage = Math.min(servicesPage, Math.max(serviceCarouselPages.length - 1, 0));
  const isFirstServicesPage = safeServicesPage === 0;
  const isLastServicesPage = safeServicesPage >= serviceCarouselPages.length - 1;
  const goToPreviousServicesPage = () => setServicesPage((currentPage) => Math.max(currentPage - 1, 0));
  const goToNextServicesPage = () =>
    setServicesPage((currentPage) => Math.min(currentPage + 1, serviceCarouselPages.length - 1));
  const liveBadgeClass = (service: ServiceDefinition) => {
    const status = getServiceLaunchStatus(service.slug);
    if (status === "live") return "live-rating-badge service-live-boil";
    return status === "coming-soon" ? "service-coming-soon-badge" : "service-in-progress-badge";
  };

  if (isAuthenticated) {
    if (showDashboardWelcome) return <DashboardWelcomeLoader />;
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <AppLayout>
      <main className="home-page public-home-page">
        <section className="home-hero public-home-hero">
          <div className="home-hero-grid public-home-hero-grid">
            <div>
              <span className="home-kicker">{t("home.kicker")}</span>
              <h1>SMAJ PI HUB</h1>
              <p>
                {t("home.description")}
              </p>
              <div className="home-hero-cta">
                <LoginWithPiButton className="home-hero-primary-btn">
                  {isLoading ? t("nav.signingIn") : t("nav.login")}
                </LoginWithPiButton>
                <Link to="/services" className="home-hero-secondary-btn">
                  {t("home.explore")}
                </Link>
              </div>
            </div>

            <aside className="public-home-phone-visual" aria-label="SMAJ PI HUB mobile app preview">
              <div className="public-home-phone-glow" />
              <img src="/assets/smaj-hero-hand-phone.png" alt="Hand holding a premium phone showing a mobile app" />
              <div className="public-home-infinity-orbit" aria-hidden="true">
                {serviceCatalog.map((service, index) => (
                  <span key={service.slug} className={`public-home-floating-service public-home-floating-service-${index + 1}`}>
                    <ServiceArt index={service.atlasIndex} />
                  </span>
                ))}
              </div>
            </aside>
          </div>
        </section>

        <section className="home-section public-home-section">
          <div className="home-section-head public-home-section-head">
            <span className="home-kicker">{t("home.promise")}</span>
            <h2>{t("home.promiseTitle")}</h2>
            <p>{t("home.promiseText")}</p>
          </div>
          <div className="home-highlight-grid public-home-pillar-grid">
            {valuePillars.map(({ title, Icon }, index) => (
              <article key={title} className="home-highlight-card public-home-icon-card">
                <span className="public-home-card-icon">
                  <Icon />
                </span>
                <h3>{t(`home.pillars.${index}.title`)}</h3>
                <p>{t(`home.pillars.${index}.text`)}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="home-section public-home-section public-home-services-section">
          <div className="home-section-head public-home-section-head">
            <span className="home-kicker">{t("home.servicesKicker")}</span>
            <h2>{t("home.servicesTitle")}</h2>
            <p>{t("home.servicesText")}</p>
          </div>
          <div className="public-home-service-carousel">
            <div className="public-home-service-carousel-top">
              <span>
                {safeServicesPage + 1} / {serviceCarouselPages.length}
              </span>
              <div>
                <button
                  type="button"
                  className="public-home-service-arrow"
                  onClick={goToPreviousServicesPage}
                  disabled={isFirstServicesPage}
                  aria-label="Show previous services"
                >
                  <ArrowBackIosNewOutlinedIcon />
                </button>
                <button
                  type="button"
                  className="public-home-service-arrow"
                  onClick={goToNextServicesPage}
                  disabled={isLastServicesPage}
                  aria-label="Show next services"
                >
                  <ArrowForwardIosOutlinedIcon />
                </button>
              </div>
            </div>
            <div className="public-home-service-viewport">
              <div className="public-home-service-track" style={{ transform: `translateX(-${safeServicesPage * 100}%)` }}>
                {serviceCarouselPages.map((page, pageIndex) => (
                  <div className="public-home-service-grid" key={pageIndex}>
                    {page.map((group, groupIndex) => (
                      <div className="public-home-service-group" key={`${pageIndex}-${groupIndex}`}>
                        {group.map((service) => (
                          <Link to={publicServicePath(service)} key={service.slug} state={serviceLaunchNavigationState(service.slug)} className={`public-home-service-card ${getServiceLaunchStatus(service.slug) === "in-progress" ? "service-in-progress-card" : ""}`}>
                            <ServiceArt index={service.atlasIndex} />
                            <div>
                              <h3>{service.name}</h3>
                              <p>{service.items.slice(0, 2).join(" • ")}</p>
                            </div>
                             <small className={liveBadgeClass(service)}>
                              {getServiceLaunchLabel(service.slug)}
                            </small>
                          </Link>
                        ))}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="home-section public-home-section public-home-mvp-section">
          <div className="public-home-mvp-copy">
            <span className="home-kicker">{t("home.mvpKicker")}</span>
            <h2>{t("home.mvpTitle")}</h2>
            <p>{t("home.mvpText")}</p>
            <Link to="/services/store" className="home-hero-secondary-btn">
              {t("home.viewStore")}
            </Link>
          </div>
          <div className="public-home-mvp-grid">
            {mvpFeatures.map(([title, Icon], index) => (
              <article key={title} className="public-home-mini-card">
                <Icon />
                <strong>{t(`home.mvpFeatures.${index}`)}</strong>
              </article>
            ))}
          </div>
        </section>

        <section className="home-section public-home-section">
          <div className="home-section-head public-home-section-head">
            <span className="home-kicker">{t("home.howKicker")}</span>
            <h2>{t("home.howTitle")}</h2>
          </div>
          <div className="public-home-steps">
            {howItWorks.map(([title, , Icon], index) => (
              <article key={title}>
                <span>{index + 1}</span>
                <Icon />
                <h3>{t(`home.steps.${index}.title`)}</h3>
                <p>{t(`home.steps.${index}.text`)}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="home-section public-home-section">
          <div className="home-section-head public-home-section-head">
            <span className="home-kicker">{t("home.trustKicker")}</span>
            <h2>{t("home.trustTitle")}</h2>
            <p>{t("home.trustText")}</p>
          </div>
          <div className="home-trust-grid">
            {trustFeatures.map(([title, , Icon], index) => (
              <article key={title} className="home-trust-card public-home-icon-card">
                <span className="public-home-card-icon">
                  <Icon />
                </span>
                <h3>{t(`home.trustFeatures.${index}.title`)}</h3>
                <p>{t(`home.trustFeatures.${index}.text`)}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="home-section public-home-section public-home-final-cta">
          <span className="home-kicker">SMAJ PI HUB</span>
          <h2>{t("home.finalTitle")}</h2>
          <div className="home-hero-cta">
            <LoginWithPiButton className="home-hero-primary-btn">{t("nav.login")}</LoginWithPiButton>
            <Link to="/white-paper" className="home-hero-secondary-btn">
              {t("home.readWhitePaper")}
            </Link>
          </div>
        </section>
      </main>
    </AppLayout>
  );
};

export default HomePage;
