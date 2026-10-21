import { axiosClient } from "./axiosClient";

// Observe the existing transport without changing its cache, URLs, or workflows.
type ConnectionSnapshot = { lastContact: number | null; failures: readonly string[]; pendingWrites: number };
let snapshot: ConnectionSnapshot = { lastContact: null, failures: [], pendingWrites: 0 };
const failures = new Set<string>();
const listeners = new Set<() => void>();
const keyFor = (url?: string, method = "get") =>
  url?.includes("/careroute/") && !url.includes("/hospital/login") && !url.includes("/hospital/register")
    ? `${method.toUpperCase()} ${url.split("?")[0]}`
    : null;
const publish = (lastContact = snapshot.lastContact, pendingWrites = snapshot.pendingWrites) => {
  snapshot = { lastContact, failures: [...failures], pendingWrites };
  listeners.forEach(listener => listener());
};

axiosClient.interceptors.request.use(config => {
  const key = keyFor(config.url, config.method);
  if (key && config.method !== "get") {
    if (!navigator.onLine) {
      failures.add(key);
      publish();
    } else publish(undefined, snapshot.pendingWrites + 1);
  }
  return config;
});
axiosClient.interceptors.response.use(
  response => {
    const key = keyFor(response.config.url, response.config.method);
    if (key) {
      failures.delete(key);
      publish(Date.now(), Math.max(0, snapshot.pendingWrites - (response.config.method !== "get" ? 1 : 0)));
    }
    return response;
  },
  error => {
    const key = keyFor(error.config?.url, error.config?.method);
    if (key) {
      failures.add(key);
      publish(undefined, Math.max(0, snapshot.pendingWrites - (error.config?.method !== "get" ? 1 : 0)));
    }
    return Promise.reject(error);
  }
);

export const careRouteConnection = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getSnapshot: () => snapshot,
};
