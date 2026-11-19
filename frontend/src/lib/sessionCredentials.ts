import axios from "axios";
import { Capacitor } from "@capacitor/core";
import { clearCachedResponsesForNamespace, getResponseCacheNamespace } from "./offlineCache";

export type HubSession = { accessToken: string; refreshToken: string; accessTokenExpiresAt: string; expiresAt: string };
export const SESSION_CHANGED = "smaj:session-changed";
export const SESSION_ENDED = "smaj:session-ended";
const KEY = "smaj_hub_session";
const USER_KEY = "smaj_pi_user";
type HubUser = Record<string, unknown> & { uid?: string };
let generation = 0;
let nativeWrites: Promise<void> = Promise.resolve();
let pending: Promise<{ user: HubUser; session: HubSession } | null> | null = null;

export async function saveSessionCredentials(session: HubSession, user: HubUser, renewalGeneration?: number) {
  if (!session.accessToken?.startsWith("hub_access.") || !session.refreshToken?.startsWith("hub_refresh_") || typeof user.uid !== "string" || !user.uid) throw new Error("Invalid Hub session response");
  const userId = user.uid;
  const started = renewalGeneration ?? ++generation;
  if (started !== generation) return;
  let previous: HubUser | null = null;
  try {
    previous = JSON.parse(localStorage.getItem(USER_KEY) || "null") as HubUser | null;
  } catch {
    localStorage.removeItem(USER_KEY);
  }
  if (typeof previous?.uid === "string" && previous.uid !== userId) {
    try {
      await clearCachedResponsesForNamespace(previous.uid);
    } catch (error) {
      console.warn("Could not clear the previous account's cached API responses.", error);
    }
    if (started !== generation) return;
  }
  if (Capacitor.isNativePlatform()) {
    nativeWrites = nativeWrites.catch(() => undefined).then(async () => {
      if (started !== generation) return;
      const storage = await import("./nativeAppLock");
      await storage.storeNativeSessionToken(session.accessToken);
      await storage.storeNativeRefreshToken(session.refreshToken);
    });
    await nativeWrites;
    if (started !== generation) return;
  } else {
    localStorage.setItem(KEY, JSON.stringify({ ...session, uid: userId }));
  }
  const next = { ...(previous?.uid === userId ? previous : {}), ...user, uid: userId, ...(Capacitor.isNativePlatform() ? { accessToken: undefined } : { accessToken: session.accessToken }) };
  localStorage.setItem(USER_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(SESSION_CHANGED, { detail: next }));
}

export async function clearSessionCredentials() {
  const namespace = getResponseCacheNamespace();
  generation++;
  localStorage.removeItem(KEY);
  localStorage.removeItem(USER_KEY);
  if (Capacitor.isNativePlatform()) {
    nativeWrites = nativeWrites.catch(() => undefined).then(async () => {
      const storage = await import("./nativeAppLock");
      await Promise.all([storage.clearNativeSessionToken(), storage.clearNativeRefreshToken()]);
    });
    await nativeWrites;
  }
  if (namespace !== "public") {
    try {
      await clearCachedResponsesForNamespace(namespace);
    } catch (error) {
      console.warn("Could not fully clear the signed-out account's cached API responses.", error);
    }
  }
  window.dispatchEvent(new Event(SESSION_ENDED));
}

export async function getHubRefreshToken() {
  if (Capacitor.isNativePlatform()) return import("./nativeAppLock").then(storage => storage.getNativeRefreshToken());
  return JSON.parse(localStorage.getItem(KEY) || "null")?.refreshToken || "";
}

export function refreshHubSession(baseUrl: string, force = false) {
  if (pending) return pending;
  if (!force) {
    try {
      const session = JSON.parse(localStorage.getItem(KEY) || "null") as HubSession | null;
      const accessTokenExpiresAt = session?.accessTokenExpiresAt ? Date.parse(session.accessTokenExpiresAt) : 0;
      if (Number.isFinite(accessTokenExpiresAt) && accessTokenExpiresAt > Date.now() + 60_000) {
        return Promise.resolve(null);
      }
    } catch {
      // An unreadable or legacy session continues through the normal refresh path.
    }
  }
  const started = generation;
  pending = (async () => {
    const token = await getHubRefreshToken();
    try {
      const { data } = await axios.post(`${baseUrl.replace(/\/$/, "")}/user/refresh`, {}, {
        withCredentials: !token, timeout: 15000,
        headers: token ? { "X-SMAJ-Refresh-Token": token } : {},
      });
      if (started !== generation) return null;
      const current = JSON.parse(localStorage.getItem(USER_KEY) || "null");
      if (current?.uid && current.uid !== data.user?.uid) return null;
      await saveSessionCredentials(data.session, data.user, started);
      if (started !== generation) return null;
      return data as { user: HubUser; session: HubSession };
    } catch (error) {
      if (axios.isAxiosError(error) && [401, 403].includes(error.response?.status || 0)) {
        // An old deployment's Pi login can still migrate through GET /user.
        if (token && started === generation) await clearSessionCredentials();
        return null;
      }
      throw error; // An outage must never destroy a valid persistent login.
    }
  })().finally(() => { pending = null; });
  return pending;
}

// Payouts require the canonical Hub credential, not a possibly stale Pi/profile token.
export async function getHubAccessToken() {
  if (Capacitor.isNativePlatform()) return import("./nativeAppLock").then(storage => storage.getNativeSessionToken());
  try {
    const token = JSON.parse(localStorage.getItem(KEY) || "null")?.accessToken;
    return typeof token === "string" && token.startsWith("hub_access.") ? token : "";
  } catch { return ""; }
}
