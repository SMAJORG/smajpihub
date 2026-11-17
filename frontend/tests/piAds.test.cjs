const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/lib/piAds.ts'), 'utf8').replaceAll('import.meta.env.VITE_PI_ADS_ENABLED', 'window.adsEnabled'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function fixture(options = {}) {
  const calls = [], timers = new Map(), storage = options.storage || new Map(); let clock = 1000000;
  const sdk = {
    nativeFeaturesList: async () => { calls.push('features'); return options.features || ['ad_network']; },
    Ads: {
      isAdReady: async type => { calls.push(['ready', type]); return { type, ready: options.ready !== false }; },
      requestAd: async type => { calls.push(['request', type]); return { type, result: options.request || 'AD_LOADED' }; },
      showAd: async type => { calls.push(['show', type]); return { type, result: options.result || 'AD_CLOSED' }; },
    },
  };
  const window = { adsEnabled: options.enabled === false ? 'false' : 'true', Pi: sdk, location: { pathname: '/dashboard' }, setTimeout: fn => { const id = timers.size + 1; timers.set(id, fn); return id; }, clearTimeout: id => timers.delete(id) };
  const document = { hidden: false, blocked: false, querySelector: () => document.blocked ? {} : null, activeElement: { matches: () => false } };
  const localStorage = { getItem: () => options.consent ? JSON.stringify(options.consent) : null };
  const sessionStorage = { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) };
  const api = {};
  new Function('require', 'exports', 'window', 'document', 'navigator', 'localStorage', 'sessionStorage', 'Date', source)(
    () => ({ ensurePiInitialized: async () => { calls.push('init'); return sdk; } }), api, window, document,
    { userAgent: options.ua || 'PiBrowser/1.0' }, localStorage, sessionStorage, { now: () => clock }
  );
  return { api, sdk, calls, window, document, timers, advance: () => { clock += 120001; } };
}
test('disabled, ordinary browsers and explicit privacy opt-outs make no SDK calls', async () => {
  for (const options of [{ enabled: false }, { ua: 'Chrome' }, { consent: { marketing: false, expiresAt: 2000000 } }]) {
    const f = fixture(options); assert.equal(await f.api.supportsPiAds(), false);
    assert.equal(await f.api.showDashboardPiAd(() => true), 'cancelled'); assert.deepEqual(f.calls, []);
  }
});
test('feature detection is deduplicated and never requests or displays an ad', async () => {
  const f = fixture(); assert.deepEqual(await Promise.all([f.api.supportsPiAds(), f.api.supportsPiAds()]), [true, true]);
  assert.deepEqual(f.calls, ['init', 'features']);
  const old = fixture({ features: [] }); assert.equal(await old.api.showDashboardPiAd(() => true), 'unsupported');
  delete old.sdk.Ads; old.advance(); assert.equal(await old.api.showDashboardPiAd(() => true), 'unsupported');
});
test('uses only official interstitial calls: readiness, one load if necessary, display', async () => {
  for (const ready of [true, false]) {
    const f = fixture({ ready }); assert.equal(await f.api.showDashboardPiAd(() => true), 'closed');
    assert.deepEqual(f.calls, ['init', 'features', ['ready', 'interstitial'], ...(!ready ? [['request', 'interstitial']] : []), ['show', 'interstitial']]);
  }
});
test('unavailable, unsupported and network/display failures do not retry or grant rewards', async () => {
  for (const [result, expected] of [['AD_NOT_AVAILABLE', 'unavailable'], ['ADS_NOT_SUPPORTED', 'unsupported'], ['AD_NETWORK_ERROR', 'error'], ['AD_DISPLAY_ERROR', 'error']]) {
    const f = fixture({ result }); assert.equal(await f.api.showDashboardPiAd(() => true), expected);
    assert.equal(f.calls.filter(c => Array.isArray(c) && c[0] === 'show').length, 1);
  }
  for (const request of ['AD_FAILED_TO_LOAD', 'AD_NOT_AVAILABLE', 'ADS_NOT_SUPPORTED']) {
    const f = fixture({ ready: false, request });
    assert.equal(await f.api.showDashboardPiAd(() => true), request === 'ADS_NOT_SUPPORTED' ? 'unsupported' : 'unavailable');
    assert.equal(f.calls.some(c => Array.isArray(c) && c[0] === 'show'), false);
  }
});
test('global lock blocks duplicate clicks and the frequency cap survives another attempt', async () => {
  const f = fixture(); let finish;
  f.sdk.Ads.showAd = () => new Promise(resolve => { finish = resolve; });
  const first = f.api.showDashboardPiAd(() => true);
  assert.equal(await f.api.showDashboardPiAd(() => true), 'busy');
  for (let i = 0; i < 8; i++) await Promise.resolve();
  finish({ result: 'AD_CLOSED' }); assert.equal(await first, 'closed');
  assert.equal(await f.api.showDashboardPiAd(() => true), 'cooldown');
  assert.equal(f.api.getPiAdState().busy, false);
});
test('navigation, modal, hidden document and logout cancel before display', async () => {
  for (const change of [f => { f.window.location.pathname = '/store'; }, f => { f.document.blocked = true; }, f => { f.document.hidden = true; }]) {
    const f = fixture({ ready: false }); f.sdk.Ads.requestAd = async () => { change(f); return { result: 'AD_LOADED' }; };
    assert.equal(await f.api.showDashboardPiAd(() => true), 'cancelled');
    assert.equal(f.calls.some(c => Array.isArray(c) && c[0] === 'show'), false);
  }
  const f = fixture({ ready: false }); let loggedIn = true;
  f.sdk.Ads.requestAd = async () => { loggedIn = false; return { result: 'AD_LOADED' }; };
  assert.equal(await f.api.showDashboardPiAd(() => loggedIn), 'cancelled');
});
test('watchdog releases UI but retains the native lock until delayed display settles', async () => {
  const f = fixture(); let finish;
  f.sdk.Ads.showAd = () => new Promise(resolve => { finish = resolve; });
  const result = f.api.showDashboardPiAd(() => true);
  for (let i = 0; i < 8; i++) await Promise.resolve();
  [...f.timers.values()][0](); assert.equal(await result, 'timeout');
  f.advance(); assert.equal(await f.api.showDashboardPiAd(() => true), 'busy');
  finish({ result: 'AD_CLOSED' }); for (let i = 0; i < 4; i++) await Promise.resolve();
  assert.equal(f.api.getPiAdState().busy, false);
});
test('SDK exceptions fail gracefully and release the lock', async () => {
  const f = fixture(); f.sdk.Ads.isAdReady = async () => { throw Error('network'); };
  assert.equal(await f.api.showDashboardPiAd(() => true), 'error'); assert.equal(f.api.getPiAdState().busy, false);
});
test('frequency cap persists across module reloads without changing accounts or local profile storage', async () => {
  const storage = new Map(); const first = fixture({ storage });
  assert.equal(await first.api.showDashboardPiAd(() => true), 'closed');
  const reloaded = fixture({ storage });
  assert.equal(await reloaded.api.showDashboardPiAd(() => true), 'cooldown');
  assert.deepEqual(reloaded.calls, []);
});
