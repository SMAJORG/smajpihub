import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import CookieOutlinedIcon from "@mui/icons-material/CookieOutlined";
import { isCapacitorNative } from "../lib/capacitorPiAuth";
import "./CookieConsent.css";

export const COOKIE_CONSENT_KEY = "smaj_cookie_consent_v1";
export const COOKIE_CONSENT_EVENT = "smaj-cookie-consent-updated";
export const COOKIE_SETTINGS_EVENT = "smaj-cookie-settings-open";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 180;

type Consent = { necessary: true; preferences: boolean; analytics: boolean; marketing: boolean; expiresAt: number };

const readConsent = (): Consent | null => {
  try {
    const value = JSON.parse(window.localStorage.getItem(COOKIE_CONSENT_KEY) || "null") as Consent | null;
    if (!value || value.expiresAt <= Date.now()) return null;
    return value;
  } catch { return null; }
};

const removeOptionalCookies = () => {
  document.cookie.split(";").forEach(part => {
    const name = part.split("=")[0]?.trim();
    if (name && (/^_ga/.test(name) || /^_gid/.test(name) || /^_gcl/.test(name))) {
      document.cookie = `${name}=; Max-Age=0; path=/; SameSite=Lax`;
    }
  });
};

const loadOptionalServices = (consent: Consent) => {
  if (consent.analytics && !document.querySelector('script[data-smaj-consent="analytics"]')) {
    const script = document.createElement("script");
    script.async = true;
    script.src = "https://www.googletagmanager.com/gtag/js?id=G-TV6K9N9NE3";
    script.dataset.smajConsent = "analytics";
    document.head.appendChild(script);
    const analyticsWindow = window as typeof window & { dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void };
    analyticsWindow.dataLayer = analyticsWindow.dataLayer || [];
    analyticsWindow.gtag = (...args: unknown[]) => analyticsWindow.dataLayer?.push(args);
    analyticsWindow.gtag("js", new Date());
    analyticsWindow.gtag("config", "G-TV6K9N9NE3", { anonymize_ip: true });
  }
  if (consent.marketing && !document.querySelector('script[data-smaj-consent="marketing"]')) {
    const script = document.createElement("script");
    script.async = true;
    script.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-5794291397799733";
    script.crossOrigin = "anonymous";
    script.dataset.smajConsent = "marketing";
    document.head.appendChild(script);
  }
  if (!consent.analytics) removeOptionalCookies();
};

const CookieConsent = () => {
  const [visible, setVisible] = useState(false);
  const [settings, setSettings] = useState(false);
  const [preferences, setPreferences] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);

  useEffect(() => {
    if (isCapacitorNative()) return;
    const saved = readConsent();
    if (saved) loadOptionalServices(saved);
    else setVisible(true);
    const openSettings = () => {
      const current = readConsent();
      setPreferences(Boolean(current?.preferences));
      setAnalytics(Boolean(current?.analytics));
      setMarketing(Boolean(current?.marketing));
      setSettings(true);
      setVisible(true);
    };
    window.addEventListener(COOKIE_SETTINGS_EVENT, openSettings);
    return () => window.removeEventListener(COOKIE_SETTINGS_EVENT, openSettings);
  }, []);

  const save = (next: Omit<Consent, "necessary" | "expiresAt">) => {
    const previous = readConsent();
    const consent: Consent = { necessary: true, ...next, expiresAt: Date.now() + MAX_AGE_SECONDS * 1000 };
    window.localStorage.setItem(COOKIE_CONSENT_KEY, JSON.stringify(consent));
    document.cookie = `smaj_cookie_consent=1; Max-Age=${MAX_AGE_SECONDS}; path=/; SameSite=Lax; Secure`;
    loadOptionalServices(consent);
    setVisible(false);
    setSettings(false);
    window.dispatchEvent(new CustomEvent(COOKIE_CONSENT_EVENT, { detail: consent }));
    if ((previous?.analytics && !consent.analytics) || (previous?.marketing && !consent.marketing)) window.location.reload();
  };

  if (!visible || isCapacitorNative()) return null;
  return (
    <div className="cookie-consent-backdrop">
      <section className="cookie-consent" role="dialog" aria-modal={settings} aria-labelledby="cookie-consent-title">
        <header>
          <span className="cookie-consent-icon" aria-hidden="true"><CookieOutlinedIcon /></span>
          <div><strong id="cookie-consent-title">{settings ? "Cookie settings" : "Your privacy choices"}</strong><small>Control optional website cookies</small></div>
          {settings ? <button type="button" className="cookie-consent-close" onClick={() => setSettings(false)} aria-label="Close cookie settings"><CloseRoundedIcon /></button> : null}
        </header>
        {settings ? (
          <div className="cookie-settings-list">
            <label><span><b>Necessary</b><small>Security, login and core website functions.</small></span><input type="checkbox" checked disabled /></label>
            <label><span><b>Preferences</b><small>Remember optional display and experience choices.</small></span><input type="checkbox" checked={preferences} onChange={event => setPreferences(event.target.checked)} /></label>
            <label><span><b>Analytics</b><small>Help us understand and improve website usage.</small></span><input type="checkbox" checked={analytics} onChange={event => setAnalytics(event.target.checked)} /></label>
            <label><span><b>Advertising</b><small>Allow advertising services and measurement.</small></span><input type="checkbox" checked={marketing} onChange={event => setMarketing(event.target.checked)} /></label>
          </div>
        ) : <p>We use necessary cookies to keep SMAJ PI HUB secure and remember your essential settings. With permission, we may also use optional analytics and advertising cookies to improve the platform.</p>}
        <Link className="cookie-policy-link" to="/cookies">Read Cookie Policy</Link>
        <div className="cookie-consent-actions">
          {settings ? <button type="button" onClick={() => save({ preferences, analytics, marketing })}>Save choices</button> : <>
            <button type="button" onClick={() => save({ preferences: true, analytics: true, marketing: true })}>Accept all</button>
            <button type="button" onClick={() => save({ preferences: false, analytics: false, marketing: false })}>Necessary only</button>
            <button type="button" className="cookie-settings-button" onClick={() => setSettings(true)}>Cookie settings</button>
          </>}
        </div>
      </section>
    </div>
  );
};

export default CookieConsent;
