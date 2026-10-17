import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { adPlacements, placementForPath, canDisplayAdSlot } from "../lib/adPolicy";
import { useSiteContent } from "../lib/siteContent";
import { nativeAds, supportsAds, useAdConsent, useAdsObscured } from "../lib/nativeAds";

/** Empty page space is reserved before a native view may be displayed over it. */
export default function NativeAdSlot() {
  const { pathname } = useLocation();
  const { ads } = useSiteContent();
  const consent = useAdConsent(),
    obscured = useAdsObscured();
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(window.innerWidth);
  const placement = placementForPath(pathname);
  const format = placement ? adPlacements[placement].format : undefined;
  const active =
    supportsAds() &&
    !!placement &&
    ads?.enabled === true &&
    ads.placements?.[placement] === true &&
    consent.allowed &&
    consent.canRequestAds &&
    !obscured;
  useEffect(() => {
    if (!supportsAds()) return;
    const resize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  useEffect(() => {
    setHeight(0);
    if (!active || (format !== "banner" && format !== "native")) return;
    let disposed = false;
    const listener = nativeAds.addListener("unavailable", () => {
      if (!disposed) setHeight(0);
    });
    const width = Math.floor(ref.current?.getBoundingClientRect().width || 0);
    if (width < 120)
      return () => {
        disposed = true;
        void listener.then(handle => handle.remove()).catch(() => {});
      };
    void nativeAds
      .show({ format, width })
      .then(result => {
        if (!disposed) setHeight(result.height || 0);
      })
      .catch(() => {
        if (!disposed) setHeight(0);
      });
    return () => {
      disposed = true;
      void listener.then(handle => handle.remove()).catch(() => {});
      void nativeAds.hide().catch(() => {});
    };
  }, [active, format, pathname, viewportWidth]);
  useEffect(() => {
    if (!height || !supportsAds()) return;
    const position = () => {
      const rect = ref.current?.getBoundingClientRect();
      if (!rect) return;
      const nav = document.querySelector(".mobile-bottom-nav")?.getBoundingClientRect();
      const bottom = nav && nav.height > 0 ? nav.top : window.innerHeight;
      const blockers = [
        ...document.querySelectorAll(".private-header, .live-activity-float, .mobile-ai-fab, .private-profile-menu"),
      ]
        .filter(element => ["fixed", "sticky"].includes(getComputedStyle(element).position))
        .map(element => element.getBoundingClientRect());
      // Never draw a partial ad, cover navigation, or draw outside its empty slot.
      const visible = !document.hidden && canDisplayAdSlot(rect, window.innerWidth, bottom, blockers);
      void nativeAds
        .position({
          visible,
          viewportWidth: window.innerWidth,
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
        })
        .catch(() => {});
    };
    position();
    const observer = new ResizeObserver(position);
    if (ref.current) observer.observe(ref.current);
    document.addEventListener("scroll", position, true);
    window.addEventListener("resize", position);
    window.visualViewport?.addEventListener("resize", position);
    return () => {
      observer.disconnect();
      document.removeEventListener("scroll", position, true);
      window.removeEventListener("resize", position);
      window.visualViewport?.removeEventListener("resize", position);
    };
  }, [height]);
  if (!active || format === "rewarded") return null;
  return (
    <div
      ref={ref}
      aria-label={height ? "Advertisement" : undefined}
      style={{ height, width: "100%", marginBottom: height ? 12 : 0, overflow: "hidden" }}
    />
  );
}
