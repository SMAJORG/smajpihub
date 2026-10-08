import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const timers = new Map(); let timerId = 0;
globalThis.window = { location: { hostname: 'smajpihub.com' }, setTimeout: (fn, ms) => { const id = ++timerId; timers.set(id, { fn: () => { timers.delete(id); fn(); }, ms }); return id; }, clearTimeout: id => timers.delete(id) };
globalThis.document = { referrer: '' };
const load = (path, dependencies) => {
  const source = fs.readFileSync(new URL(path, import.meta.url), 'utf8').replaceAll('import.meta.env.VITE_SANDBOX_SDK', '"false"');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const exports = {}; new Function('require', 'exports', compiled)(name => dependencies[name], exports); return exports;
};
const sdk = load('../src/lib/piSdk.ts', {});
const states = []; let paymentCallbacks; let completeCount = 0;
const order = { status: 'pending', paymentStatus: 'processing', pricePi: 0.1 };
const deps = {
  '../lib/piSdk': sdk,
  react: { useState: () => [false, value => states.push(value)], useRef: value => ({ current: value }), useCallback: fn => fn },
  '../lib/axiosClient': { axiosClient: { get: async () => ({ data: { order } }), post: async () => { completeCount++; } } },
  '../lib/piBrowserHandoff': { requestPiBrowserHandoff: () => { throw Error('Unexpected handoff'); } },
  '../lib/soloHost': { isPiPaymentAvailable: () => true, isSoloHostRuntime: () => false },
};
const { usePiPayment } = load('../src/hooks/usePiPayment.ts', deps);
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
let initialized = false; let initCalls = 0; let creates = 0; let releaseInit;
window.Pi = {
  init: () => { initCalls++; return new Promise(resolve => { releaseInit = () => { initialized = true; resolve(); }; }); },
  authenticate: async () => { assert(initialized, 'authenticate must wait for init'); },
  createPayment: (_data, callbacks) => { creates++; paymentCallbacks = callbacks; return Promise.resolve(); },
};
const payment = usePiPayment(); const errors = [];
const running = payment.payOrder('order', 0.1, { onError: message => errors.push(message) });
await flush(); assert.equal(creates, 0); releaseInit(); await flush(); assert.equal(creates, 1);
await payment.payOrder('order', 0.1); assert.equal(creates, 1, 'double clicks must not create a second payment');
paymentCallbacks.onCancel('payment'); await running; assert.equal(states.at(-1), false); assert.equal(errors.length, 0);
await sdk.ensurePiInitialized(); assert.equal(initCalls, 1, 'reuse initialized SDK');
const hanging = payment.payOrder('order', 0.1, { onError: message => errors.push(message) }); await flush();
const watchdog = [...timers.values()].find(timer => timer.ms === 180000); assert(watchdog); watchdog.fn(); await hanging;
assert.equal(states.at(-1), false); assert.match(errors.at(-1), /Check Pi Wallet/);
const success = payment.payOrder('order', 0.1); await flush(); await paymentCallbacks.onReadyForServerCompletion('payment', 'tx'); await success; assert.equal(completeCount, 1);
window.Pi = { ...window.Pi, init: async () => {}, authenticate: () => new Promise(() => {}) };
const beforeAuthorization = creates;
const stalledAuthorization = payment.payOrder('order', 0.1, { onError: message => errors.push(message) }); await flush();
const authorizationTimer = [...timers.values()].find(timer => timer.ms === 30000); assert(authorizationTimer); authorizationTimer.fn(); await stalledAuthorization;
assert.equal(creates, beforeAuthorization); assert.equal(states.at(-1), false); assert.match(errors.at(-1), /authorization timed out/);
window.Pi = { ...window.Pi, init: async () => { throw Error('init failed'); } };
await assert.rejects(sdk.ensurePiInitialized(), /init failed/);
window.Pi.init = async () => {}; await sdk.ensurePiInitialized();
assert.equal(timers.size, 0, 'all SDK timeouts must be cleared');
console.log('Pi initialization ordering, restored sessions, double-click prevention, timeout recovery and completion checks passed');
