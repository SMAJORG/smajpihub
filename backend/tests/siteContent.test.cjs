const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  ts = require("typescript"),
  path = require("node:path");
function load(file, modules = {}) {
  const out = {};
  new Function(
    "require",
    "exports",
    ts.transpileModule(
      fs.readFileSync(path.join(__dirname, "../src", file), "utf8"),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          esModuleInterop: true,
          target: ts.ScriptTarget.ES2022,
        },
      },
    ).outputText,
  )((name) => modules[name] || {}, out);
  return out;
}
const { parseSiteContent } = load("services/siteContent.ts");
const payload = () => ({
  services: [
    {
      slug: "store",
      name: "My Store",
      experience: "Shop",
      description: "A store",
      items: ["Products"],
      icon: "https://example.com/store.png",
      status: "in-progress",
      progress: 45,
      order: 2,
    },
  ],
  sections: [
    {
      id: "sports",
      title: "My sports",
      subtitle: "Edited",
      to: "/services/sports",
      order: 0,
      visible: true,
      mode: "custom",
      cards: [
        {
          id: "match",
          title: "Final",
          text: "Match notes",
          image: "/assets/sports.png",
          icon: "",
          to: "/services/sports",
          badge: "Full time",
          homeName: "Home",
          awayName: "Away",
          homeScore: "4",
          awayScore: "1",
          homeIcon: "https://example.com/home.png",
          awayIcon: "",
          competition: "League",
        },
      ],
    },
  ],
});
test("persists editable shared branding, progress, order and all sports card data", () => {
  const input = payload(),
    result = parseSiteContent(input);
  assert.equal(result.services[0].progress, 45);
  assert.equal(result.services[0].icon, input.services[0].icon);
  assert.equal(result.sections[0].cards[0].homeScore, "4");
  assert.equal(result.sections[0].cards[0].homeName, "Home");
  input.sections[0].visible = false;
  assert.equal(result.sections[0].visible, true);
  input.sections[0].cards[0].title = "";
  assert.equal(parseSiteContent(input).sections[0].cards[0].title, "");
});
test("rejects unsafe links, duplicate IDs, invalid statuses and unknown services", () => {
  for (const mutate of [
    (p) => (p.services[0].icon = "javascript:alert(1)"),
    (p) => (p.sections[0].cards[0].to = "//evil.test"),
    (p) => (p.services[0].status = "fake"),
    (p) => (p.services[0].slug = "unknown"),
    (p) => p.sections.push(p.sections[0]),
    (p) => p.sections[0].cards.push(p.sections[0].cards[0]),
    (p) => (p.sections[0].cards[0].image = "http://insecure.test/image.png"),
  ]) {
    const p = payload();
    mutate(p);
    assert.throws(() => parseSiteContent(p));
  }
});
test("admin writes require current revision and do not overwrite concurrent changes", async () => {
  let stored = null;
  const routes = new Map(),
    middleware = [];
  const col = {
    findOne: async () => stored,
    insertOne: async (row) => {
      stored = row;
    },
    updateOne: async (filter, updates) => {
      if (stored.updatedAt !== filter.updatedAt) return { matchedCount: 0 };
      stored = { ...stored, ...updates.$set };
      return { matchedCount: 1 };
    },
  };
  const router = { use: (fn) => middleware.push(fn) };
  for (const method of ["get", "post", "put", "patch", "delete"])
    router[method] = (route, fn) => routes.set(method + " " + route, fn);
  load("handlers/admin.ts", {
    "../services/siteContent": { parseSiteContent },
    "../services/auth": { resolveCurrentUser: async (req) => req.testUser },
    "../environments": { admin_pi_usernames: [] },
  }).default(router);
  async function request(route, body, user = { _id: "admin", role: "admin" }) {
    let status = 200,
      data;
    const req = {
      testUser: user,
      body,
      app: { locals: { siteContentCollection: col } },
      session: {},
    };
    const res = {
      headersSent: false,
      setHeader() {},
      status(n) {
        status = n;
        return this;
      },
      json(v) {
        data = v;
        return this;
      },
    };
    let authorized = false;
    await middleware[1](req, res, () => {
      authorized = true;
    });
    if (authorized) await routes.get(route)(req, res);
    return { status, data };
  }
  assert.equal(
    (await request("put /site-content", { content: payload() }, null)).status,
    401,
  );
  assert.equal(
    (
      await request(
        "put /site-content",
        { content: payload() },
        { _id: "user", role: "buyer" },
      )
    ).status,
    403,
  );
  const first = await request("put /site-content", {
    content: payload(),
    revision: null,
  });
  assert.equal(first.status, 200);
  const stale = await request("put /site-content", {
    content: payload(),
    revision: null,
  });
  assert.equal(stale.status, 409);
  const updated = payload();
  updated.services[0].name = "Updated globally";
  assert.equal(
    (
      await request("put /site-content", {
        content: updated,
        revision: first.data.revision.toISOString(),
      })
    ).status,
    200,
  );
  assert.equal(
    (await request("get /site-content")).data.content.services[0].name,
    "Updated globally",
  );
});
