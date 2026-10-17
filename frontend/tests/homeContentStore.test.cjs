const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  ts = require("typescript");
function setup(fetcher) {
  const out = {};
  const source = fs.readFileSync(path.join(__dirname, "../src/lib/siteContent.ts"), "utf8");
  new Function(
    "exports",
    "require",
    "window",
    ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } })
      .outputText
  )(out, name => (name === "react" ? {} : { apiFetch: fetcher }), { setTimeout: () => 1, clearTimeout() {} });
  return out;
}
test("late background responses cannot undo an administrator save", async () => {
  let resolve,
    calls = 0;
  const pending = new Promise(r => (resolve = r));
  const app = setup(() => {
    calls++;
    return pending;
  });
  const first = app.refreshSiteContent(),
    second = app.refreshSiteContent();
  assert.equal(first, second);
  app.publishSiteContent({ services: [{ slug: "store", icon: "/saved.png" }], sections: [] });
  resolve({ ok: true, json: async () => ({ content: { services: [], sections: [] } }) });
  await first;
  assert.equal(calls, 1);
  assert.equal(app.serviceIcon("store", "/default.png"), "/saved.png");
});
test("unavailable content preserves the last successfully loaded branding", async () => {
  const app = setup(async () => ({ ok: false }));
  app.publishSiteContent({ services: [{ slug: "store", icon: "/saved.png" }], sections: [] });
  await assert.rejects(app.refreshSiteContent());
  assert.equal(app.serviceIcon("store", "/default.png"), "/saved.png");
});
