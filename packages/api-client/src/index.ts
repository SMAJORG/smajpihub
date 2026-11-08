import type { ApiErrorBody, HealthResponse, PiAuthResult, SmajUser, HubSession } from "@smaj/shared-types";

export type TokenProvider = () => Promise<string | null> | string | null;
export type ApiClientOptions = { baseUrl: string; getAccessToken?: TokenProvider; getRefreshToken?: TokenProvider; onSession?: (session: HubSession) => Promise<void>; onSessionExpired?: () => Promise<void> };
export class SmajApiError extends Error {
  constructor(public status: number, public body: ApiErrorBody) {
    super(body.message || `SMAJ API request failed (${status})`);
  }
}

export const createSmajApiClient = ({ baseUrl, getAccessToken, getRefreshToken, onSession, onSessionExpired }: ApiClientOptions) => {
  let renewal: Promise<boolean> | null = null;
  const refreshSession = () => {
    if (renewal) return renewal;
    renewal = (async () => {
      const token = await getRefreshToken?.();
      if (!token) return false;
      const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/user/refresh`, {
        method: "POST", headers: { "Content-Type": "application/json", "X-SMAJ-Refresh-Token": token }, body: "{}",
      });
      if (!response.ok) {
        if ([401, 403].includes(response.status)) { await onSessionExpired?.(); return false; }
        throw new SmajApiError(response.status, await response.json().catch(() => ({})));
      }
      const body = await response.json() as { session: HubSession };
      if (token !== await getRefreshToken?.()) return false;
      await onSession?.(body.session);
      return true;
    })().finally(() => { renewal = null; });
    return renewal;
  };
  const request = async <T>(path: string, init: RequestInit = {}, retried = false): Promise<T> => {
    const accessToken = await getAccessToken?.();
    const refresh = path === "/user/signout" ? await getRefreshToken?.() : null;
    const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`, {
      ...init,
      headers: {
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}`, "X-SMAJ-Access-Token": accessToken } : {}),
        ...(refresh ? { "X-SMAJ-Refresh-Token": refresh } : {}),
        ...init.headers
      }
    });
    if (response.status === 401 && !retried && !["/user/signin", "/user/signout"].includes(path) && await refreshSession()) return request<T>(path, init, true);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new SmajApiError(response.status, body as ApiErrorBody);
    return body as T;
  };

  return {
    request,
    refreshSession,
    health: () => request<HealthResponse>("/health"),
    currentUser: () => request<{ user: SmajUser | null }>("/user"),
    signInWithPi: (authResult: PiAuthResult) => request<{ user: SmajUser; session?: HubSession }>("/user/signin", {
      method: "POST",
      body: JSON.stringify({ authResult })
    }),
    products: () => request<{ products: unknown[] }>("/marketplace/products"),
    conversations: () => request<{ conversations: unknown[] }>("/messages"),
    notifications: () => request<{ notifications: unknown[] }>("/notifications")
  };
};