const assert = require('node:assert/strict'), path = require('node:path'), Module = require('node:module'), esbuild = require('esbuild');
async function main() {
  global.__sessionFixture = { native: true, browserToken: '', reads: 0 };
  global.window = { localStorage: { getItem: () => JSON.stringify({ accessToken: global.__sessionFixture.browserToken }) } };
  Object.defineProperty(global, 'navigator', { configurable: true, value: { onLine: true } });
  const result = await esbuild.build({ entryPoints: [path.resolve(__dirname, '../src/lib/axiosClient.ts')], bundle: true, platform: 'node', format: 'cjs', write: false, external: ['axios'], define: { 'import.meta.env': JSON.stringify({ MODE: 'test', VITE_API_BASE_URL: 'http://127.0.0.1:1' }) }, plugins: [{ name: 'isolated-native-session', setup(build) {
    build.onResolve({ filter: /^@capacitor\/core$/ }, () => ({ path: 'core', namespace: 'fixture' }));
    build.onResolve({ filter: /nativeAppLock$/ }, () => ({ path: 'lock', namespace: 'fixture' }));
    build.onResolve({ filter: /offlineCache$/ }, () => ({ path: 'cache', namespace: 'fixture' }));
    build.onResolve({ filter: /feedback$/ }, () => ({ path: 'feedback', namespace: 'fixture' }));
    build.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: args.path === 'core' ? 'export const Capacitor={isNativePlatform:()=>global.__sessionFixture.native}' : args.path === 'lock' ? 'export const getNativeSessionToken=async()=>{global.__sessionFixture.reads++;return "secure-fixture-token"}' : args.path === 'cache' ? 'export const isCacheableApiRead=()=>false;export const buildResponseCacheKey=()=>"";export const readCachedResponse=async()=>null;export const storeCachedResponse=async()=>{}' : 'export const showFeedback=()=>{}', loader: 'js' }));
  } }] });
  const fixture = new Module(__filename); fixture.paths = Module._nodeModulePaths(__dirname); fixture._compile(result.outputFiles[0].text, __filename);
  let headers; const adapter = async config => { headers = config.headers; return { config, status: 200, statusText: 'OK', data: {}, headers: {} }; };
  await fixture.exports.axiosClient.get('/admin/analytics', { adapter });
  assert.equal(headers.get('Authorization'), 'Bearer secure-fixture-token'); assert.equal(headers.get('X-SMAJ-Access-Token'), 'secure-fixture-token'); assert.equal(global.__sessionFixture.reads, 1); assert.equal(global.__sessionFixture.browserToken, '');
  global.__sessionFixture.native = false; global.__sessionFixture.browserToken = 'browser-fixture-token'; await fixture.exports.axiosClient.get('/admin/stats', { adapter });
  assert.equal(headers.get('Authorization'), 'Bearer browser-fixture-token'); assert.equal(global.__sessionFixture.reads, 1, 'Browser requests must not invoke secure native storage');
  console.log('Native secure-token authentication and unchanged browser authentication passed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
