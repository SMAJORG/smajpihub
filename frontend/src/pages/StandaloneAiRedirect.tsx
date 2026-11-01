import { useEffect } from "react";
import { standaloneAiDestination } from "../lib/standaloneAiUrl.js";

// Public entry navigation must not depend on the server-to-server AI bridge.
// The standalone app owns its own public session and protected-action SSO flows.
export default function StandaloneAiRedirect() {
  const destination = standaloneAiDestination(import.meta.env.VITE_SMAJ_AI_PUBLIC_URL, window.location.search, window.location.hash);

  useEffect(() => {
    // Same-tab navigation works in mobile Pi Browser and avoids popup blockers.
    window.location.replace(destination);
  }, [destination]);

  return <main role="status" aria-live="polite" style={{ minHeight: "55vh", display: "grid", placeContent: "center", gap: 12, padding: 24, textAlign: "center" }}>
    <p>Opening the complete SMAJ AI experience…</p>
    <a href={destination}>Continue to SMAJ AI</a>
  </main>;
}
