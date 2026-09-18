import { AxiosError, isAxiosError } from "axios";
import { useCallback, useEffect, useRef, useState } from "react";
import { axiosClient, getBaseURL } from "../lib/axiosClient";
import type { AuthResult, User } from "../types/pi";
import { requestPiBrowserHandoff } from "../lib/piBrowserHandoff";
import { authenticateWithCapacitorPi, isCapacitorNative } from "../lib/capacitorPiAuth";

type AuthFeedback = { type: "success" | "error"; message: string };
type BackendErrorBody = { error?: string; message?: string };
type SignInResponse = { user?: Partial<User> | null };
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
const PI_AUTH_SCOPES = ["username"];
const AUTH_REQUEST_CONFIG = { withCredentials: true };

const getRuntimeSandboxSetting = () => {
  const runtimeSandbox = window.__ENV?.sandbox;
  return runtimeSandbox && runtimeSandbox !== "$$SANDBOX_SDK$$"
    ? runtimeSandbox
    : import.meta.env.VITE_SANDBOX_SDK;
};

const isPiSandboxMode = () =>
  typeof window !== "undefined" &&
  (getRuntimeSandboxSetting() === "true" ||
    window.location.hostname === "sandbox.minepi.com" ||
    document.referrer.includes("sandbox.minepi.com"));

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

