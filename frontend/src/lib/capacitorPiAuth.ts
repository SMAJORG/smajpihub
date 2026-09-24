import { App } from "@capacitor/app";
import { AppLauncher } from "@capacitor/app-launcher";
import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import type { AuthResult } from "../types/pi";

const STATE_KEY = "smaj_pi_oauth_state";
const BRIDGE_URL = "pi://smajpihub.com/signin/android";
const SIGN_IN_TIMEOUT_MS = 120000;

export const isCapacitorNative = () => Capacitor.isNativePlatform();

const randomState = () => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, value => value.toString(16).padStart(2, "0")).join("");
};

export type CapacitorPiAuthStage = "opening" | "verifying";

export async function authenticateWithCapacitorPi(
  onStageChange?: (stage: CapacitorPiAuthStage) => void
): Promise<AuthResult> {
  const state = randomState();
  await Preferences.set({ key: STATE_KEY, value: state });

  const bridgeUrl = new URL(BRIDGE_URL);
  bridgeUrl.searchParams.set("state", state);
  bridgeUrl.searchParams.set("sandbox", import.meta.env.VITE_SANDBOX_SDK === "true" ? "1" : "0");

  return new Promise<AuthResult>((resolve, reject) => {
    let finished = false;

    const finish = async (error?: unknown, result?: AuthResult) => {
      if (finished) return;
      finished = true;
      window.clearTimeout(timeout);
      await (await listenerPromise).remove();
      await Preferences.remove({ key: STATE_KEY });
      if (error) reject(error);
      else resolve(result!);
    };

    const handleCallback = async (url: string) => {
      if (!url.startsWith("smajpihub://oauth/pi") && !url.startsWith("https://smajpihub.com/signin/callback")) return;
      try {
        onStageChange?.("verifying");
        const callback = new URL(url);
        const params = new URLSearchParams(callback.hash.replace(/^#/, ""));
        const storedState = (await Preferences.get({ key: STATE_KEY })).value || "";
        if (!storedState || params.get("state") !== storedState) {
          throw new Error("OAuth state validation failed.");
        }

        const providerError = params.get("error");
        if (providerError) throw new Error(params.get("error_description") || providerError);

        const accessToken = params.get("access_token") || "";
        if (!accessToken) throw new Error("Pi did not return an access token.");

        const response = await fetch("https://api.minepi.com/v2/me", {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!response.ok) throw new Error("Pi could not verify this sign-in.");

        const user = await response.json() as AuthResult["user"];
        if (!user.uid || !user.username) throw new Error("Pi returned an incomplete identity.");
        await finish(undefined, { accessToken, user });
      } catch (error) {
        await finish(error);
      }
    };

    const listenerPromise = App.addListener("appUrlOpen", ({ url }) => void handleCallback(url));
    const timeout = window.setTimeout(
      () => void finish(new Error("Pi sign-in timed out. Return to SMAJ PI HUB and try again.")),
      SIGN_IN_TIMEOUT_MS
    );

    void (async () => {
      try {
        await listenerPromise;
        onStageChange?.("opening");
        const launch = await AppLauncher.openUrl({ url: bridgeUrl.toString() });
        if (!launch.completed) throw new Error("Pi Browser could not be opened.");
      } catch (error) {
        await finish(error);
      }
    })();
  });
}
