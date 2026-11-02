import type { ServiceDefinition } from "../../content/serviceCatalog";

const directArtwork: Record<string, string> = {
  store: "/assets/services/store.png",
  jobs: "/assets/services/jobs.png",
  education: "/assets/services/education.png",
  health: "/assets/services/health.png",
  transport: "/assets/services/transport.png",
};

export default function EmbeddedServiceIcon({ service }: { service: ServiceDefinition }) {
  const image = directArtwork[service.slug];
  return <span
    className="serviceBadge hubServiceIcon"
    aria-hidden="true"
    data-service={service.slug}
    style={{
      backgroundColor: "transparent",
      backgroundImage: `url('${image || "/assets/smaj-service-atlas.png"}')`,
      backgroundPosition: image ? "center" : `${(service.atlasIndex % 5) * 25}% ${Math.floor(service.atlasIndex / 5) * 50}%`,
      backgroundRepeat: "no-repeat",
      backgroundSize: image ? "contain" : "500% 300%",
    }}
  />;
}
