const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  ts = require("typescript"),
  React = require("react"),
  { renderToStaticMarkup } = require("react-dom/server");
function setup() {
  let state = { services: [], sections: [] };
  const cache = {};
  function load(relative) {
    if (cache[relative]) return cache[relative];
    const result = {};
    cache[relative] = result;
    const filename = path.join(__dirname, "../src", relative);
    const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText;
    new Function("require", "exports", code)(name => {
      if (name === "react") return React;
      if (name === "react/jsx-runtime") return require(name);
      if (name.includes("lib/siteContent") || name === "../lib/siteContent")
        return { getSiteContent: () => state, useSiteContent: () => state };
      if (name === "react-router-dom")
        return { Link: ({ to, children, ...props }) => React.createElement("a", { ...props, href: to }, children) };
      if (name.startsWith("@mui/")) return () => null;
      if (name.startsWith(".")) {
        const resolved = path.relative(path.join(__dirname, "../src"), path.resolve(path.dirname(filename), name));
        return load(resolved + (fs.existsSync(path.join(__dirname, "../src", resolved + ".tsx")) ? ".tsx" : ".ts"));
      }
      throw Error(name);
    }, result);
    return result;
  }
  return {
    load,
    set: value => {
      state = value;
    },
  };
}
test("one service icon change updates card art and header images and can return to defaults", () => {
  const app = setup(),
    Art = app.load("components/ServiceArt.tsx").default,
    Image = app.load("components/ServiceImage.tsx").default,
    catalog = app.load("content/serviceCatalog.ts");
  assert.match(Art({ index: 0 }).props.style.backgroundImage, /store.png/);
  app.set({
    services: [{ slug: "store", icon: "https://example.com/new-store.png", name: "New Store", status: "in-progress" }],
    sections: [],
  });
  assert.match(Art({ index: 0 }).props.style.backgroundImage, /new-store.png/);
  assert.equal(Image({ slug: "store", src: "/old.png" }).props.src, "https://example.com/new-store.png");
  assert.equal(catalog.serviceCatalog.find(s => s.slug === "store").name, "New Store");
  assert.equal(catalog.getServiceLaunchStatus("store"), "in-progress");
  assert.equal(catalog.serviceCatalog.find(s => s.slug === "store").live, false);
  app.set({ services: [], sections: [] });
  assert.match(Art({ index: 0 }).props.style.backgroundImage, /store.png/);
  assert.equal(Image({ slug: "store", src: "/old.png" }).props.src, "/old.png");
});
test("managed home sections honor reordering, hidden sections, card text, images and team scores", () => {
  const app = setup(),
    defaults = app.load("content/homeContentDefaults.ts").homeSectionDefaults;
  const sections = defaults.map(s => ({ ...s, visible: false }));
  Object.assign(
    sections.find(s => s.id === "sports"),
    {
      visible: true,
      mode: "custom",
      order: 0,
      title: "Edited sports",
      cards: [
        {
          id: "match",
          title: "Final",
          text: "Venue edited",
          image: "https://example.com/field.jpg",
          icon: "https://example.com/icon.png",
          badge: "Finished",
          to: "/services/sports",
          homeName: "Team A",
          awayName: "Team B",
          homeScore: "3",
          awayScore: "2",
          homeIcon: "https://example.com/team.png",
        },
      ],
    }
  );
  Object.assign(
    sections.find(s => s.id === "discover"),
    { visible: true, mode: "custom", order: 10, title: "Edited discovery", cards: [] }
  );
  app.set({ services: [], sections });
  const Feed = app.load("components/ManagedHomeFeed.tsx").default,
    html = renderToStaticMarkup(React.createElement(Feed, { entries: [] }));
  assert.ok(html.indexOf("Edited sports") < html.indexOf("Edited discovery"));
  assert.ok(!html.includes('data-home-section="trending"'));
  for (const text of [
    "Team A",
    "Team B",
    "3",
    "2",
    "Venue edited",
    "https://example.com/field.jpg",
    "https://example.com/team.png",
  ])
    assert.ok(html.includes(text), text);
});
test("suggested service order, live status and progress use the shared configuration", () => {
  const app = setup();
  app.set({
    sections: [],
    services: [
      {
        slug: "store",
        order: 99,
        status: "in-progress",
        progress: 64,
        name: "Custom Store",
        items: ["Edited category"],
      },
      { slug: "jobs", order: 0, status: "live" },
    ],
  });
  const Suggested = app.load("components/ManagedHomeFeed.tsx").SuggestedServices,
    html = renderToStaticMarkup(React.createElement(Suggested));
  assert.ok(html.indexOf("SMAJ Jobs") < html.indexOf("Custom Store"));
  assert.ok(html.includes('value="64"'));
  assert.ok(html.includes("Edited category"));
  assert.ok(html.includes("IN PROGRESS"));
});
