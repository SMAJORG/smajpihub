import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import FingerprintRoundedIcon from "@mui/icons-material/FingerprintRounded";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import { useAuthContext } from "../../contexts/AuthContext";
import { authenticateNativeDevice, getAppLockSettings, getNativeBiometry, saveAppLockSettings, supportsNativeAppLock, type AppLockTimeout } from "../../lib/nativeAppLock";
import "./AppLockSettingsPage.css";
const timeoutOptions: Array<[AppLockTimeout, string]> = [[0, "Immediately"], [60_000, "After 1 minute"], [300_000, "After 5 minutes"], [900_000, "After 15 minutes"]];
const AppLockSettingsPage = () => {
  const navigate = useNavigate(); const { user } = useAuthContext();
  const [enabled, setEnabled] = useState(false); const [timeoutMs, setTimeoutMs] = useState<AppLockTimeout>(0); const [available, setAvailable] = useState(false); const [deviceSecure, setDeviceSecure] = useState(false); const [busy, setBusy] = useState(true); const [message, setMessage] = useState("");
  useEffect(() => {
    if (!supportsNativeAppLock()) { setBusy(false); return; }
    Promise.all([getAppLockSettings(), getNativeBiometry()]).then(([settings, biometry]) => { setEnabled(settings.enabled && settings.userId === user?.uid); setTimeoutMs(settings.timeoutMs); setAvailable(biometry.isAvailable); setDeviceSecure(biometry.deviceIsSecure); }).catch(() => setMessage("Device security could not be checked.")).finally(() => setBusy(false));
  }, [user?.uid]);
  const toggle = async () => {
    if (!user?.uid || busy) return; setBusy(true); setMessage("");
    try {
      if (!enabled) { const status = await getNativeBiometry(); if (!status.deviceIsSecure) { setMessage("Set a PIN, pattern, password, fingerprint, or face unlock in Android Settings first."); return; } await authenticateNativeDevice("Confirm App Lock for SMAJ PI HUB"); }
      const next = !enabled; await saveAppLockSettings({ enabled: next, timeoutMs, userId: user.uid }); setEnabled(next); setMessage(next ? "App Lock is enabled on this Android device." : "App Lock is disabled.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "App Lock could not be changed."); }
    finally { setBusy(false); }
  };
  const changeTimeout = async (value: AppLockTimeout) => { setTimeoutMs(value); if (enabled && user?.uid) await saveAppLockSettings({ enabled: true, timeoutMs: value, userId: user.uid }); };
  return <main className="private-page app-lock-settings-page"><header className="app-lock-settings-nav"><button type="button" onClick={() => navigate(-1)} aria-label="Go back"><ArrowBackRoundedIcon /></button><div><span>Security</span><strong>App Lock</strong></div></header><section className="app-lock-settings-hero"><div><LockOutlinedIcon /></div><p className="private-kicker">ANDROID SECURITY</p><h1>Protect SMAJ PI HUB</h1><p>Require your device fingerprint, face, PIN, pattern, or password after the app has been in the background.</p></section>{!supportsNativeAppLock() ? <div className="private-alert">App Lock is available only in the installed SMAJ PI HUB Android app. Web and Pi Browser remain unchanged.</div> : null}<section className="app-lock-settings-card"><div className="app-lock-settings-row"><FingerprintRoundedIcon /><span><strong>Unlock with device security</strong><small>{available ? "Biometrics available with device credential fallback." : deviceSecure ? "Your Android PIN, pattern, or password will be available." : "No secure device lock is configured."}</small></span><button type="button" role="switch" aria-checked={enabled} className={enabled ? "enabled" : ""} disabled={!supportsNativeAppLock() || busy} onClick={() => void toggle()}><i /></button></div><fieldset disabled={!enabled || busy}><legend>Lock timing</legend>{timeoutOptions.map(([value, label]) => <label key={value}><input type="radio" name="app-lock-timeout" checked={timeoutMs === value} onChange={() => void changeTimeout(value)} /><span>{label}</span></label>)}</fieldset></section><section className="app-lock-privacy-note"><strong>Your biometric data stays with Android</strong><p>SMAJ PI HUB never reads, stores, or transmits fingerprint or face data. App Lock protects access to your existing Pi-authenticated session.</p></section>{message ? <div className="private-alert success" role="status">{message}</div> : null}</main>;
};
export default AppLockSettingsPage;
