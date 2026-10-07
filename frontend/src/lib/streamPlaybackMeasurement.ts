export type PlaybackSample = { position: number; playing: boolean; seeking?: boolean; rate?: number; at: number };
export const watchedInterval = (previous: PlaybackSample | null, current: PlaybackSample) => {
  if (!previous?.playing || previous.seeking || current.seeking) return 0;
  const elapsed = (current.at - previous.at) / 1000;
  const advanced = current.position - previous.position;
  const rate = previous.rate || 1;
  // Ignore buffering, suspended timers, rewinds and jumps caused by seeking.
  if (elapsed <= 0 || elapsed > 2.5 || advanced <= 0 || advanced > elapsed * rate + 0.75) return 0;
  return Math.min(elapsed, advanced / rate);
};
