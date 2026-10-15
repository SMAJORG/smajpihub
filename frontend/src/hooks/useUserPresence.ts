import { useEffect } from "react";
import { axiosClient } from "../lib/axiosClient";

export function useUserPresence(uid?: string) {
  useEffect(() => {
    if (!uid) return;
    const sessionId = crypto.randomUUID();
    let disposed = false;
    let queue = Promise.resolve();
    const report = (active: boolean) => {
      queue = queue.then(async () => {
        if (!navigator.onLine || (active && disposed)) return;
        await axiosClient.post("/user/presence", { sessionId, active }, { timeout: 8000 });
      }).catch(() => undefined);
    };
    const refresh = () => report(!document.hidden);
    const leave = () => report(false);
    refresh();
    const timer = window.setInterval(() => { if (!document.hidden) report(true); }, 15_000);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("online", refresh);
    window.addEventListener("pagehide", leave);
    window.addEventListener("pageshow", refresh);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("online", refresh);
      window.removeEventListener("pagehide", leave);
      window.removeEventListener("pageshow", refresh);
      report(false);
    };
  }, [uid]);
}
