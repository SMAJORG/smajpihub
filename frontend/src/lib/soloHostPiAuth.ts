import type { AuthResult } from "../types/pi";

const STATE_KEY = "smaj_solohost_pi_oauth_state";
const POPUP_NAME = "smaj-solohost-pi-signin";
type OAuthMessage = { source: "smaj-solohost-pi-oauth"; accessToken?: string; state?: string; error?: string };

const getOAuthConfig = () => {
  const clientId = window.__ENV?.piOAuthClientId?.trim() || import.meta.env.VITE_PI_OAUTH_CLIENT_ID || "";
  const redirectUri = window.__ENV?.piOAuthRedirectUri?.trim() || import.meta.env.VITE_PI_OAUTH_REDIRECT_URI || "";
  if (!clientId || !redirectUri) throw new Error("Pi Sign-in requires the original app’s OAuth client ID and registered callback URL. Contact the administrator.");
  if (new URL(redirectUri).origin !== window.location.origin) throw new Error("The Pi OAuth redirect must use this website origin.");
  return { clientId, redirectUri };
};

const randomState = () => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, value => value.toString(16).padStart(2, "0")).join("");
};

export const startSoloHostPiSignIn = (state: string) => {
  const { clientId, redirectUri } = getOAuthConfig();
  const sdk = window.Pi;
  if (!sdk?.signIn) throw new Error("Pi Sign-In SDK is unavailable. Refresh the page and try again.");
  return sdk.signIn({ clientId, redirectUri, scopes: ["username", "wallet_address"], state });
};

export const reportSoloHostOAuthStartError = (state: string, error: string) => {
  if (window.opener && window.opener !== window) {
    window.opener.postMessage({ source: "smaj-solohost-pi-oauth", state, error }, window.location.origin);
  }
};

export const completeSoloHostOAuthCallback = () => {
  if (!window.opener || !window.location.hash) return false;
  const fragment = new URLSearchParams(window.location.hash.slice(1));
  if (!fragment.has("state")) return false;
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
  const message: OAuthMessage = {
    source: "smaj-solohost-pi-oauth",
    accessToken: fragment.get("access_token") || undefined,
    state: fragment.get("state") || undefined,
    error: fragment.get("error_description") || fragment.get("error") || undefined,
  };
  if (window.opener && window.opener !== window) {
    window.opener.postMessage(message, window.location.origin);
    window.close();
    return true;
  }
  return false;
};

export const authenticateWithSoloHostPi = async (): Promise<AuthResult> => {
  getOAuthConfig();
  const state = randomState();
  sessionStorage.setItem(STATE_KEY, state);

  return new Promise<AuthResult>((resolve, reject) => {
    let popup: Window | null = null;
    let finished = false;
    let verifying = false;
    const finish = (error?: Error, result?: AuthResult) => {
      if (finished) return;
      finished = true;
      window.clearTimeout(timeout);
      window.clearInterval(poll);
      window.removeEventListener("message", onMessage);
      sessionStorage.removeItem(STATE_KEY);
      if (popup && !popup.closed) popup.close();
      if (error) reject(error); else resolve(result!);
    };
    const onMessage = async (event: MessageEvent<OAuthMessage>) => {
      if (event.origin !== window.location.origin || event.source !== popup || event.data?.source !== "smaj-solohost-pi-oauth") return;
      if (!event.data.state || event.data.state !== sessionStorage.getItem(STATE_KEY)) return finish(new Error("Pi OAuth state validation failed."));
      if (event.data.error) return finish(new Error(event.data.error));
      if (!event.data.accessToken) return finish(new Error("Pi did not return an access token."));
      verifying = true;
      try {
        const response = await fetch("https://api.minepi.com/v2/me", { headers: { Authorization: `Bearer ${event.data.accessToken}` } });
        if (!response.ok) throw new Error("Pi could not verify this sign-in.");
        const user = await response.json() as AuthResult["user"];
        if (!user.uid || !user.username) throw new Error("Pi returned an incomplete identity.");
        finish(undefined, { accessToken: event.data.accessToken, user });
      } catch (error) {
        finish(error instanceof Error ? error : new Error("Pi Sign-In failed."));
      }
    };
    const timeout = window.setTimeout(() => finish(new Error("Pi Sign-In timed out.")), 120_000);
    const poll = window.setInterval(() => { if (popup?.closed && !verifying) finish(new Error("Pi Sign-In was closed before completion.")); }, 500);
    window.addEventListener("message", onMessage);
    const startUrl = new URL("/signin/start", window.location.origin);
    startUrl.searchParams.set("state", state);
    popup = window.open(startUrl.toString(), POPUP_NAME, "popup,width=520,height=720");
    if (!popup) finish(new Error("Allow pop-ups to continue with Pi Sign-In."));
  });
};
