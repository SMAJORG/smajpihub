import { refreshHubSession, saveSessionCredentials, clearSessionCredentials, SESSION_CHANGED, SESSION_ENDED, type HubSession } from "../lib/sessionCredentials";
import { ensurePiInitialized, isPiSandboxMode } from "../lib/piSdk";
import { AxiosError, isAxiosError } from "axios";
import { useCallback, useEffect, useRef, useState } from "react";
import { axiosClient, getBaseURL } from "../lib/axiosClient";
import type { AuthResult, User } from "../types/pi";
import { requestPiBrowserHandoff } from "../lib/piBrowserHandoff";
import { authenticateWithCapacitorPi, isCapacitorNative, type CapacitorPiAuthStage } from "../lib/capacitorPiAuth";
import { isSoloHostRuntime } from "../lib/soloHost";
import { authenticateWithSoloHostPi } from "../lib/soloHostPiAuth";

type AuthFeedback = { type: "success" | "error"; message: string };
type BackendErrorBody = { error?: string; message?: string };
type SignInResponse = { user?: Partial<User> | null; session?: HubSession };
type ProfileUpdate = {
  displayName: string;
  country: string;
  role: "buyer" | "seller" | "admin";
  contactPhone: string;
  avatar?: string;
  coverImage?: string;
  bio?: string;
  language?: string;
  sellerActive?: boolean;
};

const PI_AUTH_TIMEOUT_MS = 20000;
const MIN_SESSION_LOADING_MS = 450;
const PI_USER_STORAGE_KEY = "smaj_pi_user";
const piAuthScopes = () => isPiSandboxMode() ? ["username", "wallet_address"] : ["username"];
const AUTH_REQUEST_CONFIG = { withCredentials: true, headers: { "X-SMAJ-Silent": "true" } };


const onIncompletePaymentFound = () => {
  console.info("Pi incomplete payment handling is disabled.");
};

const authenticateWithTimeout = (scopes: string[]) =>
  Promise.race<AuthResult>([
    window.Pi!.authenticate(scopes, onIncompletePaymentFound),
    new Promise<AuthResult>((_, reject) => setTimeout(() => reject(new Error("PI_AUTH_TIMEOUT")), PI_AUTH_TIMEOUT_MS)),
  ]);

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

const waitForPiSdk = async (timeoutMs = 2500) => {
  const deadline = Date.now() + timeoutMs;
  while (!window.Pi && Date.now() < deadline) await wait(100);
  return Boolean(window.Pi?.authenticate);
};

const toUser = (candidate: Partial<User> | null | undefined, fallback: User): User => {
  // Older APIs have no completion flag and may return a stale top-level
  // language. A canonical value in settings is a persisted preference;
  // "English" is the provisioned default, whereas an explicit Save uses "en".
  const settingsLanguage = typeof candidate?.settings?.language === "string" && candidate.settings.language.trim() && candidate.settings.language !== "English" ? candidate.settings.language : undefined;
  return ({
  uid: candidate?.uid || fallback.uid,
  username: candidate?.username || fallback.username,
  wallet_address: candidate?.wallet_address || fallback.wallet_address,
  roles: Array.isArray(candidate?.roles) ? candidate.roles : Array.isArray(fallback.roles) ? fallback.roles : [],
  piUsername: candidate?.piUsername || fallback.piUsername || candidate?.username || fallback.username,
  displayName: candidate?.displayName || fallback.displayName || candidate?.username || fallback.username,
  country: candidate?.country ?? fallback.country ?? "",
  contactPhone: candidate?.contactPhone ?? fallback.contactPhone ?? "",
  avatar: candidate?.avatar ?? fallback.avatar ?? "",
  coverImage: candidate?.coverImage ?? fallback.coverImage ?? "",
  bio: candidate?.bio ?? fallback.bio ?? "",
  languagePreferenceSaved: candidate?.languagePreferenceSaved ?? (settingsLanguage ? true : fallback.languagePreferenceSaved ?? false),
  language: settingsLanguage ?? candidate?.language ?? fallback.language ?? candidate?.settings?.language ?? fallback.settings?.language ?? "English",
  sellerActive: candidate?.sellerActive ?? fallback.sellerActive ?? candidate?.role === "seller",
  role: candidate?.role || fallback.role || "buyer",
  blocked: candidate?.blocked ?? fallback.blocked ?? false,
  settings: candidate?.settings || fallback.settings || { theme: "light", language: "English", notifications: true },
  createdAt: candidate?.createdAt || fallback.createdAt || new Date().toISOString(),
  verificationLevel: candidate?.verificationLevel || fallback.verificationLevel || "basic",
  verificationStatus: candidate?.verificationStatus || fallback.verificationStatus || "none",
  verificationRequested: candidate?.verificationRequested ?? fallback.verificationRequested ?? false,
  verificationRequestType: candidate?.verificationRequestType ?? fallback.verificationRequestType,
  accessToken: fallback.accessToken,
  });
};

