export const FALLBACK_STANDALONE_AI_URL = "https://smaj-verified-delegation.onrender.com";
const UNRESOLVED_HOST = "ai.smajpihub.com";

/** Resolve an operator-configured HTTPS origin and retain in-app URL state. */
export function standaloneAiDestination(configuredUrl, search = "", hash = "") {
  let origin = FALLBACK_STANDALONE_AI_URL;
  if (typeof configuredUrl === "string" && configuredUrl.trim()) {
    try {
      const parsed = new URL(configuredUrl.trim());
      const hostname = parsed.hostname.toLowerCase().replace(/\.$/, "");
      if (parsed.protocol === "https:" && !parsed.username && !parsed.password && hostname !== UNRESOLVED_HOST) {
        origin = parsed.origin;
      }
    } catch {
      // An invalid build-time URL uses the documented, reachable fallback.
    }
  }
  const query = search ? (search.startsWith("?") ? search : `?${search}`) : "";
  const fragment = hash ? (hash.startsWith("#") ? hash : `#${hash}`) : "";
  return `${origin}/${query}${fragment}`;
}
