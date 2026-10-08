import { Link, Navigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import AppLayout from "../layouts/AppLayout";
import ServiceArt from "../components/ServiceArt";
import LiveTransactions from "../components/LiveTransactions";
import { serviceLaunchNavigationState } from "../components/ServiceLaunchGate";
import {
  getServiceLaunchLabel,
  getServiceLaunchStatus,
  serviceCatalog,
  type ServiceDefinition,
} from "../content/serviceCatalog";
import { useAuthContext } from "../contexts/AuthContext";
import LoginWithPiButton from "../components/LoginWithPiButton";
import DashboardWelcomeLoader from "../components/DashboardWelcomeLoader";
import ArrowBackIosNewOutlinedIcon from "@mui/icons-material/ArrowBackIosNewOutlined";
import ArrowForwardIosOutlinedIcon from "@mui/icons-material/ArrowForwardIosOutlined";
import CheckCircleOutlineOutlinedIcon from "@mui/icons-material/CheckCircleOutlineOutlined";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import PaymentsOutlinedIcon from "@mui/icons-material/PaymentsOutlined";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import VerifiedUserOutlinedIcon from "@mui/icons-material/VerifiedUserOutlined";
import { useTranslation } from "react-i18next";
import "./HomePage.css";

const publicServicePath = (service: ServiceDefinition) =>
  `/services/${service.slug === "food" ? "food-delivery" : service.slug}`;
const publicServiceGroups = Array.from({ length: 5 }, (_, index) => serviceCatalog.slice(index * 3, index * 3 + 3));
let initialDashboardWelcomeAvailable = window.location.pathname === "/";

const foundationServices = ["store", "jobs"].map(slug => serviceCatalog.find(service => service.slug === slug)!);
const trustIcons = [
  ShieldOutlinedIcon,
  VerifiedUserOutlinedIcon,
  CheckCircleOutlineOutlinedIcon,
  LockOutlinedIcon,
  PaymentsOutlinedIcon,
];

const HomePage = () => {
  const { t } = useTranslation();
  const { isAuthenticated, isPiLoginPending } = useAuthContext();
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
    if (isMobileServices) return publicServiceGroups.map(group => [group]);
    return Array.from({ length: Math.ceil(publicServiceGroups.length / 2) }, (_, index) =>
      publicServiceGroups.slice(index * 2, index * 2 + 2)
    );
  }, [isMobileServices]);

  const safeServicesPage = Math.min(servicesPage, Math.max(serviceCarouselPages.length - 1, 0));
  const isFirstServicesPage = safeServicesPage === 0;
  const isLastServicesPage = safeServicesPage >= serviceCarouselPages.length - 1;
  const goToPreviousServicesPage = () => setServicesPage(currentPage => Math.max(currentPage - 1, 0));
  const goToNextServicesPage = () =>
    setServicesPage(currentPage => Math.min(currentPage + 1, serviceCarouselPages.length - 1));
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
              <h1>{t("home.title")}</h1>
              <p>{t("home.description")}</p>
              <div className="home-hero-cta">
                <LoginWithPiButton className="home-hero-primary-btn">
                  {isPiLoginPending ? t("nav.signingIn") : t("nav.login")}
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
                  <span
                    key={service.slug}
                    className={`public-home-floating-service public-home-floating-service-${index + 1}`}
                  >
                    <ServiceArt index={service.atlasIndex} />
                  </span>
                ))}
              </div>
            </aside>
          </div>
        </section>

        <section className="home-section public-home-section public-home-foundation" aria-labelledby="foundation-title">
          <div className="home-section-head public-home-section-head">
            <span className="home-kicker">{t("home.foundationKicker")}</span>
            <h2 id="foundation-title">{t("home.foundationTitle")}</h2>
            <p>{t("home.foundationText")}</p>
          </div>
          <div className="public-home-foundation-grid">
            {foundationServices.map((service, index) => (
              <Link
                key={service.slug}
                to={publicServicePath(service)}
                state={serviceLaunchNavigationState(service.slug)}
                className="public-home-foundation-card"
              >
                <div className="public-home-foundation-card-head">
                  <ServiceArt index={service.atlasIndex} />
                  <small className={liveBadgeClass(service)}>{getServiceLaunchLabel(service.slug)}</small>
                </div>
                <h3>{t(`home.foundationCards.${index}.title`)}</h3>
                <p>{t(`home.foundationCards.${index}.text`)}</p>
                <strong className="public-home-foundation-link">
                  {t(`home.foundationCards.${index}.action`)} <span aria-hidden="true">&rarr;</span>
                </strong>
              </Link>
            ))}
          </div>
        </section>

        <section className="home-section public-home-section" aria-labelledby="how-title">
          <div className="home-section-head public-home-section-head">
            <span className="home-kicker">{t("home.howKicker")}</span>
            <h2 id="how-title">{t("home.howTitle")}</h2>
            <p>{t("home.howText")}</p>
          </div>
          <ol className="public-home-economic-loop">
            {Array.from({ length: 6 }, (_, index) => (
              <li key={index}>
                <span className="public-home-loop-number" aria-hidden="true">
                  {index + 1}
                </span>
                <div>
                  <h3>{t(`home.steps.${index}.title`)}</h3>
                  <p>{t(`home.steps.${index}.text`)}</p>
                </div>
                {index < 5 && (
                  <span className="public-home-loop-arrow" aria-hidden="true">
                    &rarr;
                  </span>
                )}
              </li>
            ))}
          </ol>
        </section>

        <LiveTransactions />

        <section className="home-section public-home-section" aria-labelledby="trust-title">
          <div className="home-section-head public-home-section-head">
            <span className="home-kicker">{t("home.trustKicker")}</span>
            <h2 id="trust-title">{t("home.trustTitle")}</h2>
            <p>{t("home.trustText")}</p>
          </div>
          <div className="public-home-commerce-trust-grid">
            {trustIcons.map((Icon, index) => (
              <article key={index} className="home-trust-card public-home-commerce-trust-card">
                <Icon aria-hidden="true" />
                <div>
                  <h3>{t(`home.trustFeatures.${index}.title`)}</h3>
                  {index > 0 && <span className="public-home-planned-label">{t("home.planned")}</span>}
                  <p>{t(`home.trustFeatures.${index}.text`)}</p>
                </div>
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
              <div
                className="public-home-service-track"
                style={{ transform: `translateX(-${safeServicesPage * 100}%)` }}
              >
                {serviceCarouselPages.map((page, pageIndex) => (
                  <div className="public-home-service-grid" key={pageIndex}>
                    {page.map((group, groupIndex) => (
                      <div className="public-home-service-group" key={`${pageIndex}-${groupIndex}`}>
                        {group.map(service => (
                          <Link
                            to={publicServicePath(service)}
                            key={service.slug}
                            state={serviceLaunchNavigationState(service.slug)}
                            className={`public-home-service-card ${getServiceLaunchStatus(service.slug) === "in-progress" ? "service-in-progress-card" : ""}`}
                          >
                            <ServiceArt index={service.atlasIndex} />
                            <div>
                              <h3>{service.name}</h3>
                              <p>{service.items.slice(0, 2).join(" • ")}</p>
                            </div>
                            <small className={liveBadgeClass(service)}>{getServiceLaunchLabel(service.slug)}</small>
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

        <section className="home-section public-home-section public-home-partner-cta" aria-labelledby="partner-title">
          <div>
            <span className="home-kicker">{t("home.partnerKicker")}</span>
            <h2 id="partner-title">{t("home.partnerTitle")}</h2>
            <p>{t("home.partnerText")}</p>
          </div>
          <div className="home-hero-cta">
            <Link to="/collaborate" className="home-hero-primary-btn">
              {t("home.merchantAction")}
            </Link>
            <Link to="/partners" className="home-hero-secondary-btn">
              {t("home.partnerAction")}
            </Link>
          </div>
        </section>

        <section
          className="home-section public-home-section public-home-resource-grid"
          aria-label={t("home.resourcesLabel")}
        >
          <Link to="/white-paper" className="public-home-resource-card">
            <h2>{t("home.readWhitePaper")}</h2>
            <p>{t("home.whitePaperText")}</p>
            <span aria-hidden="true">&rarr;</span>
          </Link>
          <Link to="/faq" className="public-home-resource-card">
            <h2>{t("home.faqTitle")}</h2>
            <p>{t("home.faqText")}</p>
            <span aria-hidden="true">&rarr;</span>
          </Link>
        </section>

        <section className="home-section public-home-section public-home-final-cta">
          <span className="home-kicker">SMAJ PI HUB</span>
          <h2>{t("home.finalTitle")}</h2>
          <div className="home-hero-cta">
            <LoginWithPiButton className="home-hero-primary-btn">{t("nav.login")}</LoginWithPiButton>
            <Link to="/services" className="home-hero-secondary-btn">
              {t("home.explore")}
            </Link>
          </div>
        </section>
      </main>
    </AppLayout>
  );
};

export default HomePage;
