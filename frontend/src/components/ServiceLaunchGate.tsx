import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { getServiceLaunchStatus } from "../content/serviceCatalog";
import ServiceLaunchSplash from "./ServiceLaunchSplash";

export const brandedServiceLaunchSlugs = ["store", "jobs", "education", "transport", "health"] as const;
export type BrandedServiceLaunchSlug = (typeof brandedServiceLaunchSlugs)[number];

const serviceLaunchConfig: Record<BrandedServiceLaunchSlug, { name: string; icon: string; tagline: string }> = {
  store: { name: "SMAJ STORE", icon: "/assets/services/store.png", tagline: "Shop smarter. Sell freely." },
  jobs: { name: "SMAJ JOBS", icon: "/assets/services/jobs.png", tagline: "Find work. Hire talent." },
  education: { name: "SMAJ EDUCATION", icon: "/assets/services/education.png", tagline: "Learn more. Grow freely." },
  transport: { name: "SMAJ TRANSPORT", icon: "/assets/services/transport.png", tagline: "Move smarter. Go further." },
  health: { name: "SMAJ HEALTH", icon: "/assets/services/health.png", tagline: "Better care. Healthier lives." },
};

export const serviceLaunchNavigationState = (slug: string) => {
  if (getServiceLaunchStatus(slug) === "in-progress") return { inProgressEntry: slug };
  if (slug === "stream") return { streamEntry: true };
  return brandedServiceLaunchSlugs.includes(slug as BrandedServiceLaunchSlug) ? { serviceLaunch: slug } : undefined;
};

const displayServiceName = (slug: string) => {
  if (slug === "food") return "SMAJ Food";
  return `SMAJ ${slug.charAt(0).toUpperCase()}${slug.slice(1)}`;
};

const ServiceLaunchGate = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as { serviceLaunch?: string; inProgressEntry?: string } | null;
  const slug = state?.serviceLaunch;
  const inProgressSlug = state?.inProgressEntry;
  const [confirmedProgressSlug, setConfirmedProgressSlug] = useState<string | null>(null);
  const config = slug && brandedServiceLaunchSlugs.includes(slug as BrandedServiceLaunchSlug)
    ? serviceLaunchConfig[slug as BrandedServiceLaunchSlug]
    : null;

  if (inProgressSlug && confirmedProgressSlug !== inProgressSlug) {
    const serviceName = displayServiceName(inProgressSlug);
    return (
      <div className="service-progress-warning" role="dialog" aria-modal="true" aria-labelledby="service-progress-title">
        <section className="service-progress-warning-panel">
          <img src="/assets/services/in-progress-warning.jfif" alt="" />
          <div>
            <span>IN PROGRESS</span>
            <h2 id="service-progress-title">{serviceName} is still being prepared</h2>
            <p>Some features may be incomplete or unavailable while we finish this service.</p>
            <div className="service-progress-warning-actions">
              <button type="button" onClick={() => navigate(-1)}>Cancel</button>
              <button type="button" onClick={() => setConfirmedProgressSlug(inProgressSlug)}>OK, continue</button>
            </div>
          </div>
        </section>
      </div>
    );
  }

  if (!config) return null;

  return (
    <ServiceLaunchSplash
      serviceName={config.name}
      icon={config.icon}
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
