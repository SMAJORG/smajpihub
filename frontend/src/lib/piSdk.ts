type PiSdk = NonNullable<Window["Pi"]>;
const initialized = new WeakMap<PiSdk, Promise<PiSdk>>();
export const isPiSandboxMode = () => {
  const runtime = window.__ENV?.sandbox;
  const setting = runtime && runtime !== "$$SANDBOX_SDK$$" ? runtime : import.meta.env.VITE_SANDBOX_SDK;
  return setting === "true" || window.location.hostname === "sandbox.minepi.com" || document.referrer.includes("sandbox.minepi.com");
};
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
