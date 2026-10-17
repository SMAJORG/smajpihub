const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  ts = require("typescript");
function load(file, modules = {}) {
  const out = {};
  new Function(
    "require",
    "exports",
    ts.transpileModule(fs.readFileSync(path.join(__dirname, "../src", file), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    }).outputText
  )(name => modules[name] || {}, out);
  return out;
}
const helpers = load("lib/heroBanners.ts"),
  Action = load("components/HeroBannerAction.tsx", {
    "react/jsx-runtime": require("react/jsx-runtime"),
    "react-router-dom": { Link: "internal-link" },
  }).default;
test("banner destinations preserve app navigation, HTTPS links and explicit button removal", () => {
  assert.equal(helpers.getHeroBannerTarget({ placement: "dashboard" }), "/app/services");
  assert.equal(helpers.getHeroBannerTarget({ placement: "store", search: "Pi books" }), "/store?search=Pi%20books");
  assert.equal(
    helpers.getHeroBannerTarget({ placement: "dashboard", targetUrl: "https://example.com/register" }),
    "https://example.com/register"
  );
  assert.equal(helpers.getHeroBannerTarget({ placement: "dashboard", targetUrl: "" }), "");
  assert.equal(helpers.getHeroBannerButtonText({ placement: "dashboard", buttonText: "" }), "");
  assert.equal(Action({ to: "", children: "Hidden" }), null);
  const external = Action({ to: "HTTPS://example.com/register", children: "Register" });
  assert.equal(external.type, "a");
  assert.equal(external.props.href, "HTTPS://example.com/register");
  assert.match(external.props.rel, /noopener/);
  assert.equal(Action({ to: "/store", children: "Store" }).props.to, "/store");
});
