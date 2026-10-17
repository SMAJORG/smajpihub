import { useState } from "react";
import { nativeAds, supportsAds, updateAdConsent, useAdConsent } from "../lib/nativeAds";

export default function AdPrivacyControls() {
  const consent = useAdConsent();
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  if (!supportsAds()) return null;
  const change = async (allowed: boolean) => {
    setBusy(true);
    setMessage("");
    try {
      updateAdConsent(await nativeAds.consent({ allowed }));
    } catch {
      setMessage("Ads remain unavailable. You can continue using the app.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <details className="settings-ad-privacy">
      <summary className="setting-line"><span><strong>Advertising privacy</strong><small>Manage optional ads and consent on this device</small></span><span className="settings-ad-chevron" aria-hidden="true">&#8250;</span></summary>
      <section aria-label="Advertising privacy options" className="settings-ad-options">
      <p>Optional ads help support SMAJ PI HUB. You can use every app feature with ads disabled.</p>
      <button type="button" disabled={busy} onClick={() => void change(!consent.allowed)}>
        {consent.allowed ? "Disable ads on this device" : "Review consent and allow test ads"}
      </button>
      {consent.allowed && !consent.canRequestAds ? (
        <button type="button" disabled={busy} onClick={() => void change(true)}>
          Review consent
        </button>
      ) : null}
      {consent.privacyRequired ? (
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setMessage("");
            try {
              updateAdConsent(await nativeAds.privacy());
            } catch {
              setMessage("Privacy options are unavailable. You can disable ads above.");
            } finally {
              setBusy(false);
            }
          }}
        >
          Manage privacy choices
        </button>
      ) : null}
      <p role="status">{message}</p>
      </section>
    </details>
  );
}
