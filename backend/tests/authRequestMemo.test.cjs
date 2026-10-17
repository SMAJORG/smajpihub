const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  ts = require("typescript"),
  path = require("node:path");
function setup() {
  let user = { uid: "viewer", accessToken: "token" };
  let calls = 0;
  const out = {};
  new Function(
    "exports",
    "require",
    ts.transpileModule(
      fs.readFileSync(path.join(__dirname, "../src/services/auth.ts"), "utf8"),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      },
    ).outputText,
  )(out, (name) =>
    name === "./platformAPIClient"
      ? {
          getUserPlatformAPIClient: () => ({
            get: async (_, config) => {
              calls++;
              assert.equal(config.timeout, 6000);
              return { data: { uid: "viewer" } };
            },
          }),
        }
      : name === "mongodb"
        ? require("mongodb")
        : {},
  );
  return {
    ...out,
    req: () => ({
      session: {},
      get: (header) => (header === "authorization" ? "Bearer token" : ""),
      app: { locals: { userCollection: { findOne: async () => user } } },
    }),
    calls: () => calls,
    revoke: () => {
      user = { ...user, accessTokenRevokedAt: new Date() };
    },
  };
}
test("one HTTP request shares verification while a new request rechecks revocation", async () => {
  const app = setup(),
    req = app.req();
  const first = app.resolveCurrentUser(req),
    second = app.resolveCurrentUser(req);
  assert.equal(first, second);
  assert.equal((await first).uid, "viewer");
  assert.equal(app.calls(), 1);
  app.revoke();
  assert.equal(await app.resolveCurrentUser(app.req()), null);
  assert.equal(app.calls(), 1);
});
