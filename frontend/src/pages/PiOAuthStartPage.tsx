import { useEffect, useRef, useState } from "react";
import { ensurePiInitialized } from "../lib/piSdk";
import { reportSoloHostOAuthStartError, startSoloHostPiSignIn } from "../lib/soloHostPiAuth";

export default function PiOAuthStartPage() {
  const state = new URLSearchParams(window.location.search).get("state") || "";
  const validState = /^[a-f\d]{64}$/i.test(state);
  const started = useRef(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (!validState) return;

    void (async () => {
      try {
        await ensurePiInitialized();
        await startSoloHostPiSignIn(state);
      } catch (reason) {
        const message = reason instanceof Error ? reason.message : "Pi Sign-In could not be started. Please try again.";
        reportSoloHostOAuthStartError(state, message);
        setError(message);
      }
    })();
  }, [state, validState]);

  return (
    <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 24, background: "#f6f7fb" }}>
      <section style={{ width: "min(100%, 440px)", padding: 28, border: "1px solid #e1e7e4", borderRadius: 22, background: "#fff", textAlign: "center" }}>
        <p style={{ margin: 0, color: "#6c3fe6", fontWeight: 800, letterSpacing: 1 }}>SMAJ PI HUB</p>
        <h1 style={{ margin: "12px 0", color: "#17231f" }}>Pi Sign-In</h1>
        <p style={{ margin: 0, color: "#66756f", lineHeight: 1.6 }}>
          {error || (validState ? "Opening the official Pi authentication page…" : "This Pi Sign-In request is invalid. Close this window and try again.")}
        </p>
      </section>
    </main>
  );
}
