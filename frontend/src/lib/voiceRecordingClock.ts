/** Active recording duration; time spent paused is excluded. */
export class VoiceRecordingClock {
  private startedAt: number;
  private pausedAt: number | null = null;
  private now: () => number;
  constructor(now: () => number = Date.now) { this.now = now; this.startedAt = now(); }
  pause() { if (this.pausedAt === null) this.pausedAt = this.now(); }
  resume() { if (this.pausedAt !== null) { this.startedAt += this.now() - this.pausedAt; this.pausedAt = null; } }
  seconds() { return Math.max(0, Math.round(((this.pausedAt ?? this.now()) - this.startedAt) / 1000)); }
}