const getStoredPiUser = () => {
  try {
    const stored = window.localStorage.getItem(PI_USER_STORAGE_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored) as User;
    if (isCapacitorNative() && parsed.accessToken) {
      const token = parsed.accessToken;
      parsed.accessToken = undefined;
      window.localStorage.setItem(PI_USER_STORAGE_KEY, JSON.stringify(parsed));
      void import("../lib/nativeAppLock").then(({ storeNativeSessionToken }) => storeNativeSessionToken(token)).catch(() => undefined);
    }
    return parsed;
  } catch {
    return null;
  }
};

const storeUser = (user: User) => {
  const browserSafeUser = isCapacitorNative() ? { ...user, accessToken: undefined } : user;
  window.localStorage.setItem(PI_USER_STORAGE_KEY, JSON.stringify(browserSafeUser));
  if (isCapacitorNative() && user.accessToken) {
    void import("../lib/nativeAppLock").then(({ storeNativeSessionToken }) => storeNativeSessionToken(user.accessToken)).catch(() => undefined);
  }
  return user;
};

const authResultUser = (authResult: AuthResult): User => ({
  uid: authResult.user.uid,
  username: authResult.user.username,
  wallet_address: authResult.user.wallet_address,
  roles: authResult.user.roles ?? [],
  piUsername: authResult.user.username,
  displayName: authResult.user.username,
  country: "",
  role: "buyer",
  contactPhone: "",
  avatar: "",
  coverImage: "",
  bio: "",
  language: "English",
  sellerActive: false,
  blocked: false,
  verificationLevel: "basic",
  verificationStatus: "none",
  verificationRequested: false,
  verificationRequestType: undefined,
  settings: { theme: "light", language: "English", notifications: true },
  createdAt: new Date().toISOString(),
  accessToken: authResult.accessToken,
});

