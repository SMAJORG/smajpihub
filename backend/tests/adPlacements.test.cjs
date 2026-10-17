const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const exportsObject = {};
new Function('exports', ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/services/siteContent.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText)(exportsObject);
const parse = ads => exportsObject.parseSiteContent({ services: [], sections: [], ads }).ads;
test('ads default to disabled for existing content', () => {
  assert.equal(parse().enabled, false);
  assert.ok(Object.values(parse().placements).every(value => value === false));
});
test('only explicit boolean switches and registered placements are accepted', () => {
  const result = parse({ enabled: 'true', placements: { homeBanner: true, storeNative: 1, checkout: true }, adUnitId: 'production' });
  assert.equal(result.enabled, false);
  assert.equal(result.placements.homeBanner, true);
  assert.equal(result.placements.storeNative, false);
  assert.equal(result.placements.checkout, undefined);
  assert.equal(result.adUnitId, undefined);
});
test('admins can disable every placement independently', () => {
  const result = parse({ enabled: true, placements: { homeBanner: false, streamNative: true, discoveryReward: true } });
  assert.equal(result.enabled, true);
  assert.equal(result.placements.homeBanner, false);
  assert.equal(result.placements.streamNative, true);
  assert.equal(result.placements.discoveryReward, true);
});
