import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import AndroidRoundedIcon from "@mui/icons-material/AndroidRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import DownloadRoundedIcon from "@mui/icons-material/DownloadRounded";
import { isCapacitorNative } from "../lib/capacitorPiAuth";
import { COOKIE_CONSENT_EVENT, COOKIE_CONSENT_KEY } from "./CookieConsent";
import "./AndroidDownloadPrompt.css";

const HIDDEN_UNTIL_KEY = "smaj_android_prompt_hidden_until";
const SHOWN_THIS_SESSION_KEY = "smaj_android_prompt_shown";
const DAY = 24 * 60 * 60 * 1000;
const isEligiblePath = (pathname: string) =>
  ["/home", "/about", "/services", "/white-paper", "/how-it-works", "/onboarding", "/contact"].includes(pathname) || pathname.startsWith("/services/");

const AndroidDownloadPrompt = () => {
  const { pathname } = useLocation();
  const [visible, setVisible] = useState(false);
  const [consentRevision, setConsentRevision] = useState(0);

  useEffect(() => {
    const handleConsent = () => setConsentRevision(value => value + 1);
    window.addEventListener(COOKIE_CONSENT_EVENT, handleConsent);
    return () => window.removeEventListener(COOKIE_CONSENT_EVENT, handleConsent);
  }, []);

  useEffect(() => {
    setVisible(false);
    if (!isEligiblePath(pathname) || isCapacitorNative() || !window.localStorage.getItem(COOKIE_CONSENT_KEY)) return;
    const userAgent = navigator.userAgent || "";
    const isAndroid = /Android/i.test(userAgent);
    const isPiBrowser = /PiBrowser|Pi Browser/i.test(userAgent);
    const isPiHost = window.location.hostname === "sandbox.minepi.com" || document.referrer.includes("sandbox.minepi.com");
    const isPhoneOrTablet = window.matchMedia("(max-width: 1023px)").matches;
    const hiddenUntil = Number(window.localStorage.getItem(HIDDEN_UNTIL_KEY) || 0);
    const shownThisSession = window.sessionStorage.getItem(SHOWN_THIS_SESSION_KEY) === "true";
    if (!isAndroid || !isPhoneOrTablet || isPiBrowser || isPiHost || shownThisSession || hiddenUntil > Date.now()) return;
    const timer = window.setTimeout(() => {
      window.sessionStorage.setItem(SHOWN_THIS_SESSION_KEY, "true");
      setVisible(true);
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [pathname, consentRevision]);

  const hideFor = (days: number) => {
    window.localStorage.setItem(HIDDEN_UNTIL_KEY, String(Date.now() + days * DAY));
    setVisible(false);
  };

  if (!visible) return null;
  return (
    <aside className="android-download-prompt" role="dialog" aria-labelledby="android-download-title">
      <button className="android-download-close" type="button" onClick={() => hideFor(7)} aria-label="Close download app message"><CloseRoundedIcon /></button>
      <div className="android-download-icon" aria-hidden="true"><AndroidRoundedIcon /></div>
      <div className="android-download-copy"><strong id="android-download-title">Get SMAJ PI HUB on Android</strong><span>Faster access to your services, messages and account.</span></div>
      <Link className="android-download-action" to="/download" onClick={() => hideFor(30)}><DownloadRoundedIcon /> Download App</Link>
    </aside>
  );
};

export default AndroidDownloadPrompt;
