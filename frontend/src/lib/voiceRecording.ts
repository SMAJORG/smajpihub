import { Capacitor, registerPlugin } from "@capacitor/core";
const permissions = registerPlugin<{ requestMicrophone(): Promise<{ state: string }> }>("SmajPermissions");
export async function ensureVoicePermission() {
  if (Capacitor.getPlatform() !== "android") return;
  const result = await permissions.requestMicrophone();
  if (result.state !== "granted") throw new DOMException("Microphone access was denied", "NotAllowedError");
}
export function voiceRecordingError(error: unknown): string {
  const name = error instanceof Error || error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") return "Microphone access was denied. Enable microphone access for SMAJ PI HUB in app settings, then retry.";
  if (name === "NotFoundError" || name === "DevicesNotFoundError") return "No microphone was found. Connect or enable a microphone and retry.";
  if (name === "NotReadableError" || name === "TrackStartError" || name === "AbortError") return "The microphone could not start. Close other apps using it and retry.";
  if (name === "NotSupportedError") return "This device cannot record this audio format. Update Android System WebView and retry.";
  if (name === "SecurityError") return "Microphone recording is blocked by this browser or page security settings.";
  return "Voice recording could not start. Retry or restart the app.";
}
