import { checkAppUpdate } from "./appUpdates";
import { showFeedback } from "./feedback";
export const ANDROID_APK_URL = "https://github.com/SMAJORG/smajpihub/releases/download/android-latest/SMAJ-PI-HUB.apk";
let preparing = false;
export async function downloadVerifiedAndroidApk(event: { preventDefault(): void }): Promise<boolean> {
  event.preventDefault();
  if (preparing) return false;
  preparing = true;
  try {
    const update = await checkAppUpdate(true);
    if (!update.apk) throw new Error("A verified Android download is not ready yet.");
    window.location.assign(update.apk.url);
    return true;
  } catch (error) { showFeedback(error instanceof Error ? error.message : "The Android download could not be prepared. Try again.", "error"); return false; }
  finally { preparing = false; }
}
