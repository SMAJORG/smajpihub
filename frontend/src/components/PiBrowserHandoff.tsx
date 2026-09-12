import { useCallback, useEffect, useMemo, useState } from "react";
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import ContentCopyOutlinedIcon from "@mui/icons-material/ContentCopyOutlined";
import OpenInNewOutlinedIcon from "@mui/icons-material/OpenInNewOutlined";
import QrCode2OutlinedIcon from "@mui/icons-material/QrCode2Outlined";
import QRCode from "qrcode";
import { Capacitor } from "@capacitor/core";
import { PI_BROWSER_HANDOFF_EVENT, type PiBrowserHandoffDetail } from "../lib/piBrowserHandoff";
import logoImage from "/logo.png";

const ANDROID_URL = "https://play.google.com/store/apps/details?id=pi.browser";
const IOS_URL = "https://apps.apple.com/us/app/pi-browser/id1560911608";

const AUTO_HANDOFF_DISMISSED_KEY = "smaj_pi_handoff_dismissed";
const PiBrowserHandoff = () => {
  const [detail, setDetail] = useState<PiBrowserHandoffDetail | null>(null);
  const [qrCode, setQrCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [isPhone, setIsPhone] = useState(() => window.matchMedia("(max-width: 600px)").matches);

  const publicUrl = useMemo(
    () => (detail ? new URL(detail.path || "/", window.location.origin).toString() : ""),
    [detail]
  );
  const piUrl = useMemo(
    () =>
      detail
        ? `pi://${window.location.host}${new URL(publicUrl).pathname}${new URL(publicUrl).search}${new URL(publicUrl).hash}`
        : "",
    [detail, publicUrl]
  );
  useEffect(() => {
    if (Capacitor.isNativePlatform()) return;
    const isMobileOrTablet = window.matchMedia("(max-width: 1023px)").matches;
    const isPiBrowser = /PiBrowser|Pi Browser/i.test(navigator.userAgent || "");
    const isMinePiSandbox =
      window.location.hostname === "sandbox.minepi.com" || document.referrer.includes("sandbox.minepi.com");
    const dismissed = window.sessionStorage.getItem(AUTO_HANDOFF_DISMISSED_KEY) === "true";
    const isAndroid = /Android/i.test(navigator.userAgent || "");
    const isDownloadPromptPage = ["/home", "/about", "/services", "/white-paper", "/how-it-works", "/onboarding", "/contact"].includes(window.location.pathname) || window.location.pathname.startsWith("/services/");
    if (!isMobileOrTablet || isPiBrowser || isMinePiSandbox || dismissed || (isAndroid && isDownloadPromptPage)) return;

    const timer = window.setTimeout(() => {
      setDetail({
        reason: "Open SMAJ PI HUB in Pi Browser",
        path: `${window.location.pathname}${window.location.search}${window.location.hash}`,
        automatic: true,
      });
    }, 500);
    return () => window.clearTimeout(timer);
  }, []);

  const closeHandoff = useCallback(() => {
    if (detail?.automatic) window.sessionStorage.setItem(AUTO_HANDOFF_DISMISSED_KEY, "true");
    setDetail(null);
  }, [detail?.automatic]);


  useEffect(() => {
    const open = (event: Event) => {
      const isMinePiSandbox =
        window.location.hostname === "sandbox.minepi.com" || document.referrer.includes("sandbox.minepi.com");
      if (isMinePiSandbox) return;
      setDetail((event as CustomEvent<PiBrowserHandoffDetail>).detail || {});
    };
    window.addEventListener(PI_BROWSER_HANDOFF_EVENT, open);
    return () => window.removeEventListener(PI_BROWSER_HANDOFF_EVENT, open);
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 600px)");
    const update = () => setIsPhone(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!detail || isPhone || !piUrl) return;
    void QRCode.toDataURL(piUrl, {
      width: 240,
      margin: 2,
      color: { dark: "#5b2781", light: "#ffffff" },
      errorCorrectionLevel: "M",
    })
      .then(setQrCode)
      .catch(() => setQrCode(""));
  }, [detail, isPhone, piUrl]);

  useEffect(() => {
    if (!detail) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeHandoff();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [closeHandoff, detail]);

  if (!detail) return null;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt("Copy this link and open it in Pi Browser", publicUrl);
    }
  };

  return (
    <div
      className="pi-handoff-backdrop"
      role="presentation"
      onMouseDown={event => {
        if (event.target === event.currentTarget) closeHandoff();
      }}
    >
      <section
        className={`pi-handoff-modal ${isPhone ? "phone" : "tablet"}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pi-handoff-title"
      >
        <button
          type="button"
          className="pi-handoff-close"
          onClick={closeHandoff}
          aria-label="Close and continue browsing"
        >
          <CloseOutlinedIcon />
        </button>
        <img className="pi-handoff-logo" src={logoImage} alt="SMAJ PI HUB" />
        <span className="pi-handoff-kicker">{detail.reason || "Continue with Pi"}</span>
        <h2 id="pi-handoff-title">Continue securely in Pi Browser</h2>
        <p>
          {isPhone
            ? "Open this exact page in Pi Browser to use Pi login and payment."
            : "Scan this QR code with your phone to open this exact page in Pi Browser."}
        </p>
        {!isPhone ? (
          <div className="pi-handoff-qr">
            {qrCode ? <img src={qrCode} alt="QR code to open this page in Pi Browser" /> : <QrCode2OutlinedIcon />}
          </div>
        ) : null}
        <div className="pi-handoff-actions">
          <a className="pi-handoff-primary" href={piUrl}>
            <OpenInNewOutlinedIcon /> Open Pi Browser
          </a>
          <button type="button" onClick={() => void copyLink()}>
            <ContentCopyOutlinedIcon /> {copied ? "Link copied" : "Copy link"}
          </button>
        </div>
        <div className="pi-handoff-downloads" aria-label="Download Pi Browser">
          <span>Need Pi Browser?</span>
          <a href={ANDROID_URL} target="_blank" rel="noreferrer">
            Google Play
          </a>
          <a href={IOS_URL} target="_blank" rel="noreferrer">
            App Store
          </a>
        </div>
        <button type="button" className="pi-handoff-continue" onClick={closeHandoff}>
          Continue browsing
        </button>
      </section>
    </div>
  );
};

export default PiBrowserHandoff;
