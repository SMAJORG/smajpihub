const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const source = fs.readFileSync(path.join(__dirname, "../src/lib/appUpdates.ts"), "utf8")
  .replaceAll("import.meta.env.VITE_APP_VERSION", '"1.0.2"')
  .replaceAll("import.meta.env.VITE_APP_BUILD_ID", '"build-old"')
  .replaceAll("import.meta.env.BASE_URL", '"/"');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function setup(data, ok = true) {
  const calls = []; let cleared = 0;
  const exports = {};
  new Function("exports", "window", "fetch", code)(exports,
    { location: { origin: "https://smajpihub.com" }, setTimeout: () => 1, clearTimeout: () => cleared++ },
    async (url, config) => { calls.push({ url, config }); return { ok, json: async () => data }; });
  return { ...exports, calls, cleared: () => cleared };
}
test("web checks compare published build identity, even when the version is unchanged", async () => {
  const app = setup({ version: "1.0.2", buildId: "build-new" });
  assert.equal((await app.checkAppUpdate(false)).available, true);
  assert.equal(app.calls[0].url, "https://smajpihub.com/version.json");
  assert.equal(app.calls[0].config.cache, "no-store");
  assert.equal(app.cleared(), 1);
});
test("current web build reports up to date", async () => {
  assert.equal((await setup({ version: "1.0.2", buildId: "build-old" }).checkAppUpdate(false)).available, false);
});
test("Android compares numeric versions from the published APK release", async () => {
  const app = setup({ body: "Version: 1.0.10\n\nPayment fixes.", assets: [{ name: "SMAJ-PI-HUB.apk" }] });
  const update = await app.checkAppUpdate(true);
  assert.equal(update.available, true); assert.equal(update.native, true);
  assert.equal(update.version, "1.0.10"); assert.equal(update.details, "Payment fixes.");
  assert.match(app.calls[0].url, /releases\/tags\/android-latest$/);
});
test("older and matching Android releases never offer an update", async () => {
  const app = setup({ body: "Version: 1.0.2", assets: [{ name: "SMAJ-PI-HUB.apk" }] });
  assert.equal((await app.checkAppUpdate(true)).available, false);
  assert.equal((await app.checkAppUpdate(true, "1.0.10")).available, false);
});
test("unpublished or failed release checks report failure instead of saying up to date", async () => {
  for (const [data, ok] of [[{}, true], [{ body: "Version: 1.0.10", assets: [] }, true], [{}, false]]) {
    const app = setup(data, ok); await assert.rejects(app.checkAppUpdate(true)); assert.equal(app.cleared(), 1);
  }
  await assert.rejects(setup({}).checkAppUpdate(false), /unavailable/);
});
