type PiSdk = NonNullable<Window["Pi"]>;
const initialized = new WeakMap<PiSdk, Promise<PiSdk>>();
export const resolvePiSandboxMode = (runtime: unknown, build: unknown, hostname: string, referrer: string) => {
  // An explicitly configured app mode wins over a previous app's referrer.
  for (const value of [runtime, build]) {
    if (value === "true" || value === true) return true;
    if (value === "false" || value === false) return false;
  }
  let fromSandbox = false;
  try { fromSandbox = new URL(referrer).hostname === "sandbox.minepi.com"; } catch { /* No valid referrer. */ }
  return hostname === "sandbox.minepi.com" || fromSandbox;
};
export const isPiSandboxMode = () => resolvePiSandboxMode(window.__ENV?.sandbox, import.meta.env.VITE_SANDBOX_SDK, window.location.hostname, document.referrer);
export const withPiTimeout = <T>(task: PromiseLike<T>, milliseconds: number, message: string): Promise<T> => new Promise((resolve, reject) => {
  const timer = window.setTimeout(() => reject(new Error(message)), milliseconds);
  Promise.resolve(task).then(value => { window.clearTimeout(timer); resolve(value); }, error => { window.clearTimeout(timer); reject(error); });
});
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
