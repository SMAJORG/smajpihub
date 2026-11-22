const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/services/imageStorage.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;

const load = (fetcher) => {
  const exports = {};
  const env = { cloudinary_cloud_name: 'test-cloud', cloudinary_upload_preset: 'test-preset', cloudinary_folder: 'test' };
  new Function('require', 'exports', 'fetch', source)(
    name => name === '../environments' ? { __esModule: true, default: env } : require(name),
    exports,
    fetcher,
  );
  return exports;
};

test('Ambassador identity uploads accept images within the form 5 MB limit', async () => {
  const storage = load(async () => ({
    ok: true,
    json: async () => ({ secure_url: 'https://res.cloudinary.com/test-cloud/image/upload/id.jpg' }),
  }));
  const image = `data:image/jpeg;base64,${'a'.repeat(6_600_000)}`;
  const result = await storage.uploadImageToCloudinary(image, 'ambassador-private-id-front');
  assert.equal(result.storage, 'cloudinary');
});

test('other image uploads retain their existing encoded-size limit', async () => {
  const storage = load(async () => {
    throw new Error('Storage should not be called for oversized images');
  });
  const image = `data:image/jpeg;base64,${'a'.repeat(6_600_000)}`;
  await assert.rejects(
    () => storage.uploadImageToCloudinary(image, 'profile'),
    error => error.statusCode === 413,
  );
});
