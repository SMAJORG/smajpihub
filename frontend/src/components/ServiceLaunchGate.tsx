import { useLocation, useNavigate } from "react-router-dom";
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
  if (slug === "stream") return { streamEntry: true };
  return brandedServiceLaunchSlugs.includes(slug as BrandedServiceLaunchSlug) ? { serviceLaunch: slug } : undefined;
};

const ServiceLaunchGate = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const slug = (location.state as { serviceLaunch?: string } | null)?.serviceLaunch;
  const config = slug && brandedServiceLaunchSlugs.includes(slug as BrandedServiceLaunchSlug)
    ? serviceLaunchConfig[slug as BrandedServiceLaunchSlug]
    : null;

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
