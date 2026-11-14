import { refreshHubSession, clearSessionCredentials, getHubRefreshToken, getHubAccessToken } from "./sessionCredentials";
import { Capacitor } from "@capacitor/core";
import axios, { type AxiosRequestConfig } from "axios";
import { showFeedback } from "./feedback";
import { buildResponseCacheKey, isCacheableApiRead, readCachedResponse, storeCachedResponse } from "./offlineCache";

const PRODUCTION_API_BASE_URL = import.meta.env.MODE === "solohost" ? "/api" : "https://smajpihub.onrender.com";
const PI_USER_STORAGE_KEY = "smaj_pi_user";
const MAX_READ_RETRIES = 2;
const RETRY_DELAYS_MS = [1_500, 3_000] as const;
const STARTUP_NOTICE_COOLDOWN_MS = 15_000;
let lastStartupNoticeAt = 0;

declare module "axios" { interface AxiosRequestConfig { smajSkipReadRetry?: boolean } }

type RetryableRequestConfig = AxiosRequestConfig & {
  __smajRetryCount?: number;
  __smajAuthRetried?: boolean;
};
const API_CREDENTIALS_CONFIG: Pick<AxiosRequestConfig, "withCredentials"> = {
  withCredentials: true,
};

const isConfiguredURL = (url?: string) => Boolean(url && url !== "$$BACKEND_URL$$" && url !== "$$API_BASE_URL$$");

export const getBaseURL = () => {
  const runtimeURL = typeof window !== "undefined" ? window.__ENV?.apiBaseURL || window.__ENV?.backendURL : undefined;

  if (isConfiguredURL(runtimeURL)) {
    return runtimeURL;
  }

  const buildURL = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_BACKEND_URL;
  if (isConfiguredURL(buildURL)) {
    return buildURL;
  }

  return PRODUCTION_API_BASE_URL;
};

axios.defaults.withCredentials = true;

export const axiosClient = axios.create({
  baseURL: getBaseURL(),
  timeout: 20_000,
  ...API_CREDENTIALS_CONFIG,
});

axiosClient.defaults.withCredentials = true;

const getStoredAccessToken = () => {
  try {
    const stored = window.localStorage.getItem(PI_USER_STORAGE_KEY);
    if (!stored) return "";
    const user = JSON.parse(stored) as { accessToken?: string };
    return user.accessToken || "";
  } catch {
    return "";
  }
};

axiosClient.interceptors.request.use(async config => {
  const testnetRequest = /\/admin\/testnet\/a2u(?:\/|$)/.test(config.url || "") || /\/user\/testnet\/wallet-consent$/.test(config.url || "");
  // These endpoints authenticate a Hub bearer, never cross-site cookies.
  config.withCredentials = !testnetRequest;
  const method = String(config.method || "get").toLowerCase();
  if (typeof navigator !== "undefined" && !navigator.onLine && !["get", "head", "options"].includes(method)) {
    showFeedback("You're offline. This action needs an internet connection.", "info");
    return Promise.reject(new Error("SMAJ_OFFLINE_MUTATION_BLOCKED"));
  }
  if (/\/user\/signout$/.test(config.url || "")) {
    const refreshToken = await getHubRefreshToken();
    if (refreshToken) config.headers.set("X-SMAJ-Refresh-Token", refreshToken);
  }
  let payoutToken = testnetRequest ? await getHubAccessToken() : "";
  if (testnetRequest && !payoutToken) {
    await refreshHubSession(getBaseURL());
    payoutToken = await getHubAccessToken();
  }
  const accessToken = testnetRequest ? payoutToken : getStoredAccessToken() || (Capacitor.isNativePlatform()
    ? await import("./nativeAppLock").then(({ getNativeSessionToken }) => getNativeSessionToken()).catch(() => "")
    : "");
  if (accessToken) {
    config.headers = config.headers ?? {};
    (config.headers as Record<string, string>).Authorization = `Bearer ${accessToken}`;
    (config.headers as Record<string, string>)["X-SMAJ-Access-Token"] = accessToken;
  }
  return config;
});

