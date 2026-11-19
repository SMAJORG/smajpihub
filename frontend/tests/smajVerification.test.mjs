import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";
import vm from "node:vm";

const source = readFileSync(new URL("../src/lib/smajVerification.ts", import.meta.url), "utf8");
const compiled = transformSync(source, { loader: "ts", format: "cjs" }).code;

const createHarness = () => {
  const requests = [];
  const windowListeners = new Map();
  const documentListeners = new Map();
  const timeouts = new Map();
  const axiosClient = {
    post: (url, body, config) =>
      new Promise((resolve, reject) => requests.push({ url, body, config, resolve, reject })),
  };
  let nextTimerId = 0;
  const subscriptions = new Set();
  let snapshot;
  let notifications = 0;
  const react = {
    __esModule: true,
    useCallback: callback => callback,
    useEffect: () => undefined,
    useMemo: callback => callback(),
    useState: initial => [typeof initial === "function" ? initial() : initial, () => undefined],
    useSyncExternalStore: (subscribe, getSnapshot) => {
      snapshot = getSnapshot;
      subscriptions.add(subscribe(() => notifications++));
      return getSnapshot();
    },
  };
  const window = {
    addEventListener: (name, listener) => windowListeners.set(name, listener),
    removeEventListener: name => windowListeners.delete(name),
  };
  const document = {
    hidden: false,
    addEventListener: (name, listener) => documentListeners.set(name, listener),
    removeEventListener: name => documentListeners.delete(name),
  };
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    module,
    exports: module.exports,
    require: name => {
      if (name === "react") return react;
      if (name === "./axiosClient") return { axiosClient };
      throw new Error(`Unexpected dependency: ${name}`);
    },
    window,
    document,
    console: { warn: () => undefined },
    setInterval: () => ++nextTimerId,
    clearInterval: () => undefined,
    setTimeout: (callback, delay) => {
      const id = ++nextTimerId;
      timeouts.set(id, { callback, delay });
      return id;
    },
    clearTimeout: id => timeouts.delete(id),
    queueMicrotask,
    Date,
    Map,
    Set,
    Promise,
    Object,
    Array,
  });
  const initial = module.exports.useSmajVerification("account-a");
  return {
    initial,
    api: module.exports,
    requests,
    mount: () => module.exports.useSmajVerification("account-a"),
    notifications: () => notifications,
    value: () => snapshot(),
    focus: () => windowListeners.get("focus")?.(),
    cleanup: () => {
      subscriptions.forEach(unsubscribe => unsubscribe());
      subscriptions.clear();
    },
  };
};

const flush = () => new Promise(resolve => setImmediate(resolve));
const approved = revision => ({
  userId: "database-user-id",
  status: "approved",
  verified: true,
  level: "pi_verified",
  expiresAt: null,
  revision,
});

test("keeps a confirmed badge through background refresh and failures, then applies revocation", async () => {
  const harness = createHarness();
  assert.equal(harness.initial, null);
  await flush();
  assert.equal(harness.requests.length, 1);
  harness.requests[0].resolve({ data: { statuses: { "account-a": approved(1) } } });
  await flush();
  assert.equal(harness.value().status, "approved");
  harness.cleanup();
  assert.equal(harness.mount().status, "approved");
  await flush();
  assert.equal(harness.requests.length, 1);

  harness.focus();
  await flush();
  assert.equal(harness.requests.length, 2);
  assert.equal(harness.value().status, "approved");
  harness.requests[1].resolve({ data: { statuses: {} } });
  await flush();
  assert.equal(harness.value().status, "approved");

  harness.focus();
  await flush();
  assert.equal(harness.requests.length, 3);
  assert.equal(harness.value().status, "approved");
  harness.requests[2].reject(new Error("temporary network failure"));
  await flush();
  assert.equal(harness.value().status, "approved");

  harness.focus();
  await flush();
  assert.equal(harness.requests.length, 4);
  assert.equal(harness.value().status, "approved");
  harness.requests[3].resolve({
    data: { statuses: { "account-a": { ...approved(2), status: "revoked", verified: false } } },
  });
  await flush();
  assert.equal(harness.value().status, "revoked");
  assert.equal(harness.value().verified, false);
  assert.equal(harness.notifications() > 0, true);
  harness.cleanup();
});

test("does not approve expired, stale, pending, or unconfirmed verification data", () => {
  const harness = createHarness();
  const isApproved = harness.api.isSmajVerificationApproved;
  assert.equal(isApproved({ ...approved(1), confirmedAt: Date.now() }), true);
  assert.equal(isApproved({ ...approved(1), confirmedAt: Date.now() - 6 * 60_000 }), false);
  assert.equal(isApproved({ ...approved(1), expiresAt: new Date(Date.now() - 1000).toISOString(), confirmedAt: Date.now() }), false);
  assert.equal(isApproved({ ...approved(1), status: "pending", confirmedAt: Date.now() }), false);
  assert.equal(isApproved({ ...approved(1), verified: false, confirmedAt: Date.now() }), false);
  assert.equal(isApproved({ ...approved(1), userId: null, confirmedAt: Date.now() }), false);
  harness.cleanup();
});
