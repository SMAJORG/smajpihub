import { useEffect, useSyncExternalStore } from "react";
import router from "../Router";
import { useSiteContent, refreshSiteContent } from "../lib/siteContent";
import { adPlacements, placementForPath } from "../lib/adPolicy";
import {
  nativeAds,
  supportsAds,
  updateAdConsent,
  useAdConsent,
  useAdsObscured,
  updateAdsObscured,
} from "../lib/nativeAds";

export default function NativeAdsController() {
  const route = useSyncExternalStore(router.subscribe, () => router.state);
  const { ads } = useSiteContent();
  const consent = useAdConsent();
  const obscured = useAdsObscured();
  const path = route.location.pathname;
  const placement = placementForPath(path);
  const active =
    supportsAds() &&
    route.navigation.state === "idle" &&
    ads?.enabled === true &&
    placement &&
    ads.placements?.[placement] === true &&
    consent.allowed &&
    consent.canRequestAds &&
    !obscured;
  const format = placement ? adPlacements[placement].format : undefined;
  useEffect(() => {
    if (!supportsAds()) return;
    void nativeAds
      .refresh()
      .then(updateAdConsent)
      .catch(() => {});
    const refresh = () => {
      void refreshSiteContent().catch(() => {});
    };
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    // Hide ads when the keyboard, app modal, or browser document is obscured.
    const check = () =>
      updateAdsObscured(
        document.hidden ||
          !!document.querySelector('dialog[open], [aria-modal="true"], .sign-in-overlay') ||
          document.activeElement?.matches('input, textarea, [contenteditable="true"]') === true
      );
    const observer = new MutationObserver(check);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["open", "aria-modal"],
    });
    document.addEventListener("focusin", check);
    document.addEventListener("focusout", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      observer.disconnect();
      document.removeEventListener("focusin", check);
      document.removeEventListener("focusout", check);
      document.removeEventListener("visibilitychange", check);
      void nativeAds.hide().catch(() => {});
    };
  }, []);
  useEffect(() => {
    if (!supportsAds()) return;
    if (!active || format === "rewarded") void nativeAds.hide().catch(() => {});
    return () => {
      void nativeAds.hide().catch(() => {});
    };
  }, [active, format, path]);
  return null;
}
