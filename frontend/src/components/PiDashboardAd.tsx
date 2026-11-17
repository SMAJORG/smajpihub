import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useLocation } from "react-router-dom";
import { useAuthContext } from "../contexts/AuthContext";
import { getPiAdState, subscribePiAds, supportsPiAds, showDashboardPiAd, type PiAdOutcome } from "../lib/piAds";
import "./PiDashboardAd.css";

const messages: Record<PiAdOutcome, string> = {
  closed: "Advertisement closed. You can continue using SMAJ PI HUB.",
  unavailable: "No advertisement is available right now. Try again later.",
  unsupported: "Pi ads are unavailable in this browser version.",
  error: "The advertisement could not open. You can continue normally.",
  busy: "An advertisement request is already in progress.",
  cooldown: "Please wait before requesting another advertisement.",
  cancelled: "Advertisement cancelled. You can continue normally.",
  timeout: "The ad response is delayed. You can continue using SMAJ PI HUB.",
};
export default function PiDashboardAd() {
  const { user, isLoading, showSignIn } = useAuthContext();
  const { pathname } = useLocation();
  const state = useSyncExternalStore(subscribePiAds, getPiAdState);
  const [supported, setSupported] = useState(false);
  const [message, setMessage] = useState("");
  const [now, setNow] = useState(Date.now);
  const active = useRef(false);
  const userRef = useRef(user?.uid);
  userRef.current = user?.uid;
  active.current = pathname === "/dashboard" && Boolean(user?.uid) && !isLoading && !showSignIn;
  useEffect(() => {
    let mounted = true;
    const check = () => { void supportsPiAds().then(value => { if (mounted) setSupported(value); }).catch(() => { if (mounted) setSupported(false); }); };
    check();
    window.addEventListener("smaj-cookie-consent-updated", check);
    return () => { mounted = false; active.current = false; window.removeEventListener("smaj-cookie-consent-updated", check); };
  }, []);
  useEffect(() => {
    if (state.nextAllowedAt <= Date.now()) return;
    const timer = window.setInterval(() => { setNow(Date.now()); if (Date.now() >= state.nextAllowedAt) window.clearInterval(timer); }, 1000);
    return () => window.clearInterval(timer);
  }, [state.nextAllowedAt]);
  if (!supported || !active.current) return null;
  const cooling = state.nextAllowedAt > now;
  const show = async () => {
    const owner = user!.uid;
    setMessage("Opening advertisement…");
    const result = await showDashboardPiAd(() => active.current && owner === userRef.current);
    if (active.current) setMessage(messages[result]);
  };
  return <section className="pi-dashboard-ad" aria-label="Pi advertisement">
    <div><small>Advertisement · Pi Ad Network</small><p>Optional full-screen ad served by Pi. You can use all SMAJ services without viewing it.</p>
      <p className="pi-dashboard-ad-status" role="status" aria-live="polite">{message || (cooling ? "Please wait before requesting another advertisement." : "Opens only when you choose to view it.")}</p>
    </div>
    <button type="button" disabled={state.busy || cooling} aria-busy={state.busy} onClick={() => void show()}>{state.busy ? "Opening ad…" : cooling ? "Try again shortly" : "View advertisement"}</button>
  </section>;
}
