import { useEffect } from "react";
import { refreshSiteContent } from "../lib/siteContent";
export default function SiteContentLoader() {
  useEffect(() => {
    const refresh = () => {
      void refreshSiteContent().catch(() => undefined);
    };
    refresh();
    const timer = window.setInterval(refresh, 60000);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
    };
  }, []);
  return null;
}
