import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { axiosClient } from "./axiosClient";

export type SmajVerification = {
  userId: string | null;
  status: "none" | "pending" | "approved" | "rejected" | "suspended" | "expired" | "revoked";
  verified: boolean;
  level?: "pi_verified" | "seller_verified" | "trusted_seller" | null;
  expiresAt: string | null;
  revision: number;
  confirmedAt?: number;
};

const MAX_CONFIRMED_STATUS_AGE_MS = 5 * 60_000;

export const isSmajVerificationApproved = (
  value: SmajVerification | null | undefined
): value is SmajVerification & { userId: string; verified: true; status: "approved"; confirmedAt: number } => {
  if (
    typeof value?.userId !== "string" ||
    !value.userId ||
    value?.verified !== true ||
    value.status !== "approved" ||
    typeof value.confirmedAt !== "number" ||
    Date.now() - value.confirmedAt > MAX_CONFIRMED_STATUS_AGE_MS
  )
    return false;
  if (!value.expiresAt) return true;
  const expiration = Date.parse(value.expiresAt);
  return Number.isFinite(expiration) && expiration > Date.now();
};

type Entry = {
  value: SmajVerification | null;
  listeners: Set<() => void>;
  updatedAt: number;
  expiry?: ReturnType<typeof setTimeout>;
  cleanup?: ReturnType<typeof setTimeout>;
};

const entries = new Map<string, Entry>();
const VERIFICATION_REFRESH_INTERVAL_MS = 60_000;
const VERIFICATION_CACHE_STALE_MS = 60_000;
const VERIFICATION_ENTRY_RETENTION_MS = 5 * 60_000;
let timer: ReturnType<typeof setInterval> | undefined;
let queued = false;
let running = false;
let generation = 0;

const hasActiveEntries = () => [...entries.values()].some(entry => entry.listeners.size > 0);

const publish = (entry: Entry, value: SmajVerification | null) => {
  clearTimeout(entry.expiry);
  const confirmedAt = Date.now();
  let next = value ? { ...value, confirmedAt } : null;
  const expiresAt = value?.verified && value.status === "approved" && value.expiresAt ? Date.parse(value.expiresAt) : null;
  if (expiresAt !== null && (!Number.isFinite(expiresAt) || expiresAt <= Date.now())) {
    next = { ...next!, verified: false, status: "expired" };
  }
  entry.value = next;
  entry.updatedAt = confirmedAt;
  if (next?.verified && next.status === "approved") {
    const expiresAt = next.expiresAt ? Date.parse(next.expiresAt) : Infinity;
    const staleAt = confirmedAt + MAX_CONFIRMED_STATUS_AGE_MS;
    const delay = Math.min(expiresAt - Date.now(), staleAt - Date.now(), 2_147_483_647);
    entry.expiry = setTimeout(() => {
      const current = entry.value;
      if (!current || current.revision !== next!.revision || current.confirmedAt !== confirmedAt) return;
      if (expiresAt <= Date.now()) {
        publish(entry, { ...current, verified: false, status: "expired" });
      } else {
        entry.listeners.forEach(listener => listener());
        schedule();
        if (Number.isFinite(expiresAt)) {
          const expire = () => {
            if (expiresAt <= Date.now()) publish(entry, { ...current, verified: false, status: "expired" });
            else entry.expiry = setTimeout(expire, Math.min(expiresAt - Date.now(), 2_147_483_647));
          };
          entry.expiry = setTimeout(expire, Math.min(expiresAt - Date.now(), 2_147_483_647));
        }
      }
    }, delay);
  }
  entry.listeners.forEach(listener => listener());
};

const refresh = async () => {
  queued = false;
  if (running || document.hidden) return;
  const ids = [...entries]
    .filter(([, entry]) => entry.listeners.size > 0)
    .map(([id]) => id);
  if (!ids.length) return;
  running = true;
  const version = generation;
  try {
    for (let offset = 0; offset < ids.length; offset += 100) {
      const batch = ids.slice(offset, offset + 100);
      try {
        const { data } = await axiosClient.post<{ statuses: Record<string, SmajVerification> }>(
          "/user/verification-status",
          { userIds: batch },
          { headers: { "X-SMAJ-Silent": "true" } }
        );
        if (!data?.statuses || typeof data.statuses !== "object") {
          throw new Error("The verification status response was invalid.");
        }
        if (batch.some(id => !Object.prototype.hasOwnProperty.call(data.statuses, id))) {
          throw new Error("The verification status response omitted a requested account.");
        }
        if (version === generation) {
          batch.forEach(id => {
            const entry = entries.get(id);
            if (entry) publish(entry, data.statuses[id] ?? null);
          });
        }
      } catch (error) {
        if (version === generation) {
          console.warn("Could not refresh verification status; keeping the last confirmed state.", error);
        }
      }
    }
  } finally {
    running = false;
    if (version !== generation && hasActiveEntries()) schedule();
  }
};

function schedule() {
  if (!queued) {
    queued = true;
    queueMicrotask(() => {
      void refresh();
    });
  }
}

const invalidate = () => {
  generation++;
  schedule();
};

const resume = () => {
  if (!document.hidden) invalidate();
};

const startWatching = () => {
  if (timer) return;
  timer = setInterval(() => {
    void refresh();
  }, VERIFICATION_REFRESH_INTERVAL_MS);
  window.addEventListener("smaj:verification-changed", invalidate);
  window.addEventListener("focus", resume);
  document.addEventListener("visibilitychange", resume);
};

const stopWatching = () => {
  if (hasActiveEntries()) return;
  clearInterval(timer);
  timer = undefined;
  window.removeEventListener("smaj:verification-changed", invalidate);
  window.removeEventListener("focus", resume);
  document.removeEventListener("visibilitychange", resume);
};

function subscribe(id: string, listener: () => void) {
  if (!id) return () => undefined;
  let entry = entries.get(id);
  if (!entry) {
    entry = { value: null, listeners: new Set(), updatedAt: 0 };
    entries.set(id, entry);
    generation++;
  }
  clearTimeout(entry.cleanup);
  entry.cleanup = undefined;
  entry.listeners.add(listener);
  startWatching();
  if (Date.now() - entry.updatedAt >= VERIFICATION_CACHE_STALE_MS) schedule();
  return () => {
    entry!.listeners.delete(listener);
    if (!entry!.listeners.size) {
      entry!.cleanup = setTimeout(() => {
        if (entry!.listeners.size || entries.get(id) !== entry) return;
        clearTimeout(entry!.expiry);
        entries.delete(id);
      }, VERIFICATION_ENTRY_RETENTION_MS);
      stopWatching();
    }
  };
}

export function useSmajVerification(userId?: string) {
  const id = userId || "";
  const listen = useCallback((listener: () => void) => subscribe(id, listener), [id]);
  const snapshot = useCallback(() => entries.get(id)?.value || null, [id]);
  return useSyncExternalStore(listen, snapshot, () => null);
}

export function useSmajVerifications(userIds: string[]) {
  const key = JSON.stringify([...new Set(userIds.filter(Boolean))].sort());
  const ids = useMemo(() => JSON.parse(key) as string[], [key]);
  const [, forceUpdate] = useState(0);
  useEffect(() => {
    const notify = () => forceUpdate(value => value + 1);
    const cleanups = ids.map(id => subscribe(id, notify));
    notify();
    return () => cleanups.forEach(cleanup => cleanup());
  }, [ids]);
  return Object.fromEntries(ids.map(id => [id, entries.get(id)?.value || null]));
}
