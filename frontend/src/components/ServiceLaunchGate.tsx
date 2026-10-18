import {
  brandedServiceLaunchSlugs,
  type BrandedServiceLaunchSlug,
} from "../lib/serviceLaunch";
import { createPortal } from "react-dom";
import { useSiteContent } from "../lib/siteContent";
import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  getServiceLaunchStatus,
  serviceCatalog,
} from "../content/serviceCatalog";
import ServiceLaunchSplash from "./ServiceLaunchSplash";

const serviceLaunchConfig: Record<
  BrandedServiceLaunchSlug,
  { name: string; icon: string; tagline: string }
> = {
  store: {
    name: "SMAJ STORE",
    icon: "/assets/services/store.png",
    tagline: "Shop smarter. Sell freely.",
  },
  jobs: {
    name: "SMAJ JOBS",
    icon: "/assets/services/jobs.png",
    tagline: "Find work. Hire talent.",
  },
  education: {
    name: "SMAJ EDUCATION",
    icon: "/assets/services/education.png",
    tagline: "Learn more. Grow freely.",
  },
  transport: {
    name: "SMAJ TRANSPORT",
    icon: "/assets/services/transport.png",
    tagline: "Move smarter. Go further.",
  },
  health: {
    name: "SMAJ HEALTH",
    icon: "/assets/services/health.png",
    tagline: "Better care. Healthier lives.",
  },
};

const displayServiceName = (slug: string) => {
  if (slug === "food") return "SMAJ Food";
  return `SMAJ ${slug.charAt(0).toUpperCase()}${slug.slice(1)}`;
};

const serviceEntrySlug = (pathname: string) => {
  const match = pathname.match(/^\/(?:app\/)?services\/([^/]+)\/?$/);
  const slug = match?.[1] === "food-delivery" ? "food" : match?.[1];
  if (pathname === "/store") return "store";
  return serviceCatalog.some((service) => service.slug === slug)
    ? slug
    : undefined;
};

const ServiceLaunchGate = () => {
  const content = useSiteContent();
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as {
    serviceLaunch?: string;
    inProgressEntry?: string;
  } | null;
  const slug = state?.serviceLaunch;
  const entrySlug =
    serviceEntrySlug(location.pathname) || state?.inProgressEntry;
  const inProgressSlug =
    entrySlug && getServiceLaunchStatus(entrySlug) === "in-progress"
      ? entrySlug
      : undefined;
  const entryKey = location.key + ":" + inProgressSlug;
  const [confirmedProgressSlug, setConfirmedProgressSlug] = useState<
    string | null
  >(null);
  const config =
    slug && brandedServiceLaunchSlugs.includes(slug as BrandedServiceLaunchSlug)
      ? serviceLaunchConfig[slug as BrandedServiceLaunchSlug]
      : null;

  if (inProgressSlug && confirmedProgressSlug !== entryKey) {
    const serviceName =
      content.services.find((service) => service.slug === inProgressSlug)
        ?.name || displayServiceName(inProgressSlug);
    return createPortal(
      <div
        className="service-progress-warning"
        role="dialog"
        aria-modal="true"
        aria-labelledby="service-progress-title"
      >
        <section className="service-progress-warning-panel">
          <img src="/assets/services/in-progress-warning.png" alt="" />
          <div>
            <span>IN PROGRESS</span>
            <h2 id="service-progress-title">
              {serviceName} is still being prepared
            </h2>
            <p>
              Some features may be incomplete or unavailable while we finish
              this service.
            </p>
            <div className="service-progress-warning-actions">
              <button
                type="button"
                onClick={() =>
                  location.key === "default"
                    ? navigate("/app/services", { replace: true })
                    : navigate(-1)
                }
              >
                Cancel
              </button>
              <button
                type="button"
                autoFocus
                onClick={() => setConfirmedProgressSlug(entryKey)}
              >
                OK, continue
              </button>
            </div>
          </div>
        </section>
      </div>,
      document.body,
    );
  }

  if (!config) return null;

  return (
    <ServiceLaunchSplash
      serviceName={
        content.services.find((service) => service.slug === slug)?.name ||
        config.name
      }
      icon={
        content.services.find((service) => service.slug === slug)?.icon ||
        config.icon
      }
      tagline={config.tagline}
      loadingText={`Opening ${config.name.replace("SMAJ ", "")}...`}
      loading={false}
      onRetry={() => undefined}
      onBack={() => navigate("/app/services", { replace: true })}
      background="#0B0718"
      accent="#7445ff"
      minimumVisibleMs={650}
    />
  );
};

export default ServiceLaunchGate;
