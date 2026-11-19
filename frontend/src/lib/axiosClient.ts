import {
  refreshHubSession,
  clearSessionCredentials,
  getHubRefreshToken,
  getHubAccessToken,
} from "./sessionCredentials";
import { Capacitor } from "@capacitor/core";
import axios, { type AxiosRequestConfig, type AxiosResponse, type InternalAxiosRequestConfig } from "axios";
import { showFeedback } from "./feedback";
import {
  API_CACHE_FRESH_MS,
  API_CACHE_MAX_SWR_MS,
  buildResponseCacheKey,
  clearCachedResponsesForNamespace,
  getResponseCacheGeneration,
  getResponseCacheNamespace,
  isCacheableApiRead,
  isResponseCacheGenerationCurrent,
  readCachedResponse,
  storeCachedResponse,
  type CachedResponse,
} from "./offlineCache";

const PRODUCTION_API_BASE_URL = import.meta.env.MODE === "solohost" ? "/api" : "https://smajpihub.onrender.com";
const PI_USER_STORAGE_KEY = "smaj_pi_user";
const MAX_READ_RETRIES = 2;
const RETRY_DELAYS_MS = [1_500, 3_000] as const;
const STARTUP_NOTICE_COOLDOWN_MS = 15_000;
const CACHE_REVALIDATE_COOLDOWN_MS = 30_000;
let lastStartupNoticeAt = 0;
const readFlights = new Map<
  string,
  {
    promise: Promise<AxiosResponse>;
    resolve: (response: AxiosResponse) => void;
    reject: (error: unknown) => void;
  }
>();
const revalidatingReads = new Map<string, Promise<void>>();
const lastCacheRevalidationAt = new Map<string, number>();

declare module "axios" {
  interface AxiosRequestConfig {
    smajSkipReadRetry?: boolean;
    smajSkipResponseCache?: boolean;
    __smajCacheKey?: string;
    __smajCacheNamespace?: string;
    __smajCacheGeneration?: number;
    __smajReadFlightKey?: string;
    __smajAccountChanged?: boolean;
  }
}

