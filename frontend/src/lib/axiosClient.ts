import axios, { type AxiosRequestConfig } from "axios";
import { showFeedback } from "./feedback";
import { buildResponseCacheKey, isCacheableApiRead, readCachedResponse, storeCachedResponse } from "./offlineCache";

const PRODUCTION_API_BASE_URL = import.meta.env.MODE === "solohost" ? "/api" : "https://smajpihub.onrender.com";
const PI_USER_STORAGE_KEY = "smaj_pi_user";
const MAX_READ_RETRIES = 2;
const RETRY_DELAYS_MS = [1_500, 3_000] as const;
const STARTUP_NOTICE_COOLDOWN_MS = 15_000;
let lastStartupNoticeAt = 0;

type RetryableRequestConfig = AxiosRequestConfig & {
  __smajRetryCount?: number;
  __smajSilent?: boolean;
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

axiosClient.interceptors.request.use(config => {
  config.withCredentials = true;
  const method = String(config.method || "get").toLowerCase();
  if (typeof navigator !== "undefined" && !navigator.onLine && !["get", "head", "options"].includes(method)) {
    showFeedback("You're offline. This action needs an internet connection.", "info");
    return Promise.reject(new Error("SMAJ_OFFLINE_MUTATION_BLOCKED"));
  }
  const accessToken = getStoredAccessToken();
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
    const method = String(config?.method || "get").toLowerCase();
    const status = Number(error?.response?.status || 0);
    if (status === 401 && error?.response?.data?.error === "session_revoked" && typeof window !== "undefined") {
      window.localStorage.removeItem(PI_USER_STORAGE_KEY);
      window.location.assign("/");
      return Promise.reject(error);
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

    if (config && isReadRequest && isTemporaryFailure && retryCount < MAX_READ_RETRIES) {
      config.__smajRetryCount = retryCount + 1;
      await new Promise(resolve => window.setTimeout(resolve, RETRY_DELAYS_MS[retryCount]));
      return axiosClient.request(config);
    }

    if (typeof window !== "undefined" && !config?.__smajSilent) {
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

export const apiFetch = (input: RequestInfo | URL, init: RequestInit = {}) => {
  const method = String(init.method || "GET").toUpperCase();
  if (typeof navigator !== "undefined" && !navigator.onLine && !["GET", "HEAD", "OPTIONS"].includes(method)) {
    showFeedback("You're offline. This action needs an internet connection.", "info");
    return Promise.reject(new Error("SMAJ_OFFLINE_MUTATION_BLOCKED"));
  }
  return fetch(resolveFetchInput(input), { ...init, credentials: "include" });
};
