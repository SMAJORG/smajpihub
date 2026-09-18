import { AndroidBiometryStrength, BiometricAuth } from "@aparajita/capacitor-biometric-auth";
import { SecureStorage } from "@aparajita/capacitor-secure-storage";
import { Capacitor } from "@capacitor/core";

export type AppLockTimeout = 0 | 60_000 | 300_000 | 900_000;
export type AppLockSettings = { enabled: boolean; timeoutMs: AppLockTimeout; userId: string };
const SETTINGS_KEY = "smaj_android_app_lock";
const SESSION_TOKEN_KEY = "smaj_pi_access_token";
export const APP_LOCK_CHANGED_EVENT = "smaj:app-lock-changed";
let nativeAuthenticationActive = false;
export const supportsNativeAppLock = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
export const isNativeAuthenticationActive = () => nativeAuthenticationActive;
export const getAppLockSettings = async (): Promise<AppLockSettings> => {
  if (!supportsNativeAppLock()) return { enabled: false, timeoutMs: 0, userId: "" };
  const value = await SecureStorage.get(SETTINGS_KEY);
  if (!value || typeof value !== "object") return { enabled: false, timeoutMs: 0, userId: "" };
  const candidate = value as Partial<AppLockSettings>;
  return { enabled: candidate.enabled === true, timeoutMs: [0, 60_000, 300_000, 900_000].includes(Number(candidate.timeoutMs)) ? Number(candidate.timeoutMs) as AppLockTimeout : 0, userId: typeof candidate.userId === "string" ? candidate.userId : "" };
};
export const saveAppLockSettings = async (settings: AppLockSettings) => { await SecureStorage.set(SETTINGS_KEY, settings); window.dispatchEvent(new CustomEvent(APP_LOCK_CHANGED_EVENT, { detail: settings })); };
export const clearAppLockSettings = async () => { if (!supportsNativeAppLock()) return; await SecureStorage.remove(SETTINGS_KEY); window.dispatchEvent(new Event(APP_LOCK_CHANGED_EVENT)); };
export const getNativeBiometry = () => BiometricAuth.checkBiometry();
export const authenticateNativeDevice = async (reason = "Unlock SMAJ PI HUB") => {
  nativeAuthenticationActive = true;
  try { await BiometricAuth.authenticate({ reason, cancelTitle: "Cancel", allowDeviceCredential: true, androidTitle: "Unlock SMAJ PI HUB", androidSubtitle: "Use fingerprint, face, PIN, pattern, or password", androidConfirmationRequired: false, androidBiometryStrength: AndroidBiometryStrength.weak }); }
  finally { window.setTimeout(() => { nativeAuthenticationActive = false; }, 350); }
};
export const storeNativeSessionToken = async (token?: string) => { if (supportsNativeAppLock() && token) await SecureStorage.set(SESSION_TOKEN_KEY, token); };
export const clearNativeSessionToken = async () => { if (supportsNativeAppLock()) await SecureStorage.remove(SESSION_TOKEN_KEY); };
