import "./ServicesHubPage.css";
import { useState } from "react";
import { Link } from "react-router-dom";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import ServiceArt from "../../components/ServiceArt";
import AmbassadorServicesPanel from "../../components/AmbassadorServicesPanel";
import RewardedAdPlacement from "../../components/RewardedAdPlacement";
import {
  getServiceLaunchLabel,
  getServiceLaunchStatus,
  serviceAppPath,
  serviceCatalog,
} from "../../content/serviceCatalog";
import { serviceLaunchNavigationState } from "../../lib/serviceLaunch";
import { useSiteContent } from "../../lib/siteContent";

const categories = [
  {
    name: "Everyday life",
    slugs: [
      "store",
      "food",
      "health",
      "transport",
      "agro",
      "energy",
      "housing",
      "charity",
    ],
  },
  {
    name: "Work, learning & entertainment",
    slugs: ["jobs", "education", "stream", "sports", "events"],
  },
  { name: "Pi ecosystem", slugs: ["swap", "token"] },
];

export default function ServicesHubPage() {
  const [search, setSearch] = useState("");
  useSiteContent();
  const query = search.trim().toLocaleLowerCase();
  const groups = categories
    .map((category) => ({
      ...category,
      services: serviceCatalog.filter(
        (service) =>
          category.slugs.includes(service.slug) &&
          [service.name, service.description, ...service.items]
            .join(" ")
            .toLocaleLowerCase()
            .includes(query),
      ),
    }))
    .filter((category) => category.services.length);

  return (
    <main className="private-page services-launcher services-hub-directory">
      <header className="services-hub-directory-heading">
        <h1>All Services</h1>
        <p>Access multiple digital services from anywhere you are.</p>
      </header>
      <label className="services-hub-directory-search">
        <SearchOutlinedIcon aria-hidden="true" />
        <span className="services-search-label">Search services</span>
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search services..."
          autoComplete="off"
        />
      </label>
      <AmbassadorServicesPanel />
      <div className="services-hub-directory-categories">
        {groups.map((category) => (
          <section
            className="services-hub-directory-category"
            key={category.name}
            aria-label={category.name}
          >
            <h2>{category.name}</h2>
            <div className="services-hub-directory-grid">
              {category.services.map((service) => (
                <Link
                  className="services-hub-directory-item"
                  key={service.slug}
                  to={
                    service.live
                      ? serviceAppPath(service.slug)
                      : `/app/services/${service.slug}`
                  }
                  state={serviceLaunchNavigationState(service.slug)}
                  aria-label={`${service.name}: ${getServiceLaunchLabel(service.slug)}`}
                  title={service.description}
                >
                  <ServiceArt index={service.atlasIndex} />
                  <strong>{service.name.replace("SMAJ ", "")}</strong>
                  <span
                    className={`services-hub-directory-status ${getServiceLaunchStatus(service.slug)}`}
                  >
                    {getServiceLaunchLabel(service.slug)}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        ))}
        {!groups.length ? (
          <div className="services-hub-directory-empty" role="status">
            <strong>No service matches your search.</strong>
            <button type="button" onClick={() => setSearch("")}>
              Clear search
            </button>
          </div>
        ) : null}
      </div>
      <RewardedAdPlacement />
    </main>
  );
}
