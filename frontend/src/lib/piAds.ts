import { ensurePiInitialized } from "./piSdk";

// Official API: https://developers.minepi.com/docs/api-reference/SdkReference
// This integration is interstitial-only: no rewards, API keys or payment calls.
export const isPiBrowserForAds = () => /PiBrowser|Pi Browser/i.test(navigator.userAgent);
export const piAdsEnabled = () => import.meta.env.VITE_PI_ADS_ENABLED === "true";
const COOLDOWN_KEY = "smaj_pi_ad_next_attempt_v1";
const COOLDOWN_MS = 120000;
const listeners = new Set<() => void>();
let snapshot = { busy: false, nextAllowedAt: 0 };
const publish = (value: typeof snapshot) => { snapshot = value; listeners.forEach(fn => fn()); };
export const subscribePiAds = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const getPiAdState = () => snapshot;
export const allowsPiAds = () => {
  try {
    const consent = JSON.parse(localStorage.getItem("smaj_cookie_consent_v1") || "null");
    return !(consent?.expiresAt > Date.now() && consent.marketing === false);
  } catch { return true; }
};
export const canShowDashboardPiAd = () =>
  piAdsEnabled() && isPiBrowserForAds() && allowsPiAds() &&
  window.location.pathname === "/dashboard" && !document.hidden &&
  !document.querySelector('dialog[open], [aria-modal="true"], .sign-in-overlay, .cookie-consent-backdrop, .welcome-tour-overlay') &&
  !document.activeElement?.matches('input, textarea, select, [contenteditable="true"]');

type Sdk = NonNullable<Window["Pi"]>;
const eligibility = new WeakMap<Sdk, Promise<boolean>>();
export function supportsPiAds(): Promise<boolean> {
  if (!piAdsEnabled() || !isPiBrowserForAds() || !allowsPiAds() || !window.Pi) return Promise.resolve(false);
  const sdk = window.Pi;
  const existing = eligibility.get(sdk);
  if (existing) return existing;
  const check = (async () => {
    await ensurePiInitialized();
    if (!sdk.nativeFeaturesList || !sdk.Ads?.isAdReady || !sdk.Ads.requestAd || !sdk.Ads.showAd) return false;
    return (await sdk.nativeFeaturesList()).includes("ad_network");
  })();
  eligibility.set(sdk, check);
  void check.catch(() => eligibility.delete(sdk));
  return check;
}
export type PiAdOutcome = "closed" | "unavailable" | "unsupported" | "error" | "busy" | "cooldown" | "cancelled" | "timeout";
function nextAllowedAt() {
  try { return Math.max(snapshot.nextAllowedAt, Number(sessionStorage.getItem(COOLDOWN_KEY)) || 0); }
  catch { return snapshot.nextAllowedAt; }
}
export function showDashboardPiAd(stillEligible: () => boolean): Promise<PiAdOutcome> {
  if (snapshot.busy) return Promise.resolve("busy");
  if (!canShowDashboardPiAd() || !stillEligible()) return Promise.resolve("cancelled");
  const next = nextAllowedAt();
  if (next > Date.now()) {
    publish({ ...snapshot, nextAllowedAt: next });
    return Promise.resolve("cooldown");
  }
  const deadline = Date.now() + COOLDOWN_MS;
  // Lock synchronously, before any SDK await: double clicks/remounts cannot overlap.
  publish({ busy: true, nextAllowedAt: deadline });
  try { sessionStorage.setItem(COOLDOWN_KEY, String(deadline)); } catch { /* in-memory cap remains active */ }
  const run = async (): Promise<PiAdOutcome> => {
    try {
      if (!await supportsPiAds()) return "unsupported";
      const ads = window.Pi!.Ads!;
      const ready = await ads.isAdReady("interstitial");
      if (!canShowDashboardPiAd() || !stillEligible()) return "cancelled";
      if (ready.ready !== true) {
        const requested = await ads.requestAd("interstitial");
        if (requested.result === "ADS_NOT_SUPPORTED") return "unsupported";
        if (requested.result !== "AD_LOADED") return "unavailable";
      }
      // Never display after navigation, logout, consent withdrawal or a modal opening.
      if (!canShowDashboardPiAd() || !stillEligible()) return "cancelled";
      const response = await ads.showAd("interstitial");
      switch (response.result) {
        case "AD_CLOSED": return "closed";
        case "AD_NOT_AVAILABLE": return "unavailable";
        case "ADS_NOT_SUPPORTED": return "unsupported";
        default: return "error";
      }
    } catch { return "error"; }
    finally { publish({ ...snapshot, busy: false }); }
  };
  const task = run();
  // A watchdog releases the UI, not the SDK lock. A delayed native ad must settle
  // before any other request can start. No automatic retries or artificial views.
  return new Promise(resolve => {
    const timer = window.setTimeout(() => resolve("timeout"), 45000);
    void task.then(result => { window.clearTimeout(timer); resolve(result); });
  });
}
