import { useEffect } from "react";
import { Navigate, useLocation, useParams } from "react-router-dom";
import { serviceAppPath, serviceCatalog } from "../../content/serviceCatalog";

/** Keep saved app links working without rendering the retired placeholder. */
export default function ServiceRouteRedirect() {
  const { slug } = useParams();
  const location = useLocation();
  const service = serviceCatalog.find(
    (item) =>
      item.slug === slug || (slug === "food-delivery" && item.slug === "food"),
  );
  const to = service ? serviceAppPath(service.slug) : "/app/services";
  useEffect(() => {
    if (!service) return;
    try {
      const stored = JSON.parse(
        localStorage.getItem("smaj_recent_services") || "[]",
      );
      const recent = Array.isArray(stored) ? stored : [];
      localStorage.setItem(
        "smaj_recent_services",
        JSON.stringify(
          [
            { label: service.name, to, meta: "Service" },
            ...recent.filter(
              (item) => item?.to !== to && item?.to !== location.pathname,
            ),
          ].slice(0, 8),
        ),
      );
    } catch {
      /* A storage failure must not prevent navigation. */
    }
  }, [service, to, location.pathname]);
  return (
    <Navigate
      to={to + location.search + location.hash}
      state={location.state}
      replace
    />
  );
}
