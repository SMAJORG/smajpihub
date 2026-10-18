import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { axiosClient } from "../lib/axiosClient";

export function useUserPresence(uid?: string) {
  useEffect(() => {
    if (!uid) return;
    const generate = () =>
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
    const sessionId = generate();
    let disposed = false,
      nativeActive = true,
      inFlight = false;
    let pending: boolean | null = null;
    let removeNative: (() => Promise<void>) | undefined;
    const drain = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        while (pending !== null) {
          const active = pending;
          pending = null;
          if (!navigator.onLine || (active && disposed)) continue;
          try {
            await axiosClient.post(
              "/user/presence",
              { sessionId, active, owner: uid },
              { timeout: 8000, headers: { "X-SMAJ-Silent": "true" } }
            );
          } catch {
            /* The next heartbeat retries without disrupting chat. */
          }
        }
      } finally {
        inFlight = false;
      }
    };
    const report = (active: boolean) => {
      pending = active;
      void drain();
    };
    const refresh = () => report(nativeActive && !document.hidden);
    const leave = () => {
      nativeActive = false;
      report(false);
    };
    const resume = () => {
      nativeActive = true;
      refresh();
    };
    if (Capacitor.isNativePlatform()) {
      void import("@capacitor/app")
        .then(({ App }) =>
          App.addListener("appStateChange", ({ isActive }) => {
            nativeActive = isActive;
            refresh();
          })
        )
        .then(handle => {
          if (disposed) void handle.remove();
          else removeNative = () => handle.remove();
        })
        .catch(() => undefined);
    }
    refresh();
    const timer = window.setInterval(() => {
      if (nativeActive && !document.hidden) report(true);
    }, 15000);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("online", refresh);
    window.addEventListener("focus", refresh);
    window.addEventListener("pagehide", leave);
    window.addEventListener("pageshow", resume);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      void removeNative?.();
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("online", refresh);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("pagehide", leave);
      window.removeEventListener("pageshow", resume);
      report(false);
    };
  }, [uid]);
}
