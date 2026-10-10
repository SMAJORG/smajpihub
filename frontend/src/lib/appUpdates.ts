export type AppUpdate = { available: boolean; version: string; details: string; native: boolean };
export const APP_VERSION = import.meta.env.VITE_APP_VERSION || "1.0.2";
export const APP_BUILD_ID = import.meta.env.VITE_APP_BUILD_ID || "development";

export const isNewerVersion = (latest: string, current: string) => {
  const a = latest.split(".").map(Number), b = current.split(".").map(Number);
  if (![...a, ...b].every(Number.isFinite)) throw new Error("The published app version is invalid.");
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
  }
  return false;
};

export const checkAppUpdate = async (native: boolean, currentVersion = APP_VERSION, currentBuild = APP_BUILD_ID): Promise<AppUpdate> => {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 15000);
  try {
    const url = native
      ? "https://api.github.com/repos/SMAJORG/smajpihub/releases/tags/android-latest"
      : new URL("version.json", new URL(import.meta.env.BASE_URL, window.location.origin)).href;
    const response = await fetch(url, { cache: "no-store", signal: controller.signal });
    if (!response.ok) throw new Error("Could not check for updates. Please try again later.");
    const data = await response.json();
    if (native) {
      const version = String(data.body || "").match(/^Version:\s*(\d+\.\d+\.\d+)\s*$/m)?.[1];
      if (!version || !data.assets?.some((asset: { name: string }) => asset.name === "SMAJ-PI-HUB.apk"))
        throw new Error("The latest Android version is not published yet. Please check again later.");
      return { available: isNewerVersion(version, currentVersion), version, native, details: String(data.body).replace(/^Version:.*\n?/, "").trim() };
    }
    if (typeof data.buildId !== "string" || !data.buildId || typeof data.version !== "string")
      throw new Error("Update information is unavailable. Please try again later.");
    return { available: currentBuild !== "development" && data.buildId !== currentBuild, version: data.version, native, details: data.details || "A newer SMAJ PI HUB website build is ready." };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("Version check timed out. Please try again.");
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
};
