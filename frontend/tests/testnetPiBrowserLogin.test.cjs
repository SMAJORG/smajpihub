const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { transformSync } = require('esbuild');
const vm = require('node:vm');
const source = readFileSync(require.resolve('../src/hooks/useAuth.ts'), 'utf8');
const body = source.split('const loginWithPi = useCallback(async () => {')[1].split('}, [signInUser]);')[0];
const code = transformSync(`module.exports = async () => {${body}}`, {
  loader: 'ts', format: 'cjs', define: { 'import.meta.env.DEV': 'true' },
}).code;

function fixture({ browser = false, embedded = false, disconnected = false, referrer = '', sdk = true, sdkError, backendError } = {}) {
  const calls = { oauth: 0, sdk: 0, backend: 0, dev: 0, feedback: [] };
  const window = { location: { hostname: '127.0.0.1' }, Pi: sdk ? {} : undefined };
  window.self = window;
  window.top = embedded ? {} : window;
  window.parent = disconnected ? window : {};
  const loaded = { exports: {} };
  const noop = () => {};
  vm.runInNewContext(code, {
    module: loaded, testnetPiBrowserOnly: true, window, document: { referrer }, URL,
    navigator: { userAgent: browser ? 'PiBrowser' : 'Chrome' },
    loginInProgressRef: { current: false }, setIsPiLoginPending: noop, setPiLoginStage: noop, setIsLoading: noop,
    setAuthFeedback: value => calls.feedback.push(value), isCapacitorNative: () => false,
    isSoloHostRuntime: () => false, isPiSandboxMode: () => embedded,
    getBaseURL: () => 'https://testnet-api.example',
    axiosClient: { post: async () => { calls.dev++; throw Error('Development login must not run'); } },
    authenticateWithSoloHostPi: async () => { calls.oauth++; },
    ensurePiInitialized: async () => {},
    piAuthScopes: () => ['username', 'wallet_address'],
    authenticateWithTimeout: async () => { calls.sdk++; if (sdkError) throw sdkError; return { accessToken: 'verified-pi-token' }; },
    signInUser: async () => { calls.backend++; if (backendError) throw backendError; }, redirectToDashboard: async () => {},
    waitForPiSdk: async () => {}, isAxiosError: () => false, PiSignInResponseError: class extends Error {}, console: { log: noop, error: noop },
  });
  return { login: loaded.exports, calls };
}

test('Testnet desktop localhost cannot fall back to OAuth or development authentication', async () => {
  for (const referrer of ['', 'https://sandbox.minepi.com/', 'https://sandbox.minepi.com.evil.example/']) {
    const f = fixture({ referrer, sdk: false });
    assert.equal(await f.login(), false);
    assert.equal(f.calls.oauth + f.calls.sdk + f.calls.dev + f.calls.backend, 0);
    assert.match(f.calls.feedback.at(-1).message, /Pi authentication is required/);
  }
});

test('a direct Render page without a Pi host fails immediately instead of waiting for invisible consent', async () => {
  const f = fixture({ browser: true, disconnected: true });
  assert.equal(await f.login(), false);
  assert.equal(f.calls.sdk + f.calls.backend + f.calls.oauth + f.calls.dev, 0);
  assert.match(f.calls.feedback.at(-1).message, /not connected to Pi/);
});

test('Testnet timeout does not claim an approval window appeared', async () => {
  const f = fixture({ browser: true, sdkError: Error('PI_AUTH_TIMEOUT') });
  assert.equal(await f.login(), false);
  assert.match(f.calls.feedback.at(-1).message, /Pi did not respond/);
  assert.equal(f.calls.backend, 0);
});

test('ordinary Pi Browser login does not require payout wallet consent', () => {
  const expression = source.match(/const piAuthScopes = \(\) => (.*);/)[1];
  for (const sandbox of [false, true]) {
    const scopes = vm.runInNewContext(expression, { isPiSandboxMode: () => sandbox });
    assert.deepEqual(Array.from(scopes), sandbox ? ['username', 'wallet_address'] : ['username']);
  }
});

test('Pi rejection and server rejection never become successful login', async () => {
  for (const options of [{ sdkError: Error('User denied') }, { backendError: Error('Account server rejected token') }]) {
    const f = fixture({ browser: true, ...options });
    assert.equal(await f.login(), false);
    assert.equal(f.calls.sdk, 1);
    assert.equal(f.calls.backend, options.sdkError ? 0 : 1);
    assert.equal(f.calls.oauth + f.calls.dev, 0);
    assert.equal(f.calls.feedback.at(-1).type, 'error');
  }
});

test('Pi Browser and an authentic embedded Sandbox use SDK authentication then backend verification', async () => {
  for (const options of [{ browser: true }, { embedded: true, referrer: 'https://sandbox.minepi.com/mobile-app-ui/app/smaj-pi-hub' }]) {
    const f = fixture(options);
    assert.equal(await f.login(), true);
    assert.equal(f.calls.sdk, 1);
    assert.equal(f.calls.backend, 1);
    assert.equal(f.calls.oauth + f.calls.dev, 0);
  }
});

test('a forged Sandbox referrer cannot enable Testnet login', async () => {
  const f = fixture({ embedded: true, referrer: 'https://sandbox.minepi.com.evil.example/' });
  assert.equal(await f.login(), false);
  assert.equal(f.calls.sdk + f.calls.backend, 0);
});
