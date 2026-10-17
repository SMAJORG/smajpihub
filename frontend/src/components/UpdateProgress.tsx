import type { UpdateProgress as Progress } from "../lib/appUpdates";
import "./UpdateProgress.css";
export default function UpdateProgress({ progress }: { progress: Progress | null }) {
  if (!progress) return null;
  const downloading = progress.stage === "downloading" && (progress.total || 0) > 0;
  const percent = downloading ? Math.min(100, Math.max(0, Math.floor((progress.received || 0) / progress.total! * 100))) : undefined;
  const labels: Record<Progress["stage"], string> = {
    preparing: "Preparing your update...",
    permission: "Allow app updates in Android settings, then return here.",
    downloading: "Downloading update",
    verifying: "Download complete. Checking the update for safety...",
    installing: "Update ready. Confirm installation in the Android window.",
    browser: "Download opened in your browser. Check its Downloads for progress.",
  };
  const mb = (bytes: number) => (bytes / 1024 / 1024).toFixed(1);
  return <section className="app-update-progress" aria-label="Update progress">
    <p role="status" aria-live="polite">{labels[progress.stage]}{percent !== undefined ? <strong> {percent}%</strong> : null}</p>
    {progress.stage !== "browser" && progress.stage !== "permission" ? <progress aria-label="Update download" max={100} value={percent ?? (progress.stage === "verifying" || progress.stage === "installing" ? 100 : undefined)} /> : null}
    {downloading ? <small>{mb(progress.received || 0)} MB of {mb(progress.total!)} MB</small> : null}
    {progress.stage === "downloading" || progress.stage === "preparing" ? <small>Keep this screen open. This may take a few minutes.</small> : null}
  </section>;
}
