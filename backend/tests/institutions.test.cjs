const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const { ObjectId } = require("mongodb");
const root = path.resolve(__dirname, "../src");
const profile = {
  name: "Example Learning Center",
  country: "Nigeria",
  institutionType: "learning_center",
  deliveryMode: "hybrid",
  description: "A real education provider profile.",
  email: "office@example.com",
  languages: ["English"],
  subjects: ["Coding"],
  categories: ["Technology"],
};
function setup() {
  const env = {
      pi_payments_enabled: true,
      cloudinary_cloud_name: "test-cloud",
    },
    cache = new Map(),
    requests = [];
  const pi = {
    remote: {},
    get: async () => ({ data: pi.remote }),
    post: async (...args) => {
      requests.push(args);
      return { data: {} };
    },
  };
  function load(file) {
    file = path.resolve(file);
    if (cache.has(file)) return cache.get(file);
    const module = { exports: {} };
    cache.set(file, module.exports);
    const code = ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText;
    vm.runInThisContext("(function(require,module,exports){" + code + "\n})", {
      filename: file,
    })(
      (name) => {
        if (name.endsWith("/environments"))
          return { __esModule: true, default: env };
        if (name.endsWith("/services/auth"))
          return { resolveCurrentUser: async (req) => req.user };
        if (name.endsWith("/services/platformAPIClient"))
          return { platformAPIKeyClient: pi };
        if (name.endsWith("/services/notifications"))
          return { createNotification: async () => {} };
        if (name.startsWith("."))
          return load(path.resolve(path.dirname(file), name + ".ts"));
        return require(name);
      },
      module,
      module.exports,
    );
    cache.set(file, module.exports);
    return module.exports;
  }
  const locals = load(
    path.join(root, "services/memoryDatabase.ts"),
  ).createMemoryCollections();
  const routes = new Map(),
    router = Object.fromEntries(
      ["get", "post", "patch", "delete"].map((method) => [
        method,
        (route, handler) => routes.set(method + " " + route, handler),
      ]),
    );
  router.use = () => {};
  load(path.join(root, "handlers/institutions.ts")).default(router);
  load(path.join(root, "handlers/courses.ts")).default(router);
  const user = {
      _id: new ObjectId(),
      uid: "pi-learner",
      username: "Learner",
      displayName: "Learner",
      role: "buyer",
      roles: [],
    },
    admin = { ...user, _id: new ObjectId(), uid: "pi-admin", role: "admin" },
    manager = { ...user, _id: new ObjectId(), uid: "pi-manager" };
  async function call(method, route, options = {}) {
    let result;
    const res = {
      code: 200,
      headersSent: false,
      status(code) {
        this.code = code;
        return this;
      },
      json(body) {
        result = { status: this.code, body };
        this.headersSent = true;
        return this;
      },
    };
    const req = {
      app: { locals },
      user,
      params: {},
      query: {},
      body: {},
      protocol: "https",
      get: () => "example.com",
      ...options,
    };
    assert.ok(routes.has(method + " " + route), route);
    await routes.get(method + " " + route)(req, res);
    return result;
  }
  async function seed(partner = true) {
    const institution = {
      _id: new ObjectId(),
      ...profile,
      slug: "example",
      status: "active",
      partnerStatus: partner ? "smaj_verified_partner" : "directory",
      verificationStatus: partner ? "verified" : "unverified",
      capabilities: { apply: true, enroll: true, certificates: true },
      piPaymentsEnabled: true,
    };
    await locals.institutionCollection.insertOne(institution);
    await locals.userCollection.insertMany([user, admin, manager]);
    await locals.institutionAdminCollection.insertOne({
      institutionId: String(institution._id),
      userId: String(manager._id),
      status: "active",
    });
    const program = {
      _id: new ObjectId(),
      institutionId: String(institution._id),
      name: "Coding Program",
      status: "approved",
      enrollmentEnabled: true,
      certificateEnabled: true,
      piPaymentsEnabled: true,
      pricePi: 2,
      priceUsdt: 628318,
      courseIds: [],
      learningUrl: "https://learning.example.com",
      learningInstructions: "Join your course.",
    };
    await locals.institutionProgramCollection.insertOne(program);
    return {
      institution,
      program,
      params: {
        institutionId: String(institution._id),
        programId: String(program._id),
      },
    };
  }
  return {
    env,
    pi,
    requests,
    locals,
    call,
    seed,
    user,
    manager,
    admin,
    helpers: load(path.join(root, "services/institutions.ts")),
  };
}
test("directory listings mask partner capabilities and cannot enroll/apply", async () => {
  const app = setup(),
    { params } = await app.seed(false);
  const page = await app.call("get", "/institutions/:institutionId", {
    params,
  });
  assert.equal(page.body.institution.partnerBadge, "NOT YET A SMAJ PARTNER");
  assert.equal(page.body.institution.capabilities.enroll, false);
  assert.equal(page.body.institution.piPaymentsEnabled, false);
  assert.equal(page.body.programs[0].learningUrl, undefined);
  assert.equal(
    (
      await app.call(
        "post",
        "/institutions/:institutionId/programs/:programId/enroll",
        { params },
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await app.call("post", "/institutions/:institutionId/apply", {
        params,
        body: { statement: "I would like to apply." },
      })
    ).status,
    403,
  );
});
test("anonymous and ordinary users cannot access institution management or SMAJ review", async () => {
  const app = setup(),
    { params } = await app.seed();
  assert.equal(
    (
      await app.call("get", "/institution-portal/:institutionId", {
        params,
        user: null,
      })
    ).status,
    401,
  );
  assert.equal(
    (await app.call("get", "/institution-portal/:institutionId", { params }))
      .status,
    403,
  );
  assert.equal((await app.call("get", "/admin/institutions")).status, 403);
  assert.equal(
    (
      await app.call(
        "patch",
        "/admin/institution-applications/:applicationId",
        {
          params: { applicationId: String(new ObjectId()) },
          body: { status: "approved" },
        },
      )
    ).status,
    403,
  );
});
test("portal records and mutations are scoped to the managed institution", async () => {
  const app = setup(),
    { params } = await app.seed();
  const foreign = String(new ObjectId());
  await app.locals.enrollmentCollection.insertMany([
    { institutionId: params.institutionId, user_id: "own", status: "active" },
    { institutionId: foreign, user_id: "foreign", status: "active" },
  ]);
  const row =
    await app.locals.institutionStudentApplicationCollection.insertOne({
      institutionId: foreign,
      status: "submitted",
    });
  const portal = await app.call("get", "/institution-portal/:institutionId", {
    params,
    user: app.manager,
  });
  assert.equal(portal.body.enrollments.length, 1);
  assert.equal(portal.body.enrollments[0].user_id, "own");
  assert.equal(
    (
      await app.call(
        "patch",
        "/institution-portal/:institutionId/applications/:applicationId",
        {
          params: { ...params, applicationId: String(row.insertedId) },
          user: app.manager,
          body: { status: "accepted" },
        },
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await app.call("get", "/institution-portal/:institutionId", {
        params: { institutionId: foreign },
        user: app.manager,
      })
    ).status,
    403,
  );
});
test("institution managers cannot change verification or Pi configuration through profile edits", async () => {
  const app = setup(),
    { params, institution } = await app.seed();
  await app.call("patch", "/institution-portal/:institutionId/profile", {
    params,
    user: app.manager,
    body: {
      name: "Updated Center",
      partnerStatus: "directory",
      status: "suspended",
      piPaymentsEnabled: false,
      capabilities: { enroll: false },
    },
  });
  const saved = await app.locals.institutionCollection.findOne({
    _id: institution._id,
  });
  assert.equal(saved.name, "Updated Center");
  assert.equal(saved.partnerStatus, "smaj_verified_partner");
  assert.equal(saved.status, "active");
  assert.equal(saved.piPaymentsEnabled, true);
});
test("partial drafts can be saved; submitted applications require owned uploaded evidence and never self-approve", async () => {
  const app = setup();
  const draft = await app.call("post", "/institution-applications", {
    body: {
      status: "draft",
      profile: { institutionType: "online_academy", deliveryMode: "online" },
    },
  });
  assert.equal(draft.status, 201);
  let body = {
    status: "approved",
    profile,
    applicantName: "Applicant",
    applicantRole: "Director",
    evidenceUrl:
      "https://res.cloudinary.com/test-cloud/raw/upload/evidence.pdf",
    piPaymentInterest: true,
  };
  assert.equal(
    (await app.call("post", "/institution-applications", { body })).status,
    400,
  );
  await app.locals.institutionEvidenceCollection.insertOne({
    userId: String(app.user._id),
    url: body.evidenceUrl,
  });
  const submitted = await app.call("post", "/institution-applications", {
    body,
  });
  assert.equal(submitted.status, 201);
  assert.equal(submitted.body.application.status, "submitted");
  assert.equal(await app.locals.institutionCollection.countDocuments(), 0);
  body = { ...body, evidenceUrl: "javascript:alert(1)" };
  assert.equal(
    (await app.call("post", "/institution-applications", { body })).status,
    400,
  );
  body = {
    ...body,
    evidenceUrl: "https://res.cloudinary.com/test-cloud/raw/upload/file.exe",
  };
  assert.equal(
    (await app.call("post", "/institution-applications", { body })).status,
    400,
  );
});
test("concurrent SMAJ approval creates one institution and grants no automatic payment capabilities", async () => {
  const app = setup(),
    row = await app.locals.institutionApplicationCollection.insertOne({
      profile,
      applicantId: String(app.user._id),
      status: "submitted",
      evidenceUrl:
        "https://res.cloudinary.com/test-cloud/raw/upload/evidence.pdf",
    });
  const options = {
    user: app.admin,
    params: { applicationId: String(row.insertedId) },
    body: { status: "approved" },
  };
  const results = await Promise.all([
    app.call(
      "patch",
      "/admin/institution-applications/:applicationId",
      options,
    ),
    app.call(
      "patch",
      "/admin/institution-applications/:applicationId",
      options,
    ),
  ]);
  assert.equal(results.filter((r) => r.status === 200).length, 1);
  assert.equal(await app.locals.institutionCollection.countDocuments(), 1);
  const institution = await app.locals.institutionCollection.findOne({});
  assert.equal(institution.piPaymentsEnabled, false);
  assert.equal(institution.capabilities.enroll, false);
  assert.equal(institution.partnerStatus, "smaj_verified_partner");
});
test("programs cannot reference another institution course or be approved by a manager", async () => {
  const app = setup(),
    { params } = await app.seed(),
    course = await app.locals.courseCollection.insertOne({
      institutionId: String(new ObjectId()),
    });
  const body = {
    name: "Program",
    priceUsdt: 10,
    courseIds: [String(course.insertedId)],
    status: "approved",
    piPaymentsEnabled: true,
  };
  assert.equal(
    (
      await app.call("post", "/institution-portal/:institutionId/programs", {
        params,
        user: app.manager,
        body,
      })
    ).status,
    400,
  );
  const saved = await app.call(
    "post",
    "/institution-portal/:institutionId/programs",
    {
      params: { institutionId: params.institutionId },
      user: app.manager,
      body: { ...body, courseIds: [] },
    },
  );
  assert.equal(saved.body.program.status, "draft");
  assert.equal(saved.body.program.piPaymentsEnabled, false);
  assert.equal(saved.body.program.pricePi, 10 / 314159);
});
test("paid program enrollment is idempotent and ignores client payment/completion flags", async () => {
  const app = setup(),
    { params } = await app.seed(),
    body = { status: "completed", amount_pi: 0, paymentStatus: "paid" };
  const results = await Promise.all([
    app.call(
      "post",
      "/institutions/:institutionId/programs/:programId/enroll",
      { params, body },
    ),
    app.call(
      "post",
      "/institutions/:institutionId/programs/:programId/enroll",
      { params, body },
    ),
  ]);
  assert.equal(await app.locals.enrollmentCollection.countDocuments(), 1);
  assert.equal(await app.locals.coursePaymentCollection.countDocuments(), 1);
  for (const r of results) {
    assert.equal(r.body.enrollment.status, "pending_payment");
    assert.equal(r.body.payment.amount_pi, 2);
    assert.equal(r.body.payment.status, "pending");
  }
  const learning = await app.call("get", "/institution-learning");
  assert.equal(learning.body.enrollments[0].learningUrl, "");
});
test("Pi-disabled deployment and unapproved offerings block paid enrollment", async () => {
  const app = setup(),
    { params, program } = await app.seed();
  app.env.pi_payments_enabled = false;
  assert.equal(
    (
      await app.call(
        "post",
        "/institutions/:institutionId/programs/:programId/enroll",
        { params },
      )
    ).status,
    400,
  );
  app.env.pi_payments_enabled = true;
  await app.locals.institutionProgramCollection.updateOne(
    { _id: program._id },
    { $set: { status: "draft" } },
  );
  assert.equal(
    (
      await app.call(
        "post",
        "/institutions/:institutionId/programs/:programId/enroll",
        { params },
      )
    ).status,
    403,
  );
  assert.equal(await app.locals.coursePaymentCollection.countDocuments(), 0);
});
test("Pi approval rejects mismatched payer, amount, or metadata before contacting approval", async () => {
  for (const mismatch of ["payer", "amount", "metadata"]) {
    const app = setup(),
      { params } = await app.seed(),
      enrolled = await app.call(
        "post",
        "/institutions/:institutionId/programs/:programId/enroll",
        { params },
      );
    app.pi.remote = {
      user_uid: app.user.uid,
      amount: 2,
      metadata: { coursePaymentId: enrolled.body.payment.id },
      status: {},
    };
    if (mismatch === "payer") app.pi.remote.user_uid = "other";
    if (mismatch === "amount") app.pi.remote.amount = 1;
    if (mismatch === "metadata")
      app.pi.remote.metadata.coursePaymentId = "other";
    assert.equal(
      (
        await app.call("post", "/courses/payments/:paymentId/approve", {
          params: { paymentId: enrolled.body.payment.id },
          body: { pi_payment_identifier: "pi-payment" },
        })
      ).status,
      400,
    );
    assert.equal(app.requests.length, 0);
  }
});
test("confirmed Pi completion activates enrollment and program courses; repeat completion preserves completed enrollment", async () => {
  const app = setup(),
    { params, program } = await app.seed(),
    course = await app.locals.courseCollection.insertOne({
      institutionId: params.institutionId,
      status: "published",
      title: "Included Course",
      slug: "included",
      modules: [],
    });
  await app.locals.institutionProgramCollection.updateOne(
    { _id: program._id },
    { $set: { courseIds: [String(course.insertedId)] } },
  );
  const enrolled = await app.call(
      "post",
      "/institutions/:institutionId/programs/:programId/enroll",
      { params },
    ),
    paymentId = enrolled.body.payment.id;
  app.pi.remote = {
    user_uid: app.user.uid,
    amount: 2,
    metadata: { coursePaymentId: paymentId },
    status: {},
    transaction: { txid: "transaction", verified: true },
  };
  assert.equal(
    (
      await app.call("post", "/courses/payments/:paymentId/approve", {
        params: { paymentId },
        body: { pi_payment_identifier: "pi-payment" },
      })
    ).status,
    200,
  );
  app.pi.remote.transaction.txid = "wrong";
  assert.equal(
    (
      await app.call("post", "/courses/payments/:paymentId/complete", {
        params: { paymentId },
        body: { txid: "transaction" },
      })
    ).status,
    400,
  );
  app.pi.remote.transaction.txid = "transaction";
  assert.equal(
    (
      await app.call("post", "/courses/payments/:paymentId/complete", {
        params: { paymentId },
        body: { txid: "transaction" },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await app.locals.enrollmentCollection.findOne({
        programId: params.programId,
      })
    ).status,
    "active",
  );
  assert.equal(
    (
      await app.locals.enrollmentCollection.findOne({
        course_id: String(course.insertedId),
      })
    ).status,
    "active",
  );
  await app.locals.enrollmentCollection.updateOne(
    { programId: params.programId },
    { $set: { status: "completed" } },
  );
  await app.call("post", "/courses/payments/:paymentId/complete", {
    params: { paymentId },
    body: { txid: "transaction" },
  });
  assert.equal(
    (
      await app.locals.enrollmentCollection.findOne({
        programId: params.programId,
      })
    ).status,
    "completed",
  );
});
test("students cannot confirm completion or issue certificates; authorized issue is idempotent", async () => {
  const app = setup(),
    { params, program } = await app.seed();
  await app.locals.institutionProgramCollection.updateOne(
    { _id: program._id },
    { $set: { pricePi: 0, priceUsdt: 0 } },
  );
  const enrolled = await app.call(
      "post",
      "/institutions/:institutionId/programs/:programId/enroll",
      { params },
    ),
    paramsWithEnrollment = {
      ...params,
      enrollmentId: enrolled.body.enrollment.id,
    };
  assert.equal(
    (
      await app.call(
        "patch",
        "/institution-portal/:institutionId/enrollments/:enrollmentId",
        { params: paramsWithEnrollment, body: { status: "completed" } },
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await app.call(
        "post",
        "/institution-portal/:institutionId/enrollments/:enrollmentId/certificate",
        { params: paramsWithEnrollment, user: app.manager },
      )
    ).status,
    400,
  );
  await app.call(
    "patch",
    "/institution-portal/:institutionId/enrollments/:enrollmentId",
    {
      params: paramsWithEnrollment,
      user: app.manager,
      body: { status: "completed" },
    },
  );
  const issued = await app.call(
    "post",
    "/institution-portal/:institutionId/enrollments/:enrollmentId/certificate",
    { params: paramsWithEnrollment, user: app.manager },
  );
  assert.equal(issued.status, 201);
  await app.call(
    "post",
    "/institution-portal/:institutionId/enrollments/:enrollmentId/certificate",
    { params: paramsWithEnrollment, user: app.manager },
  );
  assert.equal(await app.locals.certificateCollection.countDocuments(), 1);
  assert.equal(
    (
      await app.call(
        "patch",
        "/admin/institution-certificates/:certificateId",
        {
          params: { certificateId: issued.body.certificate.id },
          body: { status: "revoked" },
        },
      )
    ).status,
    403,
  );
});
test("suspension retains history while disabling enrollment, portal and learning access", async () => {
  const app = setup(),
    { params, program, institution } = await app.seed();
  await app.locals.institutionProgramCollection.updateOne(
    { _id: program._id },
    { $set: { pricePi: 0 } },
  );
  await app.call(
    "post",
    "/institutions/:institutionId/programs/:programId/enroll",
    { params },
  );
  await app.call("patch", "/admin/institutions/:institutionId", {
    params,
    user: app.admin,
    body: { status: "suspended" },
  });
  assert.equal(
    (
      await app.call("get", "/institution-portal/:institutionId", {
        params,
        user: app.manager,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await app.call(
        "post",
        "/institutions/:institutionId/programs/:programId/enroll",
        { params },
      )
    ).status,
    403,
  );
  assert.equal(
    (await app.call("get", "/institution-learning")).body.enrollments[0]
      .learningUrl,
    "",
  );
  assert.equal(await app.locals.enrollmentCollection.countDocuments(), 1);
  assert.ok(
    await app.locals.institutionCollection.findOne({ _id: institution._id }),
  );
});
test("directory filters handle combined search, country, language, subject and partner status", async () => {
  const app = setup();
  await app.seed();
  await app.locals.institutionCollection.insertOne({
    ...profile,
    _id: new ObjectId(),
    name: "Unrelated",
    country: "Ghana",
    status: "active",
    partnerStatus: "directory",
    verificationStatus: "unverified",
  });
  const result = await app.call("get", "/institutions", {
    query: {
      q: "Example",
      country: "Nigeria",
      languages: "English",
      subjects: "Coding",
      partnerStatus: "smaj_verified_partner",
    },
  });
  assert.equal(result.body.total, 1);
  assert.equal(result.body.institutions[0].name, profile.name);
  assert.equal(
    (await app.call("get", "/institutions", { query: { q: "[.*" } })).body
      .total,
    0,
  );
});
test("institution course content remains private until active enrollment and published courses require renewed review after edits", async () => {
  const app = setup(),
    { params } = await app.seed(),
    result = await app.locals.courseCollection.insertOne({
      institutionId: params.institutionId,
      instructor_id: String(app.manager._id),
      status: "published",
      title: "Private Course",
      slug: "private",
      price_usdt: 0,
      price_pi: 0,
      course_type: "free",
      modules: [
        {
          title: "Module",
          lessons: [
            {
              title: "Lesson",
              content: "PRIVATE CONTENT",
              video_url: "https://video.example.com",
              preview: false,
            },
          ],
        },
      ],
    });
  const courseId = String(result.insertedId);
  const publicPage = await app.call("get", "/courses/:idOrSlug", {
    params: { idOrSlug: courseId },
    user: null,
  });
  assert.equal(publicPage.body.course.modules[0].lessons[0].content, "");
  await app.locals.enrollmentCollection.insertOne({
    user_id: String(app.user._id),
    institutionId: params.institutionId,
    course_id: courseId,
    status: "active",
  });
  assert.equal(
    (
      await app.call("get", "/courses/:idOrSlug", {
        params: { idOrSlug: courseId },
      })
    ).body.course.modules[0].lessons[0].content,
    "PRIVATE CONTENT",
  );
  const edited = await app.call("patch", "/courses/:idOrSlug", {
    params: { idOrSlug: courseId },
    user: app.manager,
    body: { description: "Updated course description", status: "published" },
  });
  assert.equal(edited.status, 200);
  assert.equal(edited.body.course.status, "draft");
  assert.equal(edited.body.course.piPaymentsEnabled, false);
  assert.equal(
    (
      await app.call("get", "/courses/:idOrSlug", {
        params: { idOrSlug: courseId },
        user: null,
      })
    ).status,
    404,
  );
});
