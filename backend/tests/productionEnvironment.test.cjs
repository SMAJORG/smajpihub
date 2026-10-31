const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/environments.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
function resolve(overrides = {}) {
  const exports = {};
  const environment = { NODE_ENV: 'production', SESSION_SECRET: 'isolated-test-secret', PI_API_KEY: 'isolated-test-key', FRONTEND_URL: 'https://example.test', MONGODB_URI: 'mongodb://127.0.0.1:27017/unused', CLOUDINARY_CLOUD_NAME: 'isolated-test-cloud', CLOUDINARY_UPLOAD_PRESET: 'isolated-test-preset', ...overrides };
  new Function('require', 'exports', 'process', 'console', code)(() => ({ config: () => ({}) }), exports, { env: environment }, { warn() {}, error() {} });
  return exports.default;
}
test('Render production retains Testnet default when PI_NETWORK is absent', () => { assert.equal(resolve({ RENDER: 'true' }).pi_network, 'Pi Testnet'); });
test('explicit network selection is retained and whitespace normalized', () => { assert.equal(resolve({ PI_NETWORK: 'Pi Network' }).pi_network, 'Pi Network'); assert.equal(resolve({ PI_NETWORK: ' Pi Testnet ' }).pi_network, 'Pi Testnet'); });
test('invalid explicit production payment network fails closed', () => { assert.throws(() => resolve({ PI_NETWORK: 'invalid-network' }), /PI_NETWORK/); });
test('other required production configuration remains enforced', () => { assert.throws(() => resolve({ SESSION_SECRET: '' }), /SESSION_SECRET/); });

test('Render starts without optional protected CV signing credentials', () => {
  for (const credentials of [{}, { CLOUDINARY_API_KEY: 'test-key' }, { CLOUDINARY_API_SECRET: 'test-secret' }]) {
    const env = resolve({ RENDER: 'true', ...credentials });
    assert.equal(env.is_production, true);
    assert.equal(env.cloudinary_api_key, credentials.CLOUDINARY_API_KEY || '');
    assert.equal(env.cloudinary_api_secret, credentials.CLOUDINARY_API_SECRET || '');
  }
});

test('configured protected CV signing credentials are retained', () => {
  const env = resolve({ CLOUDINARY_API_KEY: 'test-key', CLOUDINARY_API_SECRET: 'test-secret' });
  assert.equal(env.cloudinary_api_key, 'test-key');
  assert.equal(env.cloudinary_api_secret, 'test-secret');
});

test('Render still rejects missing database, session and payment configuration', () => {
  for (const overrides of [{ MONGODB_URI: '' }, { SESSION_SECRET: '' }, { PI_API_KEY: '' }]) {
    assert.throws(() => resolve({ RENDER: 'true', ...overrides }), /Missing or invalid production environment configuration/);
  }
});
