const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  ts = require("typescript");
function compile(file, modules) {
  const exports = {};
  new Function(
    "exports",
    "require",
    ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText,
  )(exports, (name) => modules[name]);
  return exports;
}
const catalog = compile("frontend/src/content/serviceCatalog.ts", {
  "../lib/siteContent": { getSiteContent: () => ({ services: [] }) },
});
test("every service resolves to its real workspace independently of launch status", () => {
  const routes = {
    store: "/store",
    stream: "/app/services/stream",
    food: "/services/food-delivery",
    token: "/app/services/token/rewards",
  };
  for (const service of catalog.serviceCatalog)
    assert.equal(
      catalog.serviceAppPath(service.slug),
      routes[service.slug] || "/services/" + service.slug,
    );
  assert.equal(catalog.getServiceLaunchStatus("swap"), "in-progress");
  assert.equal(catalog.getServiceLaunchStatus("education"), "coming-soon");
});
test("saved placeholder URLs preserve query, hash and launch warning state", () => {
  for (const slug of [
    ...catalog.serviceCatalog.map((s) => s.slug),
    "food-delivery",
    "missing",
  ]) {
    const state = { inProgressEntry: slug };
    const page = compile(
      "frontend/src/pages/private/ServiceRouteRedirect.tsx",
      {
        react: { useEffect: () => {} },
        "react/jsx-runtime": { jsx: (_, props) => props },
        "react-router-dom": {
          Navigate: () => {},
          useParams: () => ({ slug }),
          useLocation: () => ({
            pathname: "/app/services/" + slug,
            search: "?tab=all",
            hash: "#section",
            state,
          }),
        },
        "../../content/serviceCatalog": catalog,
      },
    ).default;
    const result = page();
    assert.equal(
      result.to,
      (slug === "missing"
        ? "/app/services"
        : catalog.serviceAppPath(slug === "food-delivery" ? "food" : slug)) +
        "?tab=all#section",
    );
    assert.equal(result.state, state);
    assert.equal(result.replace, true);
  }
});
