import type { AuthResult } from "../types/pi";

const STATE_KEY = "smaj_solohost_pi_oauth_state";
const POPUP_NAME = "smaj-solohost-pi-signin";
type OAuthMessage = { source: "smaj-solohost-pi-oauth"; accessToken?: string; state?: string; error?: string };

const randomState = () => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, value => value.toString(16).padStart(2, "0")).join("");
};

export const completeSoloHostOAuthCallback = () => {
  if (window.__ENV?.soloHost !== "true" || !window.location.hash) return false;
  const fragment = new URLSearchParams(window.location.hash.slice(1));
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
  const clientId = window.__ENV?.piOAuthClientId?.trim() || "";
  const redirectUri = window.__ENV?.piOAuthRedirectUri?.trim() || "";
  if (!clientId || !redirectUri) throw new Error("Pi Sign-In is not configured for this SoloHost installation.");
  if (new URL(redirectUri).origin !== window.location.origin) throw new Error("The Pi OAuth redirect must use this SoloHost origin.");
  const state = randomState();
  sessionStorage.setItem(STATE_KEY, state);
  const authorizeUrl = new URL("https://accounts.pinet.com/oauth/authorize");
  authorizeUrl.searchParams.set("response_type", "token");
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("scope", "username wallet_address");
  authorizeUrl.searchParams.set("state", state);
  const popup = window.open(authorizeUrl.toString(), POPUP_NAME, "popup,width=520,height=720");
  if (!popup) throw new Error("Allow pop-ups to continue with Pi Sign-In.");

  return new Promise<AuthResult>((resolve, reject) => {
    let finished = false;
    const finish = (error?: Error, result?: AuthResult) => {
      if (finished) return;
      finished = true;
      window.clearTimeout(timeout);
      window.clearInterval(poll);
      window.removeEventListener("message", onMessage);
      sessionStorage.removeItem(STATE_KEY);
      if (!popup.closed) popup.close();
      if (error) reject(error); else resolve(result!);
    };
    const onMessage = async (event: MessageEvent<OAuthMessage>) => {
      if (event.origin !== window.location.origin || event.source !== popup || event.data?.source !== "smaj-solohost-pi-oauth") return;
      if (event.data.error) return finish(new Error(event.data.error));
      if (!event.data.state || event.data.state !== sessionStorage.getItem(STATE_KEY)) return finish(new Error("Pi OAuth state validation failed."));
      if (!event.data.accessToken) return finish(new Error("Pi did not return an access token."));
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
    const poll = window.setInterval(() => { if (popup.closed) finish(new Error("Pi Sign-In was closed before completion.")); }, 500);
    window.addEventListener("message", onMessage);
  });
};
