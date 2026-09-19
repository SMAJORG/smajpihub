import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { App } from "@capacitor/app";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import FingerprintRoundedIcon from "@mui/icons-material/FingerprintRounded";
import LogoutRoundedIcon from "@mui/icons-material/LogoutRounded";
import logoImage from "/logo.png";
import { useAuthContext } from "../contexts/AuthContext";
import { APP_LOCK_CHANGED_EVENT, authenticateNativeDevice, clearAppLockSettings, getAppLockSettings, isNativeAuthenticationActive, supportsNativeAppLock, type AppLockSettings } from "../lib/nativeAppLock";
import "./NativeAppLockGate.css";

const NativeAppLockGate = ({ children }: { children: ReactNode }) => {
  const { user, isAuthenticated, signOut } = useAuthContext();
  const [ready, setReady] = useState(!supportsNativeAppLock());
  const [locked, setLocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const settingsRef = useRef<AppLockSettings>({ enabled: false, timeoutMs: 0, userId: "" });
  const backgroundAtRef = useRef<number | null>(null);
  const loadSettings = useCallback(async (lockOnLoad = false) => {
    if (!supportsNativeAppLock()) return;
    const settings = await getAppLockSettings();
    settingsRef.current = settings;
    const belongsToUser = Boolean(user?.uid && settings.userId === user.uid);
    setLocked(Boolean(lockOnLoad && isAuthenticated && belongsToUser && settings.enabled));
    setReady(true);
  }, [isAuthenticated, user?.uid]);
  useEffect(() => {
    if (!supportsNativeAppLock()) return;
    void loadSettings(true);
    const changed = () => void loadSettings(false);
    window.addEventListener(APP_LOCK_CHANGED_EVENT, changed);
    let active = true;
    let removeListener: (() => Promise<void>) | undefined;
    void App.addListener("appStateChange", ({ isActive }) => {
      if (!active || isNativeAuthenticationActive()) return;
      if (!isActive) { backgroundAtRef.current = Date.now(); return; }
      const backgroundAt = backgroundAtRef.current;
      backgroundAtRef.current = null;
      const settings = settingsRef.current;
      if (settings.enabled && settings.userId === user?.uid && backgroundAt !== null && Date.now() - backgroundAt >= settings.timeoutMs) setLocked(true);
    }).then(handle => { removeListener = () => handle.remove(); });
    return () => { active = false; window.removeEventListener(APP_LOCK_CHANGED_EVENT, changed); void removeListener?.(); };
  }, [loadSettings, user?.uid]);
  const unlock = async () => {
    setBusy(true); setMessage("");
    try { await authenticateNativeDevice(); setLocked(false); backgroundAtRef.current = null; }
    catch (error) { setMessage(error instanceof Error ? error.message : "Authentication was not completed."); }
    finally { setBusy(false); }
  };
  const logout = async () => { setBusy(true); await clearAppLockSettings(); await signOut(); setLocked(false); setBusy(false); };
  if (!supportsNativeAppLock()) return <>{children}</>;
  if (!ready) return <div className="native-app-lock native-app-lock--boot" aria-label="Securing SMAJ PI HUB"><span /></div>;
  if (!locked) return <>{children}</>;
  return <main className="native-app-lock" aria-labelledby="native-app-lock-title"><section><img className="native-app-lock__brand" src={logoImage} alt="SMAJ PI HUB" /><div className="native-app-lock__icon"><LockOutlinedIcon /></div><p>SMAJ PI HUB SECURITY</p><h1 id="native-app-lock-title">App locked</h1><span>Your Pi session is still active. Verify with this device to continue.</span><button type="button" className="native-app-lock__unlock" onClick={() => void unlock()} disabled={busy}>{busy ? <i aria-hidden="true" /> : <FingerprintRoundedIcon />}{busy ? "Authenticating…" : "Unlock SMAJ PI HUB"}</button>{message ? <small role="alert">{message}</small> : null}<button type="button" className="native-app-lock__logout" onClick={() => void logout()} disabled={busy}><LogoutRoundedIcon /> Sign out</button></section></main>;
};
export default NativeAppLockGate;
