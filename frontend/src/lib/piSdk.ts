import type { AuthResult, PaymentDTO } from "../types/pi";

type PiSdk = NonNullable<Window["Pi"]>;
const initialized = new WeakMap<PiSdk, Promise<PiSdk>>();
const pendingAuthentication = new WeakMap<PiSdk, Map<string, Promise<AuthResult>>>();
export const isPiSandboxMode = () => {
  if (["public", "capacitor"].includes(import.meta.env.MODE)) return false;
  const sandboxReferrer = (() => { try { return new URL(document.referrer).hostname === "sandbox.minepi.com"; } catch { return false; } })();
  const sandboxFrame = window.location.hostname === "sandbox.minepi.com" || (window.self !== window.top && sandboxReferrer);
  // Sandbox authentication talks to the preview's parent frame. A normal
  // Pi Browser tab must use its native bridge, including for registered Testnet apps.
  if (!sandboxFrame && typeof navigator !== "undefined" && /PiBrowser|Pi Browser/i.test(navigator.userAgent)) return false;
  // The Mainnet domain must not inherit an obsolete Sandbox build setting.
  // A top-level navigation from Sandbox leaves a referrer but is not its preview iframe.
  if (["smajpihub.com", "www.smajpihub.com"].includes(window.location.hostname) && !(window.self !== window.top && sandboxReferrer)) return false;
  const runtime = window.__ENV?.sandbox;
  const setting = runtime && runtime !== "$$SANDBOX_SDK$$" ? runtime : import.meta.env.VITE_SANDBOX_SDK;
  return setting === "true" || sandboxFrame;
};
export const withPiTimeout = <T>(task: PromiseLike<T>, milliseconds: number, message: string): Promise<T> => new Promise((resolve, reject) => {
  const timer = window.setTimeout(() => reject(new Error(message)), milliseconds);
  Promise.resolve(task).then(value => { window.clearTimeout(timer); resolve(value); }, error => { window.clearTimeout(timer); reject(error); });
});
export const authenticatePiWithTimeout = (scopes: string[], milliseconds: number, onIncompletePaymentFound?: (payment: PaymentDTO) => void): Promise<AuthResult> => {
  const sdk = window.Pi;
  if (!sdk) return Promise.reject(new Error("Pi SDK is unavailable."));
  let requests = pendingAuthentication.get(sdk);
  if (!requests) { requests = new Map(); pendingAuthentication.set(sdk, requests); }
  const key = JSON.stringify([...scopes].sort());
  let request = requests.get(key);
  if (!request) {
    request = Promise.resolve().then(() => sdk.authenticate(scopes, onIncompletePaymentFound));
    requests.set(key, request);
    const clear = () => { requests.delete(key); };
    // A timeout cannot cancel Pi's approval dialog. Keep its request until Pi
    // settles it, so Retry waits for that dialog instead of opening another.
    void request.then(clear, clear);
  }
  return withPiTimeout(request, milliseconds, "PI_AUTH_TIMEOUT");
};
export const ensurePiInitialized = (): Promise<PiSdk> => {
  const sdk = window.Pi;
  if (!sdk) return Promise.reject(new Error("Open this page in Pi Browser to continue payment."));
  const existing = initialized.get(sdk);
  if (existing) return existing;
  const ready = withPiTimeout(Promise.resolve().then(() => sdk.init({ version: "2.0", sandbox: isPiSandboxMode() })), 20000, "Pi initialization timed out. Reopen Pi Browser and try again.").then(() => sdk);
  initialized.set(sdk, ready);
  void ready.catch(() => { if (initialized.get(sdk) === ready) initialized.delete(sdk); });
  return ready;
};
