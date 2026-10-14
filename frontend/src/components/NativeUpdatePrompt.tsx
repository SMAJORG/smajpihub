import { useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { checkAppUpdate, installAppUpdate, type AppUpdate } from "../lib/appUpdates";
import "./NativeUpdatePrompt.css";
export default function NativeUpdatePrompt() {
  const [update, setUpdate] = useState<AppUpdate | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dismissed = useRef("");
  const dialog = useRef<HTMLElement>(null);
  const busyRef = useRef(false); busyRef.current = busy;
  useEffect(() => {
    if (Capacitor.getPlatform() !== "android") return;
    let active = true, checking = false;
    const check = async () => {
      if (checking) return; checking = true;
      try { const next = await checkAppUpdate(true); if (active && next.available && next.version !== dismissed.current) setUpdate(next); }
      catch { /* An unavailable update service must not block the app. */ }
      finally { checking = false; }
    };
    void check(); const listener = App.addListener("appStateChange", state => { if (state.isActive) void check(); });
    window.addEventListener("online", check);
    const timer = window.setInterval(() => { if (!document.hidden) void check(); }, 30 * 60_000);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener("online", check); void listener.then(handle => handle.remove()); };
  }, []);
  useEffect(() => {
    if (!update) return;
    const previous = document.body.style.overflow, focus = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busyRef.current) { dismissed.current = update.version; setUpdate(null); setError(""); }
      if (event.key === "Tab") {
        const buttons = Array.from(dialog.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") || []);
        if (!buttons.length) { event.preventDefault(); return; }
        const first = buttons[0], last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener("keydown", keydown);
    return () => { document.body.style.overflow = previous; window.removeEventListener("keydown", keydown); if (focus?.isConnected) focus.focus(); };
  }, [update]);
  if (!update) return null;
  const close = () => { dismissed.current = update.version; setUpdate(null); setError(""); };
  const install = async () => {
    setBusy(true); setError("");
    try { await installAppUpdate(update); close(); }
    catch (error) { setError(error instanceof Error ? error.message : "The update could not be installed. Please retry."); }
    finally { setBusy(false); }
  };
  return <div className="native-update-backdrop"><section ref={dialog} className="native-update-card" role="dialog" aria-modal="true" aria-labelledby="native-update-title"><span className="native-update-label">SMAJ PI HUB</span><h2 id="native-update-title">Update available</h2><p>Version {update.version} is ready.</p><p>{busy ? "Downloading and checking the update. Android will ask you to confirm installation." : "Install the latest fixes and improvements."}</p>{error ? <p role="alert">{error}</p> : null}<div><button type="button" disabled={busy} onClick={close}>Later</button><button autoFocus type="button" disabled={busy} className="primary" onClick={() => void install()}>{busy ? "Preparing update..." : "Update now"}</button></div></section></div>;
}
