import { axiosClient } from "./axiosClient";
import { watchedInterval, type PlaybackSample } from "./streamPlaybackMeasurement";
export const STREAM_ACTIVITY_EVENT = "smaj:stream-activity";

export const startStreamPlaybackTracking = (id: string, read: () => Omit<PlaybackSample, "at"> | null) => {
  const sessionId = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
  let previous: PlaybackSample | null = null;
  let seconds = 0;
  let started = false;
  let saved = -1;
  let saving = false;
  let stopped = false;
  const send = async () => {
    if (!started || saving || seconds <= saved) return;
    saving = true;
    const checkpoint = seconds;
    try {
      const { data } = await axiosClient.post<{ recorded: boolean }>(`/stream/playback/${encodeURIComponent(id)}/events`, { sessionId, watchSeconds: checkpoint }, { headers: { "X-SMAJ-Silent": "true" } });
      saved = checkpoint;
      if (data.recorded) window.dispatchEvent(new Event(STREAM_ACTIVITY_EVENT));
    } catch { /* Retry the cumulative checkpoint on the next heartbeat. */ }
    finally { saving = false; if (stopped && seconds > checkpoint) void send(); }
  };
  const sample = () => {
    const value = read();
    if (!value || !Number.isFinite(value.position)) { previous = null; return; }
    const current = { ...value, at: performance.now() };
    seconds += watchedInterval(previous, current);
    const justStarted = !started && current.playing;
    if (current.playing) started = true;
    if (justStarted || (previous?.playing && !current.playing)) void send();
    previous = current;
  };
  const flush = () => { sample(); void send(); };
  const interval = window.setInterval(sample, 1000);
  const heartbeat = window.setInterval(() => void send(), 5000);
  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", flush);
  sample();
  return () => {
    stopped = true;
    window.clearInterval(interval);
    window.clearInterval(heartbeat);
    window.removeEventListener("pagehide", flush);
    document.removeEventListener("visibilitychange", flush);
    flush();
  };
};
