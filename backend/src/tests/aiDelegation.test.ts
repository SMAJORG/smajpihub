import assert from "node:assert/strict";
import express from "express";
import { createHmac } from "crypto";
import { ObjectId } from "mongodb";
import mountAiDelegationEndpoints from "../handlers/aiDelegation";

async function main() {
  const previous = { ...process.env };
  process.env.SMAJ_AI_DELEGATION_SECRET = "test-only-independent-delegation-secret-32-characters";
  process.env.SMAJ_PRODUCTION_WRITES_ENABLED = "true";
  const user = { _id: new ObjectId(), uid: "test-pi-owner", avatar: "https://cdn.example/avatar.png" };
  const employer = { _id: new ObjectId(), uid: "test-employer" };
  const product = { _id: new ObjectId(), title: "Real product fixture" };
  const applications: any[] = [], favorites: any[] = [];
  const audits: any[] = [], notifications: any[] = [];
  let profile: any = { title: "Engineer", skills: ["TypeScript"], location: "Lagos", summary: "Build reliable services.", cv: { url: "https://private.example/cv.pdf", name: "Engineer CV.pdf", size: 2048, protectedAsset: true, visibility: "private" } };
  let job: any = { slug: "engineer", title: "Engineer", company: "Employer", companyId: "company", employerId: String(employer._id), location: "Remote", type: "Full time", mode: "Remote", salary: "100 Pi", category: "Engineering", status: "active", moderationStatus: "approved", expiresAt: new Date(Date.now() + 60_000).toISOString() };
  let company: any = { verified: true, verificationStatus: "verified", moderationStatus: "approved" };
  const collection = (rows: any[]) => ({
    async findOne(key: any) { return rows.find(row => Object.entries(key).every(([k,v]) => String(row[k]) === String(v))) || null; },
    async updateOne(key: any, update: any) {
      if (!rows.some(row => Object.entries(key).every(([k,v]) => String(row[k]) === String(v)))) {
        rows.push({ _id: new ObjectId(), ...key, ...update.$setOnInsert });
        return { matchedCount: 0, upsertedCount: 1 };
      }
      return { matchedCount: 1, upsertedCount: 0 };
    },
  });
  const app = express(); app.use(express.json());
  app.locals.userCollection = { async findOne(key: any) { return String(key._id) === String(user._id) && key.uid === user.uid ? user : String(key._id) === String(employer._id) ? employer : null; } };
  app.locals.jobCollection = { async findOne(query: any) { return query.slug === job.slug ? job : null; } };
  app.locals.jobProfileCollection = { async findOne() { return profile; } };
  app.locals.jobCompanyCollection = { async findOne() { return company; } };
  app.locals.productCollection = { async findOne() { return product; } };
  app.locals.jobApplicationCollection = collection(applications);
  app.locals.favoriteCollection = collection(favorites);
  app.locals.jobAuditCollection = { async insertOne(record: any) { audits.push(record); } };
  app.locals.notificationCollection = { async insertOne(record: any) { notifications.push(record); } };
  const router = express.Router(); mountAiDelegationEndpoints(router); app.use("/ai-delegation", router);
  const server = app.listen(0, "127.0.0.1"); await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address() as {port:number}; const base = `http://127.0.0.1:${address.port}/ai-delegation`;
  const apply = { id: "apply-1", serviceId: "jobs", kind: "apply", recordId: "engineer", title: "Apply to Engineer", coverNote: "I work with TypeScript." };
  const save = { id: "save-1", serviceId: "store", kind: "save_product", recordId: String(product._id) };
  const claims = (action: any, operation: string, extra: Record<string, unknown> = {}) => ({
    aud: "smaj-hub-delegation", bindingConfirmed: true, sub: String(user._id), uid: user.uid,
    contractId: "approved-task", approvedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    exp: Math.floor(Date.now()/1000) + 60, action, operation, ...extra,
  });
  const post = (payload: any, path = payload.operation) => {
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signature = createHmac("sha256", process.env.SMAJ_AI_DELEGATION_SECRET!).update(encoded).digest("base64url");
    return fetch(`${base}/${path}`, { method: "POST", headers: { "X-SMAJ-Delegation": `${encoded}.${signature}` } });
  };
  try {
    assert.equal((await fetch(`${base}/execute`, {method:"POST"})).status, 401);
    assert.equal((await post(claims(apply,"execute"), "verify")).status, 401);
    assert.equal((await post({...claims(apply,"execute"), exp: 1})).status, 401);
    assert.equal((await post({...claims(apply,"execute"), uid:"other-user"})).status, 403);
    assert.equal((await post(claims({...apply, kind:"payment"},"execute"))).status, 400);
    assert.equal((await post({...claims(apply,"execute"),bindingConfirmed:false})).status,401);
    assert.equal(applications.length,0);

    job = { ...job, isDemo: true };
    assert.equal((await post(claims(apply,"prepare"))).status, 422);
    job = { ...job, isDemo: false };
    company = { ...company, verified: false, verificationStatus: "pending" };
    assert.equal((await post(claims(apply,"prepare"))).status, 422);
    company = { verified: true, verificationStatus: "verified", moderationStatus: "approved" };
    profile = null;
    assert.equal((await post(claims(apply,"prepare"))).status, 409);

    profile = { title: "Engineer", skills: ["TypeScript"], location: "Lagos", summary: "Build reliable services.", cv: { url: "https://private.example/cv.pdf", name: "Engineer CV.pdf", size: 2048, protectedAsset: true, visibility: "private" } };
    const privatePreviewResponse = await post(claims(apply,"prepare"));
    assert.equal(privatePreviewResponse.status, 200);
    const privatePreview = (await privatePreviewResponse.json() as any).preview;
    assert.equal(privatePreview.cv.attached, false);
    assert.equal(privatePreview.cv.visibility, "private");
    assert.equal(JSON.stringify(privatePreview).includes("private.example"), false);
    const privateApplication = { ...apply, applicationPreview: privatePreview };
    const privateClaims = (operation: string) => claims(privateApplication, operation, { applicationDetailsHash: privatePreview.detailsHash });
    assert.equal((await post(privateClaims("verify"))).status, 409);
    assert.equal((await post(privateClaims("execute"))).status, 200);
    assert.equal((await post(privateClaims("execute"))).status, 200);
    assert.equal(applications.length, 1);
    assert.equal(audits.length, 1);
    assert.equal(notifications.length, 1);
    assert.equal(applications[0].profileSnapshot.cv, undefined);
    assert.equal(applications[0].idempotencyKey.length, 64);
    const verifiedPrivateResponse = await post(privateClaims("verify"));
    assert.equal(verifiedPrivateResponse.status, 200);
    const verifiedPrivate = (await verifiedPrivateResponse.json() as any).evidence;
    assert.equal(verifiedPrivate.backendId, String(applications[0]._id));
    assert.equal(verifiedPrivate.status, "submitted");
    assert.equal(verifiedPrivate.applicationDetailsHash, privatePreview.detailsHash);
    assert.equal(typeof verifiedPrivate.createdAt, "string");
    assert.equal((await post(claims({ ...privateApplication, coverNote: "Changed after approval" }, "verify", { applicationDetailsHash: privatePreview.detailsHash }))).status, 409);

    job = { ...job, slug: "engineer-with-cv" };
    profile = { ...profile, cv: { url: "https://private.example/authorized.pdf", name: "Authorized CV.pdf", size: 4096, protectedAsset: true, visibility: "applications" } };
    const cvAction = { ...apply, id: "apply-with-cv", recordId: job.slug };
    const cvPreviewResponse = await post(claims(cvAction,"prepare"));
    assert.equal(cvPreviewResponse.status, 200);
    const cvPreview = (await cvPreviewResponse.json() as any).preview;
    assert.equal(cvPreview.cv.attached, true);
    assert.equal(cvPreview.cv.name, "Authorized CV.pdf");
    const cvApplication = { ...cvAction, applicationPreview: cvPreview };
    const cvClaims = (operation: string) => claims(cvApplication, operation, { applicationDetailsHash: cvPreview.detailsHash });
    assert.equal((await post(cvClaims("execute"))).status, 200);
    const cvRecord = applications.find(application => application.jobId === job.slug);
    assert.equal(cvRecord.profileSnapshot.cv.url, "https://private.example/authorized.pdf");
    assert.equal(audits.length, 2);
    assert.equal(notifications.length, 2);
    assert.equal((await post(cvClaims("verify"))).status, 200);

    assert.equal((await post(claims(save,"execute"))).status, 200);
    assert.equal((await post(claims(save,"execute"))).status, 200);
    assert.equal(favorites.length, 1); assert.equal((await post(claims(save,"verify"))).status, 200);
    process.env.SMAJ_PRODUCTION_WRITES_ENABLED = "false";
    assert.equal((await post(claims(save,"execute"))).status, 503);
    assert.equal((await post(claims(save,"verify"))).status, 200);
    console.log("Live delegation tests passed: verified-job preparation, explicit binding, authorized CV sharing, idempotent application record, independent verification, Store behavior, and write kill switch.");
  } finally { server.close(); process.env = previous; }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
