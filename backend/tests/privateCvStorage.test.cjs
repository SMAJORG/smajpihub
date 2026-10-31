const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/services/imageStorage.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;
const pdf = 'data:application/pdf;base64,JVBERi0xLjcK';
function load(credentials, fetcher) {
  const exports = {};
  const env = { cloudinary_cloud_name: 'test-cloud', cloudinary_upload_preset: 'test-preset', cloudinary_folder: 'test', ...credentials };
  new Function('require', 'exports', 'fetch', source)(name => name === '../environments' ? { __esModule: true, default: env } : require(name), exports, fetcher);
  return exports;
}

test('private CV uploads reject missing signing credentials before contacting storage', async () => {
  for (const credentials of [{}, { cloudinary_api_key: 'test-key' }, { cloudinary_api_secret: 'test-secret' }]) {
    let calls = 0;
    const storage = load(credentials, async () => { calls++; throw new Error('Must not upload'); });
    await assert.rejects(() => storage.uploadPdfToCloudinary(pdf, 'jobs-private-cv'), error => error.statusCode === 503 && /Protected CV storage/.test(error.message));
    assert.equal(calls, 0);
  }
});

test('configured private CV uploads require signed authenticated delivery', async () => {
  let uploaded;
  const storage = load({ cloudinary_api_key: 'test-key', cloudinary_api_secret: 'test-secret' }, async (_url, options) => {
    uploaded = options.body;
    return { ok: true, json: async () => ({ secure_url: 'https://res.cloudinary.com/test-cloud/raw/authenticated/cv.pdf', public_id: 'cv', type: 'authenticated' }) };
  });
  const result = await storage.uploadPdfToCloudinary(pdf, 'jobs-private-cv');
  assert.equal(result.protectedAsset, true);
  assert.equal(uploaded.get('type'), 'authenticated');
  assert.equal(uploaded.has('upload_preset'), false);
  assert.equal(uploaded.get('api_key'), 'test-key');
  assert.ok(uploaded.get('signature'));
});

test('private CV uploads reject a provider response with public delivery', async () => {
  const storage = load({ cloudinary_api_key: 'test-key', cloudinary_api_secret: 'test-secret' }, async () => ({
    ok: true, json: async () => ({ secure_url: 'https://res.cloudinary.com/test-cloud/raw/upload/cv.pdf', type: 'upload' }),
  }));
  await assert.rejects(() => storage.uploadPdfToCloudinary(pdf, 'jobs-private-cv'), /did not confirm authenticated storage/);
});