type RetryableRequestConfig = AxiosRequestConfig & {
  __smajRetryCount?: number;
  __smajAuthRetried?: boolean;
};
type CacheableRequestConfig = RetryableRequestConfig & {
  __smajCacheKey?: string;
  __smajCacheNamespace?: string;
  __smajCacheGeneration?: number;
  __smajReadFlightKey?: string;
  __smajAccountChanged?: boolean;
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

const normalizeApiPath = (url = "") =>
  url
    .replace(/^https?:\/\/[^/]+/i, "")
    .split("?")[0]
    .toLowerCase();

const isAccountScopedRead = (url = "") =>
  /^\/(marketplace\/(feed|saved|sellers?)(?:\/|$)|profile(?:\/|$)|user\/(?:profile|stats)(?:\/|$)|notifications(?:\/|$)|my-learning(?:\/|$)|my-certificates(?:\/|$)|housing\/saved(?:\/|$)|courses\/(?:my|enrolled|progress)(?:\/|$))/.test(
    normalizeApiPath(url)
  );

const shouldInvalidateCachedReads = (url = "") => isCacheableApiRead(url) || normalizeApiPath(url) === "/user/settings";

const createCacheResponse = (cached: CachedResponse, config: InternalAxiosRequestConfig): AxiosResponse => ({
  data: cached.data,
  status: cached.status,
  statusText: cached.statusText,
  headers: axios.AxiosHeaders.from(cached.headers),
  config,
});

const createReadFlight = () => {
  let resolve!: (response: AxiosResponse) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<AxiosResponse>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

const settleReadFlight = (config: CacheableRequestConfig | undefined, response?: AxiosResponse, error?: unknown) => {
  const key = config?.__smajReadFlightKey;
  if (!key) return;
  const flight = readFlights.get(key);
  if (!flight) return;
  readFlights.delete(key);
  if (response) flight.resolve(response);
  else flight.reject(error);
};

const startBackgroundRevalidation = (config: CacheableRequestConfig) => {
  const key = config.__smajCacheKey;
  if (!key || !config.__smajCacheNamespace || config.__smajCacheGeneration === undefined) return;
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  const now = Date.now();
  if (now - (lastCacheRevalidationAt.get(key) || 0) < CACHE_REVALIDATE_COOLDOWN_MS) return;
  if (revalidatingReads.has(key)) return;
  lastCacheRevalidationAt.set(key, now);

  const requestConfig: CacheableRequestConfig = {
    ...config,
    signal: undefined,
    smajSkipResponseCache: true,
    smajSkipReadRetry: true,
    headers: { ...config.headers, "X-SMAJ-Silent": "true" },
  };
  const task = axiosClient
    .request(requestConfig)
    .then(
      () => undefined,
      () => undefined
    )
    .finally(() => revalidatingReads.delete(key));
  revalidatingReads.set(key, task);
};

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
  const method = String(config.method || "get").toLowerCase();
  const namespace = getResponseCacheNamespace();
  const cacheConfig = config as CacheableRequestConfig;
  if (cacheConfig.__smajCacheNamespace && cacheConfig.__smajCacheNamespace !== namespace) {
    delete cacheConfig.__smajCacheKey;
    delete cacheConfig.__smajCacheGeneration;
    cacheConfig.smajSkipResponseCache = true;
    cacheConfig.__smajAccountChanged = true;
  }
  cacheConfig.__smajCacheNamespace = namespace;

  if (method === "get" && isCacheableApiRead(config.url) && !config.smajSkipResponseCache && !config.signal?.aborted) {
    const accountScoped = isAccountScopedRead(config.url);
    if (!(accountScoped && namespace === "public")) {
      const key = buildResponseCacheKey(config.url, config.params, namespace);
      const generation = getResponseCacheGeneration(namespace);
      cacheConfig.__smajCacheKey = key;
      cacheConfig.__smajCacheGeneration = generation;
      const cached = await readCachedResponse(key).catch(() => null);
      if (config.signal?.aborted || namespace !== getResponseCacheNamespace()) {
        delete cacheConfig.__smajCacheKey;
        delete cacheConfig.__smajCacheGeneration;
      } else if (cached) {
        const age = Date.now() - cached.cachedAt;
        if (age <= API_CACHE_MAX_SWR_MS) {
          if (age > API_CACHE_FRESH_MS) startBackgroundRevalidation(cacheConfig);
          return Promise.reject({ __smajCachedResponse: cached, config });
        }
      }

      if (!config.signal) {
        const pending = readFlights.get(key);
        if (pending) return Promise.reject({ __smajInflightResponse: pending.promise, config });
        const flight = createReadFlight();
        readFlights.set(key, flight);
        cacheConfig.__smajReadFlightKey = key;
      }
    }
  }

  const testnetRequest =
    /\/admin\/testnet\/a2u(?:\/|$)/.test(config.url || "") || /\/user\/testnet\/wallet-consent$/.test(config.url || "");
  // These endpoints authenticate a Hub bearer, never cross-site cookies.
  config.withCredentials = !testnetRequest;
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
  const accessToken = testnetRequest
    ? payoutToken
    : getStoredAccessToken() ||
      (Capacitor.isNativePlatform()
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
    const config = response.config as CacheableRequestConfig;
    const method = String(config.method || "get").toLowerCase();
    if (method === "get" && isCacheableApiRead(config.url)) {
      const namespace = config.__smajCacheNamespace || getResponseCacheNamespace();
      if (isAccountScopedRead(config.url) && (config.__smajAccountChanged || namespace !== getResponseCacheNamespace())) {
        const error = new axios.CanceledError("Account changed while data was loading.");
        settleReadFlight(config, undefined, error);
        return Promise.reject(error);
      }
      const generation = config.__smajCacheGeneration;
      const key = config.__smajCacheKey;
      const cacheControl = String(
        Object.entries(response.headers).find(([name]) => name.toLowerCase() === "cache-control")?.[1] || ""
      );
      if (
        key &&
        generation !== undefined &&
        !(isAccountScopedRead(config.url) && namespace === "public") &&
        !/\bno-store\b/i.test(cacheControl) &&
        isResponseCacheGenerationCurrent(namespace, generation)
      ) {
        void storeCachedResponse(
          key,
          {
            data: response.data,
            status: response.status,
            statusText: response.statusText,
            headers: Object.fromEntries(Object.entries(response.headers).map(([name, value]) => [name, String(value)])),
            cachedAt: Date.now(),
          },
          namespace,
          generation
        ).catch(() => undefined);
      }
      settleReadFlight(config, response);
    } else if (["post", "put", "patch", "delete"].includes(method) && shouldInvalidateCachedReads(config.url)) {
      const namespace = config.__smajCacheNamespace || getResponseCacheNamespace();
      if (namespace !== "public") {
        void clearCachedResponsesForNamespace(namespace).catch(error => {
          console.warn("Could not invalidate cached API responses after an update.", error);
        });
      }
    }
    return response;
  },
  async error => {
    if (error?.__smajCachedResponse) {
      return createCacheResponse(
        error.__smajCachedResponse as CachedResponse,
        error.config as InternalAxiosRequestConfig
      );
    }
    if (error?.__smajInflightResponse) return error.__smajInflightResponse;

    const config = error?.config as CacheableRequestConfig | undefined;
    if (axios.isCancel(error) || config?.signal?.aborted) {
      settleReadFlight(config, undefined, error);
      return Promise.reject(error);
    }
    const method = String(config?.method || "get").toLowerCase();
    const status = Number(error?.response?.status || 0);
    if (status === 401 && error?.response?.data?.error === "session_revoked") {
      await clearSessionCredentials();
      settleReadFlight(config, undefined, error);
      return Promise.reject(error);
    }
    if (
      status === 401 &&
      config &&
      !config.__smajAuthRetried &&
      !/\/user\/(signin|dev-signin|refresh)$/.test(config.url || "")
    ) {
      config.__smajAuthRetried = true;
      config.smajSkipResponseCache = true;
      try {
        if (await refreshHubSession(getBaseURL(), true)) return axiosClient.request(config);
      } catch (renewalError) {
        settleReadFlight(config, undefined, renewalError);
        return Promise.reject(renewalError);
      }
    }
    const isReadRequest = method === "get" || method === "head";
    const isTemporaryFailure = error?.code === "ECONNABORTED" || !error?.response || [502, 503, 504].includes(status);
    const retryCount = config?.__smajRetryCount || 0;
    if (config && isReadRequest && isTemporaryFailure && isCacheableApiRead(config.url)) {
      const key =
        config.__smajCacheKey || buildResponseCacheKey(config.url, config.params, config.__smajCacheNamespace);
      const cached = await readCachedResponse(key).catch(() => null);
      const accountChanged =
        isAccountScopedRead(config.url) &&
        (config.__smajAccountChanged || config.__smajCacheNamespace !== getResponseCacheNamespace());
      if (cached && !accountChanged) {
        if (typeof window !== "undefined") showFeedback("Showing saved content while you're offline.", "info");
        const response = createCacheResponse(cached, config as InternalAxiosRequestConfig);
        settleReadFlight(config, response);
        return response;
      }
    }

    if (config && !config.smajSkipReadRetry && isReadRequest && isTemporaryFailure && retryCount < MAX_READ_RETRIES) {
      config.__smajRetryCount = retryCount + 1;
      config.smajSkipResponseCache = true;
      await new Promise(resolve => window.setTimeout(resolve, RETRY_DELAYS_MS[retryCount]));
      return axiosClient.request(config);
    }

    const suppressGlobalFeedback =
      String((config?.headers as Record<string, unknown> | undefined)?.["X-SMAJ-Silent"] || "") === "true";
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
    settleReadFlight(config, undefined, error);
    return Promise.reject(error);
  }
);

const resolveFetchInput = (input: RequestInfo | URL) => {
  if (typeof input !== "string") return input;
  if (!input.startsWith("/")) return input;
  return `${getBaseURL().replace(/\/+$/, "")}${input}`;
};

const apiFetchRevalidations = new Map<string, Promise<void>>();

const cacheFetchResponse = (response: Response, key: string, namespace: string, generation: number) => {
  const cacheControl = response.headers.get("cache-control") || "";
  if (
    !response.ok ||
    /\bno-store\b/i.test(cacheControl) ||
    namespace !== getResponseCacheNamespace() ||
    !isResponseCacheGenerationCurrent(namespace, generation)
  )
    return;
  const headers = Object.fromEntries(response.headers.entries());
  void response
    .text()
    .then(data =>
      storeCachedResponse(
        key,
        {
          data,
          status: response.status,
          statusText: response.statusText,
          headers,
          cachedAt: Date.now(),
        },
        namespace,
        generation
      )
    )
    .catch(() => undefined);
};

const responseFromCache = (cached: CachedResponse) =>
  new Response(
    [204, 205].includes(cached.status)
      ? null
      : typeof cached.data === "string"
        ? cached.data
        : JSON.stringify(cached.data),
    {
      status: cached.status,
      statusText: cached.statusText,
      headers: cached.headers,
    }
  );

export const apiFetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
  const method = String(init.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
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
  const namespace = getResponseCacheNamespace();
  const request = target instanceof Request ? target : undefined;
  const requestCacheControl = new Headers(init.headers || request?.headers).get("cache-control") || "";
  const relativePath = url.pathname.slice(backend.pathname.replace(/\/$/, "").length) || "/";
  const cacheUrl = `${relativePath}${url.search}`;
  const cacheEnabled =
    method === "GET" &&
    init.cache !== "no-store" &&
    request?.cache !== "no-store" &&
    !/\bno-store\b/i.test(requestCacheControl) &&
    isCacheableApiRead(cacheUrl) &&
    !(isAccountScopedRead(cacheUrl) && namespace === "public");
  const cacheKey = cacheEnabled ? buildResponseCacheKey(cacheUrl, undefined, namespace) : "";
  const cacheGeneration = cacheEnabled ? getResponseCacheGeneration(namespace) : 0;
  const send = async (background = false) => {
    const headers = new Headers(init.headers || (target instanceof Request ? target.headers : undefined));
    const token = Capacitor.isNativePlatform()
      ? await import("./nativeAppLock").then(storage => storage.getNativeSessionToken())
      : getStoredAccessToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    return fetch(target instanceof Request ? target.clone() : target, {
      ...init,
      ...(background ? { signal: null } : {}),
      headers,
      credentials: "include",
    });
  };

  if (cacheEnabled && !init.signal?.aborted) {
    const cached = await readCachedResponse(cacheKey).catch(() => null);
    if (
      cached &&
      !init.signal?.aborted &&
      namespace === getResponseCacheNamespace() &&
      Date.now() - cached.cachedAt <= API_CACHE_MAX_SWR_MS
    ) {
      if (Date.now() - cached.cachedAt > API_CACHE_FRESH_MS && !apiFetchRevalidations.has(cacheKey)) {
        const request = send(true)
          .then(async response => {
            if (
              response.status === 401 &&
              !/\/user\/(signin|dev-signin|refresh|signout)$/.test(url.pathname) &&
              (await refreshHubSession(getBaseURL(), true))
            ) {
              response = await send(true);
            }
            cacheFetchResponse(response, cacheKey, namespace, cacheGeneration);
          })
          .catch(() => undefined)
          .finally(() => apiFetchRevalidations.delete(cacheKey));
        apiFetchRevalidations.set(cacheKey, request);
      }
      return responseFromCache(cached);
    }
  }

  let response = await send();
  if (response.status === 401 && !/\/user\/(signin|dev-signin|refresh|signout)$/.test(url.pathname)) {
    const renewed = await refreshHubSession(getBaseURL(), true);
    if (renewed) response = await send();
  }
  if (cacheEnabled) cacheFetchResponse(response.clone(), cacheKey, namespace, cacheGeneration);
  return response;
};
