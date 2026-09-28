import { useEffect, useState, type CSSProperties } from "react";
import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import "./ServiceLaunchSplash.css";

export type ServiceLaunchSplashProps = {
  serviceName: string;
  icon: string;
  tagline: string;
  loadingText: string;
  loading: boolean;
  error?: string;
  onRetry: () => void;
  onBack: () => void;
  background?: string;
  accent?: string;
  minimumVisibleMs?: number;
};

const preloadedServiceAssets = new Set<string>();
const preloadServiceAsset = (source: string) => {
  if (typeof Image === "undefined" || preloadedServiceAssets.has(source)) return;
  preloadedServiceAssets.add(source);
  const image = new Image();
  image.decoding = "async";
  image.src = source;
};

const ServiceLaunchSplash = ({
  serviceName,
  icon,
  tagline,
  loadingText,
  loading,
  error = "",
  onRetry,
  onBack,
  background = "#0B0718",
  accent = "#8b4de3",
  minimumVisibleMs = 600,
}: ServiceLaunchSplashProps) => {
  const [minimumElapsed, setMinimumElapsed] = useState(false);
  const visible = loading || Boolean(error) || !minimumElapsed;

  preloadServiceAsset(icon);

  useEffect(() => {
    const timer = window.setTimeout(() => setMinimumElapsed(true), minimumVisibleMs);
    return () => window.clearTimeout(timer);
  }, [minimumVisibleMs]);

  useEffect(() => {
    if (!visible) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onBack();
    };
    window.addEventListener("keydown", handleKey);
    let nativeBackHandle: { remove: () => Promise<void> } | undefined;
    if (Capacitor.isNativePlatform()) {
      void CapacitorApp.addListener("backButton", onBack).then(handle => { nativeBackHandle = handle; });
    }
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKey);
      void nativeBackHandle?.remove();
    };
  }, [onBack, visible]);

  if (!visible) return null;

  const style = {
    "--service-launch-background": background,
    "--service-launch-accent": accent,
  } as CSSProperties;

  return (
    <section
      className={`service-launch-splash${error ? " is-error" : ""}`}
      style={style}
      role={error ? "alertdialog" : "status"}
      aria-modal="true"
      aria-live={error ? "assertive" : "polite"}
      aria-label={error || loadingText}
    >
      <div className="service-launch-splash__ambient" aria-hidden="true" />
      <div className="service-launch-splash__content">
        <div className="service-launch-splash__logo-wrap">
          <img src={icon} alt={`${serviceName} icon`} draggable={false} />
        </div>
        <div className="service-launch-splash__brand">
          <h1>{serviceName}</h1>
          <p>{tagline}</p>
        </div>
        {error ? (
          <div className="service-launch-splash__error">
            <strong>{error}</strong>
            <div>
              <button type="button" onClick={onRetry}>Retry</button>
              <button type="button" className="secondary" onClick={onBack}>Back to Services</button>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
};

export default ServiceLaunchSplash;