axiosClient.interceptors.response.use(
  response => {
    const method = String(response.config.method || "get").toLowerCase();
    if (method === "get" && isCacheableApiRead(response.config.url)) {
      const key = buildResponseCacheKey(response.config.url, response.config.params);
      void storeCachedResponse(key, {
        data: response.data,
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(Object.entries(response.headers).map(([name, value]) => [name, String(value)])),
        cachedAt: Date.now(),
      }).catch(() => undefined);
    }
    return response;
  },
  async error => {
    const config = error?.config as RetryableRequestConfig | undefined;
    if (axios.isCancel(error) || config?.signal?.aborted) return Promise.reject(error);
    const method = String(config?.method || "get").toLowerCase();
    const status = Number(error?.response?.status || 0);
    if (status === 401 && error?.response?.data?.error === "session_revoked") {
      await clearSessionCredentials();
      return Promise.reject(error);
    }
    if (status === 401 && config && !config.__smajAuthRetried && !/\/user\/(signin|dev-signin|refresh)$/.test(config.url || "")) {
      config.__smajAuthRetried = true;
      try {
        if (await refreshHubSession(getBaseURL())) return axiosClient.request(config);
      } catch (renewalError) { return Promise.reject(renewalError); }
    }
    const isReadRequest = method === "get" || method === "head";
    const isTemporaryFailure = error?.code === "ECONNABORTED" || !error?.response || [502, 503, 504].includes(status);
    const retryCount = config?.__smajRetryCount || 0;
    if (config && isReadRequest && isTemporaryFailure && isCacheableApiRead(config.url)) {
      const cached = await readCachedResponse(buildResponseCacheKey(config.url, config.params)).catch(() => null);
      if (cached) {
        if (typeof window !== "undefined") showFeedback("Showing saved content while you're offline.", "info");
        return {
          data: cached.data,
          status: cached.status,
          statusText: cached.statusText,
          headers: cached.headers,
          config,
          request: error?.request,
        };
      }
    }

    if (config && !config.smajSkipReadRetry && isReadRequest && isTemporaryFailure && retryCount < MAX_READ_RETRIES) {
      config.__smajRetryCount = retryCount + 1;
      await new Promise(resolve => window.setTimeout(resolve, RETRY_DELAYS_MS[retryCount]));
      return axiosClient.request(config);
    }

    const suppressGlobalFeedback = String((config?.headers as Record<string, unknown> | undefined)?.["X-SMAJ-Silent"] || "") === "true";
    if (typeof window !== "undefined" && !suppressGlobalFeedback) {
      const backendMessage = error?.response?.data?.message;
      const message =
        typeof backendMessage === "string" && backendMessage.trim()
          ? backendMessage
          : status === 401
            ? "Your session has expired. Please sign in again."
            : status === 403
              ? "You do not have permission to complete this action."
              : isReadRequest && isTemporaryFailure
                ? "SMAJ PI HUB is still starting. Please wait a moment."
                : !error?.response
                  ? "The service could not be reached. Check your connection and try again."
                  : "Something went wrong. Please try again.";
      const isStartupMessage = isReadRequest && isTemporaryFailure;
      const isGenericMessage = message === "Something went wrong. Please try again.";
      const now = Date.now();
      if (!isGenericMessage && (!isStartupMessage || now - lastStartupNoticeAt >= STARTUP_NOTICE_COOLDOWN_MS)) {
        showFeedback(message, isStartupMessage ? "info" : "error");
        if (isStartupMessage) lastStartupNoticeAt = now;
      }
    }
    return Promise.reject(error);
  }
);

const resolveFetchInput = (input: RequestInfo | URL) => {
  if (typeof input !== "string") return input;
  if (!input.startsWith("/")) return input;
  return `${getBaseURL().replace(/\/+$/, "")}${input}`;
};

export const apiFetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
  const method = String(init.method || "GET").toUpperCase();
  if (typeof navigator !== "undefined" && !navigator.onLine && !["GET", "HEAD", "OPTIONS"].includes(method)) {
    showFeedback("You're offline. This action needs an internet connection.", "info");
    return Promise.reject(new Error("SMAJ_OFFLINE_MUTATION_BLOCKED"));
  }
  const target = resolveFetchInput(input);
  const location = window.location.href;
  const url = new URL(target instanceof Request ? target.url : String(target), location);
  const backend = new URL(getBaseURL(), location);
  if (url.origin !== backend.origin || !url.pathname.startsWith(backend.pathname.replace(/\/$/, "") + "/")) {
    return fetch(target, { ...init, credentials: "include" });
  }
  const send = async () => {
    const headers = new Headers(init.headers || (target instanceof Request ? target.headers : undefined));
    const token = Capacitor.isNativePlatform()
      ? await import("./nativeAppLock").then(storage => storage.getNativeSessionToken())
      : getStoredAccessToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    return fetch(target instanceof Request ? target.clone() : target, { ...init, headers, credentials: "include" });
  };
  const response = await send();
  if (response.status === 401 && !/\/user\/(signin|dev-signin|refresh|signout)$/.test(url.pathname)) {
    const renewed = await refreshHubSession(getBaseURL());
    if (renewed) return send();
  }
  return response;
};
