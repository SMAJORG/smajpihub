import { useCallback, useEffect, useRef, useState } from "react";
import { ensurePiInitialized } from "../lib/piSdk";
import "../mobile-pi-bridge.css";

type BridgeStatus = "connecting" | "ready" | "authorizing" | "error";

const waitForPiSdk = async (timeoutMs = 8000) => {
  const deadline = Date.now() + timeoutMs;
  while (!window.Pi?.authenticate && Date.now() < deadline) {
    await new Promise(resolve => window.setTimeout(resolve, 150));
  }
  return Boolean(window.Pi?.authenticate);
};

export default function MobilePiBridgePage() {
  const query = new URLSearchParams(window.location.search);
  const state = query.get("state") || "";
  const [status, setStatus] = useState<BridgeStatus>("connecting");
  const [message, setMessage] = useState("Preparing secure Pi sign-in…");
  const runningRef = useRef(false);

  const authenticate = useCallback(async () => {
    if (runningRef.current) return;
    if (!/^[a-f0-9]{64}$/i.test(state)) {
      setStatus("error");
      setMessage("This Android sign-in request is invalid. Return to SMAJ PI HUB and start again.");
      return;
    }

    runningRef.current = true;
    setStatus("authorizing");
    setMessage("Approve the request with your Pi account.");

    try {
      if (!(await waitForPiSdk())) {
        throw new Error("Pi authentication is available only inside Pi Browser.");
      }

      await ensurePiInitialized();

      const authResult = await window.Pi!.authenticate(
        ["username"],
        () => undefined
      );
      if (!authResult.accessToken) throw new Error("Pi did not return an access token.");

      const fragment = new URLSearchParams({
        access_token: authResult.accessToken,
        state,
      });
      window.location.assign(`smajpihub://oauth/pi#${fragment.toString()}`);
    } catch (error) {
      runningRef.current = false;
      setStatus("error");
      setMessage((error as Error)?.message || "Pi sign-in failed. Please try again.");
    }
  }, [state]);

  useEffect(() => {
    let cancelled = false;
    void waitForPiSdk().then(available => {
      if (cancelled) return;
      if (!available) {
        setStatus("error");
        setMessage("Open this page inside Pi Browser to continue.");
        return;
      }
      setStatus("ready");
      setMessage("Continue with your signed-in Pi account.");
      window.setTimeout(() => void authenticate(), 250);
    });
    return () => { cancelled = true; };
  }, [authenticate]);

  return (
    <main className="mobile-pi-bridge">
      <section>
        <img src="/logo.png" alt="SMAJ PI HUB" />
        <p className="mobile-pi-bridge__eyebrow">SMAJ PI HUB ANDROID</p>
        <h1>Continue with Pi</h1>
        <p>{message}</p>
        <button
          type="button"
          onClick={() => void authenticate()}
          disabled={status === "connecting" || status === "authorizing"}
        >
          {status === "authorizing" ? "Waiting for Pi…" : "Approve with Pi"}
        </button>
        <small>After approval, Pi Browser will return you securely to the SMAJ PI HUB app.</small>
      </section>
    </main>
  );
}
