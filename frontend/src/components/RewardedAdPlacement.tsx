import { useState } from "react";
import { useLocation } from "react-router-dom";
import { useSiteContent } from "../lib/siteContent";
import { placementForPath } from "../lib/adPolicy";
import { nativeAds, supportsAds, useAdConsent } from "../lib/nativeAds";

export default function RewardedAdPlacement() {
  const { pathname } = useLocation();
  const { ads } = useSiteContent();
  const consent = useAdConsent();
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  if (
    !supportsAds() ||
    !ads?.enabled ||
    !ads.placements.discoveryReward ||
    !consent.allowed ||
    !consent.canRequestAds ||
    placementForPath(pathname) !== "discoveryReward"
  )
    return null;
  return (
    <section aria-label="Optional test ad" style={{ padding: 16 }}>
      <p>Optional: watch a test ad to receive a thank-you message. No Pi, tokens, or payment credit is awarded.</p>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setMessage("");
          try {
            const result = await nativeAds.reward();
            setMessage(
              result.earned ? "Thank you for supporting SMAJ PI HUB!" : "Ad closed. You can continue browsing."
            );
          } catch {
            setMessage("Ad unavailable. You can continue browsing.");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Loading optional ad…" : "Watch optional test ad"}
      </button>
      <p role="status">{message}</p>
    </section>
  );
}
