import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
const source = fs.readFileSync(new URL("../src/hooks/useJobsBillingPayment.ts", import.meta.url), "utf8");
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
function setup({ bound = false, fail = false, incomplete = false } = {}) {
  let callbacks,
    creates = 0,
    resumes = 0;
  const intent = { status: "pending_payment", ...(bound ? { paymentId: "p" } : {}) };
  const sdk = {
    authenticate: async (_, found) => {
      if (incomplete) found({ identifier: "existing" });
    },
    createPayment: (_, handlers) => {
      creates++;
      callbacks = handlers;
      return Promise.resolve();
    },
  };
  const states = [],
    errors = [],
    done = [];
  const deps = {
    react: {
      useCallback: fn => fn,
      useRef: value => ({ current: value }),
      useState: () => [false, value => states.push(value)],
    },
    "../lib/jobsApi": {
      approveJobsBillingPayment: async () => {
        intent.paymentId = "p";
      },
      cancelJobsBillingPayment: async () => {},
      completeJobsBillingPayment: async () => {
        if (fail) throw new Error("upstream unavailable");
        return {};
      },
    },
    "../lib/piSdk": { ensurePiInitialized: async () => sdk, withPiTimeout: task => task },
    "../lib/axiosClient": {
      axiosClient: {
        get: async () => ({ data: { intent } }),
        post: async () => {
          resumes++;
          return { data: {} };
        },
      },
    },
    "../lib/piBrowserHandoff": {},
    "../lib/soloHost": { isPiPaymentAvailable: () => true, isSoloHostRuntime: () => false },
  };
  const exports = {};
  new Function("require", "exports", code)(name => deps[name], exports);
  const hook = exports.useJobsBillingPayment();
  return {
    pay: () => hook.payBilling("b", 3, "billing", { onError: e => errors.push(e), onComplete: r => done.push(r) }),
    callbacks: () => callbacks,
    creates: () => creates,
    resumes: () => resumes,
    states,
    errors,
    done,
  };
}
const flush = async () => {
  for (let i = 0; i < 30; i++) await Promise.resolve();
};
globalThis.window = { setTimeout, clearTimeout };
test("Jobs SDK returning early does not unlock checkout or permit duplicate clicks", async () => {
  const h = setup(),
    pending = h.pay();
  await flush();
  assert.equal(h.creates(), 1);
  assert.equal(h.states.at(-1), true);
  await h.pay();
  assert.equal(h.creates(), 1);
  await h.callbacks().onReadyForServerApproval("p");
  await h.callbacks().onReadyForServerCompletion("p", "tx");
  await pending;
  assert.equal(h.done.length, 1);
  assert.equal(h.states.at(-1), false);
});
test("bound billing payment is resumed without opening a new wallet payment", async () => {
  const h = setup({ bound: true });
  await h.pay();
  assert.equal(h.resumes(), 1);
  assert.equal(h.creates(), 0);
});
test("failed completion retries the bound intent rather than creating another transfer", async () => {
  const h = setup({ fail: true }),
    pending = h.pay();
  await flush();
  await h.callbacks().onReadyForServerApproval("p");
  await h.callbacks().onReadyForServerCompletion("p", "tx");
  await pending;
  assert.equal(h.errors.length, 1);
  await h.pay();
  assert.equal(h.creates(), 1);
  assert.equal(h.resumes(), 1);
});
test("incomplete SDK discovery blocks new Jobs wallet creation", async () => {
  const h = setup({ incomplete: true });
  await h.pay();
  assert.equal(h.creates(), 0);
  assert.match(h.errors[0], /existing payment/);
});