const getDashboardUrl = () => {
  const requestedPath = window.sessionStorage.getItem("smaj_post_auth_redirect");
  if (requestedPath?.startsWith("/") && !requestedPath.startsWith("//")) {
    window.sessionStorage.removeItem("smaj_post_auth_redirect");
    return requestedPath;
  }
  const baseUrl = import.meta.env.BASE_URL || "/";
  return `${baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`}dashboard`;
};

const redirectToDashboard = async () => {
  const dashboardUrl = getDashboardUrl();
  console.log("[auth] dashboard redirect", { dashboardUrl });
  window.history.replaceState(window.history.state, "", dashboardUrl);
  window.dispatchEvent(new PopStateEvent("popstate", { state: window.history.state }));
  await new Promise<void>((resolve) => window.setTimeout(resolve, 250));
};

const getLoginDeviceMetadata = async () => {
  if (!isCapacitorNative()) return { platform: "web" };
  try {
    const { getNativeDeviceInfo } = await import("../lib/nativeCapabilities");
    const device = await getNativeDeviceInfo();
    return {
      deviceId: device.identifier,
      name: [device.manufacturer, device.model].filter(Boolean).join(" "),
      model: device.model,
      manufacturer: device.manufacturer,
      platform: "android",
      operatingSystem: device.operatingSystem,
      osVersion: device.osVersion,
    };
  } catch {
    return { platform: "android", name: "SMAJ PI HUB Android" };
  }
};
const toErrorMessage = (err: unknown) => {
  const axiosErr = err as AxiosError<BackendErrorBody>;
  if (!axiosErr.response) return "Backend connection unavailable. Please try again.";
  if (axiosErr.response.status === 409 && axiosErr.response.data?.error?.startsWith("pi_")) return axiosErr.response.data.message || "Please sign in through the Pi app you previously used for SMAJ PI HUB.";
  if ([400, 401].includes(axiosErr.response.status)) return "Pi login failed. Please login again through Pi Browser.";
  return axiosErr.response.data?.message ? `Login failed: ${axiosErr.response.data.message}` : `Login failed with status ${axiosErr.response.status}.`;
};

export const useAuth = () => {
  const initialUserRef = useRef<User | null>(getStoredPiUser());
  const accountContinuityRef = useRef<string | undefined>(initialUserRef.current?.uid);
  const [user, setUser] = useState<User | null>(initialUserRef.current);
  const [showSignIn, setShowSignIn] = useState(false);
  const [isLoading, setIsLoading] = useState(!initialUserRef.current);
  const [isPiLoginPending, setIsPiLoginPending] = useState(false);
  const [piLoginStage, setPiLoginStage] = useState<CapacitorPiAuthStage | null>(null);
  const [authFeedback, setAuthFeedback] = useState<AuthFeedback | null>(null);
  const loginInProgressRef = useRef(false);
  const showFeedback = useCallback((feedback: AuthFeedback | null) => {
    setAuthFeedback(feedback);
  }, []);

  useEffect(() => {
    if (!authFeedback) return;
    const timer = window.setTimeout(() => setAuthFeedback(null), 3000);
    return () => window.clearTimeout(timer);
  }, [authFeedback]);

  useEffect(() => {
    let mounted = true;
    const checkSession = async () => {
      const startedAt = Date.now();
      const stored = initialUserRef.current || getStoredPiUser();
      if (stored && mounted) setUser(stored);
      if (!getBaseURL()) { if (mounted) setIsLoading(false); return; }
      try {
        await refreshHubSession(getBaseURL());
        const response = await axiosClient.get<SignInResponse>("/user", AUTH_REQUEST_CONFIG);
        if (response.data.session && response.data.user) await saveSessionCredentials(response.data.session, response.data.user);
        console.log("[auth] /user session success", {
          status: response.status,
          hasUser: Boolean(response.data.user?.uid),
          username: response.data.user?.username,
        });
        if (response.data.user?.uid && response.data.user.username && mounted) {
          accountContinuityRef.current = response.data.user.uid;
          setUser(storeUser(toUser(response.data.user, getStoredPiUser() || stored || response.data.user as User)));
        } else if (mounted) {
          await clearSessionCredentials();
          setUser(null);
        }
      } catch (err) {
        if (isAxiosError<BackendErrorBody>(err) && err.response?.status === 409) {
          if (mounted) { setUser(null); setAuthFeedback({ type: "error", message: err.response.data?.message || "Please sign in again through Pi Browser." }); }
        }
        if (isAxiosError(err) && [401, 403].includes(err.response?.status || 0)) {
          await clearSessionCredentials();
          if (mounted) setUser(null);
        }
      } finally {
        const remaining = MIN_SESSION_LOADING_MS - (Date.now() - startedAt);
        if (remaining > 0) await wait(remaining);
        if (mounted) setIsLoading(false);
      }
    };
    void checkSession();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    const changed = (event: Event) => { const confirmed = (event as CustomEvent<User>).detail; accountContinuityRef.current = confirmed?.uid; setUser(confirmed); };
    const ended = () => setUser(null);
    const renew = () => {
      if (!document.hidden && getStoredPiUser()?.uid) void refreshHubSession(getBaseURL()).catch(() => undefined);
    };
    const timer = window.setInterval(renew, 20 * 60 * 1000);
    window.addEventListener(SESSION_CHANGED, changed);
    window.addEventListener(SESSION_ENDED, ended);
    window.addEventListener("focus", renew);
    document.addEventListener("visibilitychange", renew);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener(SESSION_CHANGED, changed);
      window.removeEventListener(SESSION_ENDED, ended);
      window.removeEventListener("focus", renew);
      document.removeEventListener("visibilitychange", renew);
    };
  }, []);

  useEffect(() => {
    const updateAvatar = (event: Event) => {
      const avatar = (event as CustomEvent<{ avatar: string }>).detail?.avatar;
      if (typeof avatar !== "string") return;
      setUser(current => current ? storeUser(toUser({ avatar }, current)) : current);
    };
    const syncTab = (event: StorageEvent) => {
      if (event.key === PI_USER_STORAGE_KEY) setUser(getStoredPiUser());
    };
    window.addEventListener("smaj:profile-avatar-updated", updateAvatar);
    window.addEventListener("storage", syncTab);
    return () => {
      window.removeEventListener("smaj:profile-avatar-updated", updateAvatar);
      window.removeEventListener("storage", syncTab);
    };
  }, []);

  const signInUser = useCallback(async (authResult: AuthResult) => {
    const fallback = authResultUser(authResult);
    if (!getBaseURL()) throw new Error("The account server is not configured. Your original profile has not been replaced.");
    const device = await getLoginDeviceMetadata();
    const response = await axiosClient.post<SignInResponse>("/user/signin", { authResult, sandbox: isPiSandboxMode(), device, expectedAccountUid: accountContinuityRef.current, loginContext: { clientId: window.__ENV?.piOAuthClientId || null } }, AUTH_REQUEST_CONFIG);
    if (!response.data.user?.uid || !response.data.user.username) throw new Error("The server did not confirm your saved account. Your previous profile has not been replaced.");
    const signedInUser = toUser(response.data.user, { ...fallback, accessToken: response.data.session?.accessToken || fallback.accessToken });
    if (response.data.session) await saveSessionCredentials(response.data.session, response.data.user);
    accountContinuityRef.current = signedInUser.uid;
    setUser(storeUser(signedInUser));
    setShowSignIn(false);
    setAuthFeedback({ type: "success", message: `Signed in as ${signedInUser.username || "Pi user"}.` });
  }, []);

  const loginWithPi = useCallback(async () => {
    if (loginInProgressRef.current) return false;
    loginInProgressRef.current = true;
    setIsPiLoginPending(true);
    setPiLoginStage(isCapacitorNative() ? "opening" : null);
    setIsLoading(true);
    setAuthFeedback({ type: "success", message: "Connecting to Pi Browser…" });
    // The Pi SDK script can exist inside Capacitor's WebView, but it cannot
    // complete the Pi Browser SDK flow there. Native Android must always use
    // the OAuth browser/deep-link flow, regardless of window.Pi.
    if (isCapacitorNative()) {
      try {
        const authResult = await authenticateWithCapacitorPi(setPiLoginStage);
        await signInUser(authResult);
        await redirectToDashboard();
        return true;
      } catch (err) {
        setAuthFeedback({ type: "error", message: isAxiosError(err) ? toErrorMessage(err) : (err as Error)?.message || "Pi login failed." });
        return false;
      } finally {
        loginInProgressRef.current = false;
        setIsPiLoginPending(false);
        setPiLoginStage(null);
        setIsLoading(false);
      }
    }
    if (isSoloHostRuntime()) {
      try {
        setAuthFeedback({ type: "success", message: "Opening Pi Sign-In…" });
        const authResult = await authenticateWithSoloHostPi();
        await signInUser(authResult);
        await redirectToDashboard();
        return true;
      } catch (err) {
        setAuthFeedback({ type: "error", message: isAxiosError(err) ? toErrorMessage(err) : (err as Error)?.message || "Pi Sign-In failed." });
        return false;
      } finally {
        loginInProgressRef.current = false;
        setIsPiLoginPending(false);
        setPiLoginStage(null);
        setIsLoading(false);
      }
    }
    if (!window.Pi) {
      if (import.meta.env.DEV && getBaseURL()) {
        try {
          const response = await axiosClient.post<SignInResponse>("/user/dev-signin", undefined, AUTH_REQUEST_CONFIG);
          if (response.data.session && response.data.user) await saveSessionCredentials(response.data.session, response.data.user);
          const devFallback: User = {
            uid: response.data.user?.uid || "local-dev-user",
            username: response.data.user?.username || "localdev",
            roles: response.data.user?.roles || ["seller"],
            piUsername: response.data.user?.piUsername || "localdev",
            displayName: response.data.user?.displayName || "Local Dev Seller",
            country: response.data.user?.country || "Local",
            role: (response.data.user?.role as User["role"]) || "seller",
            contactPhone: response.data.user?.contactPhone || "@localdev",
            avatar: response.data.user?.avatar || "",
            coverImage: response.data.user?.coverImage || "",
            bio: response.data.user?.bio || "",
            language: response.data.user?.language || "English",
            sellerActive: true,
            blocked: false,
            verificationLevel: response.data.user?.verificationLevel || "trusted_seller",
            verificationStatus: response.data.user?.verificationStatus || "approved",
            verificationRequested: false,
            settings: response.data.user?.settings || { theme: "light", language: "English", notifications: true },
            accessToken: response.data.session?.accessToken || "dev-token",
          };
          setUser(storeUser(toUser(response.data.user, devFallback)));
          setShowSignIn(false);
          setAuthFeedback({ type: "success", message: "Signed in with local development account." });
          await redirectToDashboard();
          return true;
        } catch (err) {
          console.error("Development login failed:", err);
          setAuthFeedback({ type: "error", message: "Local development login failed. Check backend DEV_AUTH and VITE_BACKEND_URL." });
          return false;
        } finally {
          loginInProgressRef.current = false;
        setIsPiLoginPending(false);
        setPiLoginStage(null);
          setIsLoading(false);
        }
      }
      await waitForPiSdk();
    }
    if (!window.Pi) {
      if (isPiSandboxMode()) {
        setAuthFeedback({ type: "error", message: "Pi SDK is unavailable in this Sandbox preview. Refresh the preview, confirm your sandbox Pi account is signed in, and try again." });
        loginInProgressRef.current = false;
        setIsPiLoginPending(false);
        setPiLoginStage(null);
        setIsLoading(false);
        return false;
      }
      requestPiBrowserHandoff("Pi login required");
      setAuthFeedback(null);
      loginInProgressRef.current = false;
        setIsPiLoginPending(false);
        setPiLoginStage(null);
      setIsLoading(false);
      return false;
    }
    try {
      await ensurePiInitialized();
      const authResult = await authenticateWithTimeout(piAuthScopes());
      console.log("[auth] Pi authenticate success", {
        uid: authResult.user.uid,
        username: authResult.user.username,
        hasAccessToken: Boolean(authResult.accessToken),
      });
      await signInUser(authResult);
      await redirectToDashboard();
      return true;
    } catch (err) {
      console.error("[auth] Pi login failed", { status: isAxiosError(err) ? err.response?.status : undefined });
      const sdkMessage = (err as Error)?.message || "";
      const message = isAxiosError<BackendErrorBody>(err)
        ? toErrorMessage(err)
        : /^(The server did not confirm|The account server)/.test(sdkMessage) ? sdkMessage
        : sdkMessage === "PI_AUTH_TIMEOUT"
          ? "Pi login timed out. Reopen Pi Browser, confirm your sandbox account is signed in, and try again."
          : /cancel|denied|reject/i.test(sdkMessage)
            ? "Pi login was cancelled. Please approve the Pi Browser sign-in request and try again."
            : "Pi login failed before reaching the server. In Pi Sandbox mobile preview, sign in to a sandbox Pi account and try again.";
      setAuthFeedback({ type: "error", message });
      return false;
    } finally {
      loginInProgressRef.current = false;
        setIsPiLoginPending(false);
        setPiLoginStage(null);
      setIsLoading(false);
    }
  }, [signInUser]);

  const refreshPiSession = useCallback(async () => {
    try { return Boolean(await refreshHubSession(getBaseURL())); }
    catch { return false; }
  }, []);

  const updateProfile = useCallback(async (profile: ProfileUpdate) => {
    const currentUser = user || getStoredPiUser();
    if (!currentUser) throw new Error("Sign in before saving your profile.");
    const response = await axiosClient.put<SignInResponse>("/user/profile", profile);
    if (!response.data.user?.uid) throw new Error("Profile was not confirmed by the server. Please try again.");
    const updatedUser = storeUser(toUser(response.data.user, currentUser));
    setUser(updatedUser);
    return updatedUser;
  }, [user]);

  const updateLanguage = useCallback(async (language: string) => {
    const currentUser = user || getStoredPiUser();
    if (!currentUser?.uid) throw new Error("Sign in before saving your language.");
    const config = { headers: { "X-SMAJ-Silent": "true" } };
    let confirmed: Partial<User> | null | undefined;
    try {
      confirmed = (await axiosClient.put<SignInResponse>("/user/language", { language }, config)).data.user;
    } catch (error) {
      // The live legacy API supports /settings but not /language. Never turn
      // authentication, validation, or database failures into a local-only save.
      if (!isAxiosError(error) || ![404, 405].includes(error.response?.status || 0)) throw error;
      const fresh = (await axiosClient.get<SignInResponse>("/user", config)).data.user;
      if (fresh?.uid !== currentUser.uid) throw new Error("Sign in again before saving your language.");
      confirmed = (await axiosClient.put<SignInResponse>("/user/settings", {
        theme: fresh.settings?.theme === "dark" ? "dark" : "light",
        notifications: typeof fresh.settings?.notifications === "boolean" ? fresh.settings.notifications : true,
        language,
      }, config)).data.user;
    }
    if (getStoredPiUser()?.uid !== currentUser.uid || confirmed?.uid !== currentUser.uid || confirmed.settings?.language !== language) {
      throw new Error("Language was not confirmed by the server. Please try again.");
    }
    const updated = storeUser(toUser({ ...confirmed, language, languagePreferenceSaved: true }, currentUser));
    setUser(updated);
    return updated;
  }, [user]);

  const updateSettings = useCallback(async (settings: { theme: "dark" | "light"; language: string; notifications: boolean }) => {
    const currentUser = user || getStoredPiUser();
    const applyLocalSettingsUpdate = () => {
      if (!currentUser) return;
      const updatedUser = storeUser(toUser({ settings, language: settings.language }, currentUser));
      setUser(updatedUser);
    };

    try {
      const response = await axiosClient.put<SignInResponse>("/user/settings", settings);
      if (response.data.user && currentUser) setUser(storeUser(toUser(response.data.user, currentUser)));
      else applyLocalSettingsUpdate();
    } catch (err) {
      if (isAxiosError(err) && (!err.response || [401, 403, 404, 405, 413, 502, 503, 504].includes(err.response.status))) {
        applyLocalSettingsUpdate();
        return;
      }
      throw err;
    }
  }, [user]);

  const signOut = useCallback(async () => {
    accountContinuityRef.current = undefined; // Explicit sign-out allows intentional account switching.
    setIsLoading(true);
    try {
      const { supportsNativePushNotifications, unregisterNativePushOnLogout } = await import("../lib/nativePushNotifications");
      if (supportsNativePushNotifications()) await unregisterNativePushOnLogout();
      if (getBaseURL()) await axiosClient.post("/user/signout", undefined, AUTH_REQUEST_CONFIG);
      await clearSessionCredentials();
      if (isCapacitorNative()) void import("../lib/nativeAppLock").then(({ clearAppLockSettings, clearNativeSessionToken }) => Promise.all([clearAppLockSettings(), clearNativeSessionToken()])).catch(() => undefined);
      setUser(null);
      setAuthFeedback({ type: "success", message: "Signed out successfully." });
    } catch (err) {
      console.error("Sign-out failed:", err);
      await clearSessionCredentials();
      if (isCapacitorNative()) void import("../lib/nativeAppLock").then(({ clearAppLockSettings, clearNativeSessionToken }) => Promise.all([clearAppLockSettings(), clearNativeSessionToken()])).catch(() => undefined);
      setUser(null);
      setAuthFeedback({ type: "error", message: "Failed to sign out." });
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    user,
    isAuthenticated: Boolean(user),
    showSignIn,
    loginWithPi,
    signIn: loginWithPi,
    refreshPiSession,
    signOut,
    updateProfile,
    updateSettings,
    updateLanguage,
    closeSignIn: () => setShowSignIn(false),
    requireAuth: () => setShowSignIn(true),
    isLoading,
    isPiLoginPending,
    piLoginStage,
    authFeedback,
    showFeedback,
  };
};