const toUser = (candidate: Partial<User> | null | undefined, fallback: User): User => ({
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
  language: candidate?.language ?? fallback.language ?? candidate?.settings?.language ?? fallback.settings?.language ?? "English",
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
  if ([400, 401].includes(axiosErr.response.status)) return "Pi login failed. Please login again through Pi Browser.";
  return axiosErr.response.data?.message ? `Login failed: ${axiosErr.response.data.message}` : `Login failed with status ${axiosErr.response.status}.`;
};

export const useAuth = () => {
  const initialUserRef = useRef<User | null>(getStoredPiUser());
  const [user, setUser] = useState<User | null>(initialUserRef.current);
  const [showSignIn, setShowSignIn] = useState(false);
  const [isLoading, setIsLoading] = useState(!initialUserRef.current);
  const [isPiLoginPending, setIsPiLoginPending] = useState(false);
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
        const response = await axiosClient.get<{ user?: Partial<User> | null }>("/user", AUTH_REQUEST_CONFIG);
        console.log("[auth] /user session success", {
          status: response.status,
          hasUser: Boolean(response.data.user?.uid),
          username: response.data.user?.username,
        });
        if (response.data.user?.uid && response.data.user.username && mounted) {
          setUser(storeUser(toUser(response.data.user, stored || response.data.user as User)));
        } else if (mounted) {
          if (stored?.uid) {
            console.log("[auth] /user returned no server user; keeping local Pi auth state for Pi Browser session continuity.");
            setUser(stored);
          } else {
            window.localStorage.removeItem(PI_USER_STORAGE_KEY);
            setUser(null);
          }
        }
      } catch (err) {
        if (isAxiosError(err) && err.response?.status === 401) {
          if (stored?.uid) {
            console.log("[auth] /user session expired; keeping local Pi auth state so private refresh stays on the same page.");
            if (mounted) setUser(stored);
          } else {
            window.localStorage.removeItem(PI_USER_STORAGE_KEY);
            if (mounted) setUser(null);
          }
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

  const signInUser = useCallback(async (authResult: AuthResult) => {
    const fallback = authResultUser(authResult);
    let signedInUser = fallback;
    if (getBaseURL()) {
      try {
        const device = await getLoginDeviceMetadata();
        const response = await axiosClient.post<SignInResponse>("/user/signin", { authResult, sandbox: isPiSandboxMode(), device }, AUTH_REQUEST_CONFIG);
        console.log("[auth] /user/signin success", {
          status: response.status,
          hasUser: Boolean(response.data.user?.uid),
          username: response.data.user?.username || fallback.username,
        });
        signedInUser = toUser(response.data.user, fallback);
      } catch (err) {
        if (import.meta.env.DEV && isAxiosError(err) && !err.response) {
          console.warn("Backend sign-in unavailable; using local Pi session fallback.");
          signedInUser = fallback;
        } else {
          throw err;
        }
      }
    }
    setUser(storeUser(signedInUser));
    setShowSignIn(false);
    setAuthFeedback({ type: "success", message: `Signed in as ${signedInUser.username || "Pi user"}.` });
  }, []);

  const loginWithPi = useCallback(async () => {
    if (loginInProgressRef.current) return false;
    loginInProgressRef.current = true;
    setIsPiLoginPending(true);
    setIsLoading(true);
    setAuthFeedback({ type: "success", message: "Connecting to Pi Browser…" });
    // The Pi SDK script can exist inside Capacitor's WebView, but it cannot
    // complete the Pi Browser SDK flow there. Native Android must always use
    // the OAuth browser/deep-link flow, regardless of window.Pi.
    if (isCapacitorNative()) {
      try {
        const authResult = await authenticateWithCapacitorPi();
        await signInUser(authResult);
        await redirectToDashboard();
        return true;
      } catch (err) {
        setAuthFeedback({ type: "error", message: (err as Error)?.message || "Pi login failed." });
        return false;
      } finally {
        loginInProgressRef.current = false;
        setIsPiLoginPending(false);
        setIsLoading(false);
      }
    }
    if (!window.Pi) {
      if (import.meta.env.DEV && getBaseURL()) {
        try {
          const response = await axiosClient.post<SignInResponse>("/user/dev-signin", undefined, AUTH_REQUEST_CONFIG);
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
            accessToken: "dev-token",
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
        setIsLoading(false);
        return false;
      }
      requestPiBrowserHandoff("Pi login required");
      setAuthFeedback(null);
      loginInProgressRef.current = false;
        setIsPiLoginPending(false);
      setIsLoading(false);
      return false;
    }
    try {
      window.Pi.init({ version: "2.0", sandbox: isPiSandboxMode() });
    } catch (err) {
      console.warn("[auth] Pi SDK was already initialized or could not be reinitialized.", err);
    }
    try {
      const authResult = await authenticateWithTimeout(PI_AUTH_SCOPES);
      console.log("[auth] Pi authenticate success", {
        uid: authResult.user.uid,
        username: authResult.user.username,
        hasAccessToken: Boolean(authResult.accessToken),
      });
      await signInUser(authResult);
      await redirectToDashboard();
      return true;
    } catch (err) {
      console.error("Pi login failed:", err);
      const sdkMessage = (err as Error)?.message || "";
      const message = isAxiosError<BackendErrorBody>(err)
        ? toErrorMessage(err)
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
      setIsLoading(false);
    }
  }, [signInUser]);

  const refreshPiSession = useCallback(async () => {
    if (!window.Pi) return false;
    try {
      const authResult = await authenticateWithTimeout(PI_AUTH_SCOPES);
      await signInUser(authResult);
      return true;
    } catch (err) {
      console.error("Pi session refresh failed:", err);
      return false;
    }
  }, [signInUser]);

  const updateProfile = useCallback(async (profile: ProfileUpdate) => {
    const currentUser = user || getStoredPiUser();
    if (!currentUser) return null;

    const applyLocalProfileUpdate = () => {
      const sellerActive = profile.sellerActive ?? profile.role === "seller";
      const role = currentUser.role === "admin" ? "admin" : sellerActive ? "seller" : "buyer";
      const updatedUser = storeUser(toUser({
        ...profile,
        role,
        roles: [role],
        sellerActive,
        verificationLevel: currentUser.verificationLevel || "basic",
        verificationStatus: currentUser.verificationStatus || "none",
        settings: { ...(currentUser.settings || { theme: "light", language: "English", notifications: true }), language: profile.language || currentUser.settings?.language || "English" },
      }, currentUser));
      setUser(updatedUser);
      return updatedUser;
    };

    try {
      const response = await axiosClient.put<SignInResponse>("/user/profile", profile);
      if (response.data.user) {
        const updatedUser = storeUser(toUser(response.data.user, currentUser));
        setUser(updatedUser);
        return updatedUser;
      }
    } catch (err) {
      if (isAxiosError(err) && (!err.response || [401, 403, 404, 405, 413, 502, 503, 504].includes(err.response.status))) {
        return applyLocalProfileUpdate();
      }
      throw err;
    }

    return applyLocalProfileUpdate();
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
    setIsLoading(true);
    try {
      const { supportsNativePushNotifications, unregisterNativePushOnLogout } = await import("../lib/nativePushNotifications");
      if (supportsNativePushNotifications()) await unregisterNativePushOnLogout();
      if (getBaseURL()) await axiosClient.post("/user/signout", undefined, AUTH_REQUEST_CONFIG);
      window.localStorage.removeItem(PI_USER_STORAGE_KEY);
      if (isCapacitorNative()) void import("../lib/nativeAppLock").then(({ clearAppLockSettings, clearNativeSessionToken }) => Promise.all([clearAppLockSettings(), clearNativeSessionToken()])).catch(() => undefined);
      setUser(null);
      setAuthFeedback({ type: "success", message: "Signed out successfully." });
    } catch (err) {
      console.error("Sign-out failed:", err);
      window.localStorage.removeItem(PI_USER_STORAGE_KEY);
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
    closeSignIn: () => setShowSignIn(false),
    requireAuth: () => setShowSignIn(true),
    isLoading,
    isPiLoginPending,
    authFeedback,
    showFeedback,
  };
};
