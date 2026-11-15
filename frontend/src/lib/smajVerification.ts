import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { axiosClient } from "./axiosClient";

export type SmajVerification = { userId: string | null; status: "none" | "pending" | "approved" | "rejected" | "suspended" | "expired" | "revoked"; verified: boolean; expiresAt: string | null; revision: number };
type Entry = { value: SmajVerification | null; listeners: Set<() => void>; expiry?: ReturnType<typeof setTimeout> };
const entries = new Map<string, Entry>();
let timer: ReturnType<typeof setInterval> | undefined;
let queued = false;
let running = false;
let generation = 0;
const publish = (entry: Entry, value: SmajVerification | null) => {
  clearTimeout(entry.expiry);
  entry.value = value;
  const remaining = value?.expiresAt ? Date.parse(value.expiresAt) - Date.now() : Infinity;
  if (value?.verified && remaining <= 0) entry.value = { ...value, verified: false, status: "expired" };
  else if (value?.verified && Number.isFinite(remaining)) entry.expiry = setTimeout(() => {
    if (Date.parse(value.expiresAt!) <= Date.now()) publish(entry, { ...value, verified: false, status: "expired" });
    else publish(entry, value);
  }, Math.min(remaining, 2147483647));
  entry.listeners.forEach(listener => listener());
};
const refresh = async () => {
  queued = false;
  if (running || document.hidden) return;
  running = true;
  const version = generation;
  const ids = [...entries.keys()];
  try {
    for (let offset = 0; offset < ids.length; offset += 100) {
      const batch = ids.slice(offset, offset + 100);
      try {
        const { data } = await axiosClient.post<{ statuses: Record<string, SmajVerification> }>("/user/verification-status", { userIds: batch });
        if (version === generation) batch.forEach(id => { const entry = entries.get(id); if (entry) publish(entry, data.statuses[id] || null); });
      } catch {
        if (version === generation) batch.forEach(id => { const entry = entries.get(id); if (entry) publish(entry, null); });
      }
    }
  } finally { running = false; if (version !== generation && entries.size) schedule(); }
};
function schedule() { if (!queued) { queued = true; queueMicrotask(() => { void refresh(); }); } }
const invalidate = () => { generation++; entries.forEach(entry => publish(entry, null)); schedule(); };
const resume = () => { if (!document.hidden) invalidate(); };
function subscribe(id: string, listener: () => void) {
  if (!id) return () => undefined;
  let entry = entries.get(id);
  if (!entry) { entry = { value: null, listeners: new Set() }; entries.set(id, entry); generation++; schedule(); }
  entry.listeners.add(listener);
  if (!timer) {
    timer = setInterval(() => { void refresh(); }, 15000);
    window.addEventListener("smaj:verification-changed", invalidate);
    window.addEventListener("focus", resume);
    document.addEventListener("visibilitychange", resume);
  }
  return () => {
    entry!.listeners.delete(listener);
    if (!entry!.listeners.size) { clearTimeout(entry!.expiry); entries.delete(id); }
    if (!entries.size) {
      clearInterval(timer); timer = undefined;
      window.removeEventListener("smaj:verification-changed", invalidate);
      window.removeEventListener("focus", resume);
      document.removeEventListener("visibilitychange", resume);
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
  const [values, setValues] = useState<Record<string, SmajVerification | null>>({});
  useEffect(() => {
    const ids = JSON.parse(key) as string[];
    const update = () => setValues(Object.fromEntries(ids.map(id => [id, entries.get(id)?.value || null])));
    const cleanups = ids.map(id => subscribe(id, update));
    update();
    return () => cleanups.forEach(cleanup => cleanup());
  }, [key]);
  return values;
}
