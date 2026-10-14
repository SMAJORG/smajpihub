import { Capacitor, registerPlugin } from "@capacitor/core";
export type AndroidUpdatePackage = { url: string; size: number; sha256: string; versionCode: number };
export type AppUpdate = { available: boolean; version: string; details: string; native: boolean; apk?: AndroidUpdatePackage };
export const APP_VERSION = import.meta.env.VITE_APP_VERSION || "1.0.2";
export const APP_BUILD_ID = import.meta.env.VITE_APP_BUILD_ID || "development";
const RELEASE_API = "https://api.github.com/repos/SMAJORG/smajpihub/releases/tags/android-latest";
const updater = registerPlugin<{ install(update: AndroidUpdatePackage): Promise<{ installerOpened: boolean }> }>("SmajUpdater");
let installation: Promise<void> | null = null;
export const isNewerVersion = (latest: string, current: string) => {
  const a = latest.split(".").map(Number), b = current.split(".").map(Number);
  if (![...a, ...b].every(Number.isFinite)) throw new Error("The published app version is invalid.");
  for (let i = 0; i < Math.max(a.length, b.length); i++) if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
  return false;
};
export function parseAndroidUpdate(data: unknown, version: string): AndroidUpdatePackage {
  const item = data as Record<string, unknown> | null;
  if (!item || item.version !== version || typeof item.url !== "string" || item.url !== `https://github.com/SMAJORG/smajpihub/releases/download/android-v${version}/SMAJ-PI-HUB.apk` || typeof item.sha256 !== "string" || !/^[a-f0-9]{64}$/i.test(item.sha256) || typeof item.size !== "number" || !Number.isSafeInteger(item.size) || item.size <= 0 || item.size > 300 * 1024 * 1024 || typeof item.versionCode !== "number" || !Number.isSafeInteger(item.versionCode) || item.versionCode <= 0 || item.versionCode > 2100000000 || version !== `1.0.${item.versionCode}`) throw new Error("Verified update information is invalid or still publishing. Check again shortly.");
  return { url: item.url, sha256: item.sha256, size: item.size, versionCode: item.versionCode };
}
export const checkAppUpdate = async (native: boolean, currentVersion = APP_VERSION, currentBuild = APP_BUILD_ID): Promise<AppUpdate> => {
  const controller = new AbortController(), timer = window.setTimeout(() => controller.abort(), 15000);
  try {
    if (native && Capacitor.isNativePlatform()) { const { App } = await import("@capacitor/app"); currentVersion = (await App.getInfo()).version; }
    const url = native ? RELEASE_API : new URL("version.json", new URL(import.meta.env.BASE_URL, window.location.origin)).href;
    const response = await fetch(url, { cache: "no-store", signal: controller.signal });
    if (!response.ok) throw new Error("Could not check for updates. Please try again later.");
    const data = await response.json();
    if (native) {
      const version = String(data.body || "").match(/^Version:\s*(\d+\.\d+\.\d+)\s*$/m)?.[1];
      const encoded = String(data.body || "").match(/<!-- SMAJ_ANDROID_UPDATE\s*\n([\s\S]*?)\n-->/)?.[1];
      const marker = Array.isArray(data.assets) ? data.assets.find((asset: { name?: string }) => (asset.name || "").startsWith(`smaj-update-${version}-`) && /^smaj-update-1\.0\.\d+-\d+-[a-f0-9]{64}\.json$/.test(asset.name || ""))?.name : undefined;
      const fields = marker?.match(/^smaj-update-(1\.0\.(\d+))-(\d+)-([a-f0-9]{64})\.json$/);
      if (!version || (!encoded && !fields)) throw new Error("The verified Android update is not published yet. Check again shortly.");
      const metadata = fields ? { version: fields[1], versionCode: Number(fields[2]), size: Number(fields[3]), sha256: fields[4], url: `https://github.com/SMAJORG/smajpihub/releases/download/android-v${fields[1]}/SMAJ-PI-HUB.apk` } : JSON.parse(encoded!);
      const apk = parseAndroidUpdate(metadata, version);
      return { available: isNewerVersion(version, currentVersion), version, native, apk, details: String(data.body).replace(/^Version:.*\n?/, "").replace(/<!-- SMAJ_ANDROID_UPDATE[\s\S]*?-->/, "").trim() };
    }
    if (typeof data.buildId !== "string" || !data.buildId || typeof data.version !== "string") throw new Error("Update information is unavailable. Please try again later.");
    return { available: currentBuild !== "development" && data.buildId !== currentBuild, version: data.version, native, details: data.details || "A newer SMAJ PI HUB website build is ready." };
  } catch (error) { if (error instanceof Error && error.name === "AbortError") throw new Error("Version check timed out. Please try again."); throw error; }
  finally { window.clearTimeout(timer); }
};
export function installAppUpdate(update: AppUpdate): Promise<void> {
  if (installation) return installation;
  if (!update.native || !update.apk || !update.available) return Promise.reject(new Error("Check for an available verified Android update first."));
  const apk = parseAndroidUpdate({ ...update.apk, version: update.version }, update.version);
  installation = (async () => {
    if (Capacitor.isPluginAvailable("SmajUpdater")) await updater.install(apk);
    else { const { Browser } = await import("@capacitor/browser"); await Browser.open({ url: apk.url }); }
  })().finally(() => { installation = null; });
  return installation;
}
