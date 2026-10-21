const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const ts = require("typescript");

function load(relative, dependencies, globals = {}) {
  const source = fs.readFileSync(path.join(__dirname, "..", relative), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(output, {
    exports,
    require: name => {
      if (!(name in dependencies)) throw new Error(`Unexpected dependency ${name}`);
      return dependencies[name];
    },
    console,
    ...globals,
  });
  return exports;
}

function staffFixture() {
  const storage = new Map();
  let cached = { id: "patient", hospitalId: "hospital-a", role: "hospital_admin" };
  const service = {
    getCurrentStaff: () => cached,
    setCurrentStaff: staff => {
      cached = staff;
    },
  };
  const app = load(
    "src/lib/careRouteStaffSession.ts",
    { "./careRouteService": { careRouteService: service } },
    {
      sessionStorage: {
        getItem: key => storage.get(key) ?? null,
        setItem: (key, value) => storage.set(key, value),
        removeItem: key => storage.delete(key),
      },
      window: { dispatchEvent() {} },
      Event: class {},
    }
  );
  return {
    ...app,
    cached: staff => {
      cached = staff;
    },
  };
}
test("a Pi-derived legacy staff cache does not authorize hospital UI access", () => {
  const app = staffFixture();
  assert.equal(app.getHospitalStaff(), null);
});
test("staff UI access is scoped to the hospital returned at sign-in and cleared at sign-out", () => {
  const app = staffFixture();
  const staff = { id: "staff", hospitalId: "hospital-a" };
  app.setHospitalStaff(staff);
  assert.equal(app.getHospitalStaff(), staff);
  app.cached({ ...staff, hospitalId: "hospital-b" });
  assert.equal(app.getHospitalStaff(), null);
  app.setHospitalStaff(null);
  assert.equal(app.getHospitalStaff(), null);
});

function connectionFixture() {
  let request, success, failure;
  const client = {
    interceptors: {
      request: {
        use: handler => {
          request = handler;
        },
      },
      response: {
        use: (ok, fail) => {
          success = ok;
          failure = fail;
        },
      },
    },
  };
  const navigator = { onLine: true };
  const app = load("src/lib/careRouteConnection.ts", { "./axiosClient": { axiosClient: client } }, { navigator });
  return {
    app: app.careRouteConnection,
    request: config => request(config),
    success: config => success({ config }),
    failure: config => failure({ config }),
    navigator,
  };
}
test("failed writes remain unconfirmed even when a later read succeeds", async () => {
  const fixture = connectionFixture();
  const write = { url: "/careroute/requests/one/status", method: "patch" };
  fixture.request(write);
  assert.equal(fixture.app.getSnapshot().pendingWrites, 1);
  await assert.rejects(Promise.resolve().then(() => fixture.failure(write)));
  fixture.success({ url: "/careroute/requests/one", method: "get" });
  assert.equal(fixture.app.getSnapshot().pendingWrites, 0);
  assert.equal(fixture.app.getSnapshot().failures.length, 1);
  fixture.request(write);
  fixture.success(write);
  assert.equal(fixture.app.getSnapshot().failures.length, 0);
});
test("offline mutations are marked unconfirmed without a pending-write spinner", () => {
  const fixture = connectionFixture();
  fixture.navigator.onLine = false;
  fixture.request({ url: "/careroute/hospital/one/beds", method: "patch" });
  assert.equal(fixture.app.getSnapshot().pendingWrites, 0);
  assert.equal(fixture.app.getSnapshot().failures.length, 1);
  assert.equal(fixture.app.getSnapshot().lastContact, null);
});
test("unrelated API success cannot clear a CareRoute read failure", async () => {
  const fixture = connectionFixture();
  await assert.rejects(
    Promise.resolve().then(() => fixture.failure({ url: "/careroute/requests/one", method: "get" }))
  );
  fixture.success({ url: "/user", method: "get" });
  assert.equal(fixture.app.getSnapshot().lastContact, null);
  assert.equal(fixture.app.getSnapshot().failures.length, 1);
});
test("an empty patient history returned by the server does not resurrect cached requests", async () => {
  const service = load(
    "src/lib/careRouteService.ts",
    {
      "./careRouteConnection": {},
      "./axiosClient": { axiosClient: { get: async () => ({ data: { requests: [] } }) } },
    },
    { localStorage: { getItem: () => JSON.stringify([{ id: "stale", patientPiUsername: "test-user" }]) } }
  ).careRouteService;
  const requests = await service.getPatientRequests("test-user");
  assert.equal(requests.length, 0);
});
