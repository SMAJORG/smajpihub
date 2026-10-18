const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  ts = require("typescript"),
  React = require("react"),
  { renderToStaticMarkup } = require("react-dom/server");
function compile(file, modules) {
  const output = {};
  new Function(
    "exports",
    "require",
    "document",
    ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText,
  )(output, (name) => modules[name], { body: {} });
  return output;
}
function setup() {
  let location = { pathname: "/", key: "home", state: null },
    confirmed = null;
  const navigations = [],
    status = {
      store: "live",
      jobs: "live",
      education: "coming-soon",
      transport: "in-progress",
      health: "in-progress",
      food: "in-progress",
    };
  const catalog = {
    serviceCatalog: Object.keys(status).map((slug) => ({ slug })),
    getServiceLaunchStatus: (slug) => status[slug],
  };
  const helpers = compile("frontend/src/lib/serviceLaunch.ts", {
    "../content/serviceCatalog": catalog,
  });
  const component = compile("frontend/src/components/ServiceLaunchGate.tsx", {
    "react/jsx-runtime": require("react/jsx-runtime"),
    react: {
      useState: () => [
        confirmed,
        (value) => {
          confirmed = value;
        },
      ],
    },
    "react-dom": { createPortal: (children) => children },
    "react-router-dom": {
      useLocation: () => location,
      useNavigate:
        () =>
        (...args) =>
          navigations.push(args),
    },
    "../lib/siteContent": {
      useSiteContent: () => ({
        services: [{ slug: "health", name: "SMAJ Health" }],
      }),
    },
    "../content/serviceCatalog": catalog,
    "../lib/serviceLaunch": helpers,
    "./ServiceLaunchSplash": { default: () => null },
  }).default;
  const buttons = (node) =>
    !node || typeof node !== "object"
      ? []
      : [
          ...(node.type === "button" ? [node] : []),
          ...React.Children.toArray(node.props?.children).flatMap(buttons),
        ];
  return {
    helpers,
    status,
    navigations,
    open: (pathname, key, state = null) => {
      location = { pathname, key, state };
    },
    render: () => component(),
    click: (tree, label) => {
      const button = buttons(tree).find(
        (item) => item.props.children === label,
      );
      assert.ok(button, label + " button exists");
      button.props.onClick();
    },
    html: () => {
      const tree = component();
      return tree ? renderToStaticMarkup(tree) : "";
    },
  };
}
test("route entries warn even when dashboard links omit navigation state", () => {
  const gate = setup();
  gate.open("/services/transport", "one");
  assert.match(gate.html(), /role="dialog"/);
  assert.match(gate.html(), /SMAJ Transport is still being prepared/);
  gate.open("/app/services/health", "two");
  assert.match(gate.html(), /SMAJ Health/);
  gate.open("/services/food-delivery", "three");
  assert.match(gate.html(), /SMAJ Food/);
});
test("continue dismisses this entry; a new service click requires confirmation again", () => {
  const gate = setup();
  gate.open("/services/transport", "one");
  gate.click(gate.render(), "OK, continue");
  assert.equal(gate.render(), null);
  gate.open("/services/transport/rides", "details");
  assert.equal(gate.render(), null);
  gate.open("/services/transport", "new-entry");
  assert.match(gate.html(), /role="dialog"/);
});
test("cancel returns to the prior page and direct entries have a safe services fallback", () => {
  const gate = setup();
  gate.open("/services/transport", "one");
  gate.click(gate.render(), "Cancel");
  assert.deepEqual(gate.navigations.at(-1), [-1]);
  gate.open("/services/transport", "default");
  gate.click(gate.render(), "Cancel");
  assert.deepEqual(gate.navigations.at(-1), [
    "/app/services",
    { replace: true },
  ]);
});
test("live, coming-soon and ordinary internal pages do not receive progress warnings", () => {
  const gate = setup();
  for (const pathname of [
    "/store",
    "/services/jobs",
    "/services/education",
    "/services/transport/rides",
    "/dashboard",
  ]) {
    gate.open(pathname, pathname);
    assert.equal(gate.render(), null, pathname);
  }
  gate.open("/services/health", "health", { inProgressEntry: "health" });
  gate.status.health = "live";
  assert.equal(
    gate.render(),
    null,
    "Current administrator status overrides stale link state",
  );
});
test("explicit in-progress entries still warn for deep service links", () => {
  const gate = setup();
  gate.open("/services/transport/rides", "deep-entry", {
    inProgressEntry: "transport",
  });
  assert.match(gate.html(), /role="dialog"/);
  assert.deepEqual(gate.helpers.serviceLaunchNavigationState("transport"), {
    inProgressEntry: "transport",
  });
  assert.deepEqual(gate.helpers.serviceLaunchNavigationState("store"), {
    serviceLaunch: "store",
  });
});
