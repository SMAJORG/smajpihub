import assert from "node:assert/strict";
import express from "express";
import { createHmac } from "crypto";
import { ObjectId } from "mongodb";
import mountAiDelegationEndpoints from "../handlers/aiDelegation";

async function main() {
  const previous = { ...process.env };
  process.env.SMAJ_AI_DELEGATION_SECRET = "test-only-independent-delegation-secret-32-characters";
  process.env.SMAJ_PRODUCTION_WRITES_ENABLED = "true";
  const user = { _id: new ObjectId(), uid: "test-pi-owner" };
  const product = { _id: new ObjectId(), title: "Real product fixture" };
  const applications: any[] = [], favorites: any[] = [];
  let profile: any = { title: "Engineer", skills: ["TypeScript"], cv: { protectedAsset: "private", visibility: "private" } };
  const collection = (rows: any[]) => ({
    async findOne(key: any) { return rows.find(row => Object.entries(key).every(([k,v]) => String(row[k]) === String(v))) || null; },
    async updateOne(key: any, update: any) {
      if (!rows.some(row => Object.entries(key).every(([k,v]) => String(row[k]) === String(v)))) rows.push({ _id: new ObjectId(), ...key, ...update.$setOnInsert });
      return { matchedCount: 1 };
    },
  });
  const app = express(); app.use(express.json());
  app.locals.userCollection = { async findOne(key: any) { return String(key._id) === String(user._id) && key.uid === user.uid ? user : null; } };
  app.locals.jobCollection = { async findOne() { return { slug: "engineer", title: "Engineer", company: "Employer", companyId: "company", employerId: "employer" }; } };
  app.locals.jobProfileCollection = { async findOne() { return profile; } };
  app.locals.jobCompanyCollection = { async findOne() { return { verified: true }; } };
  app.locals.productCollection = { async findOne() { return product; } };
  app.locals.jobApplicationCollection = collection(applications);
  app.locals.favoriteCollection = collection(favorites);
  const router = express.Router(); mountAiDelegationEndpoints(router); app.use("/ai-delegation", router);
  const server = app.listen(0, "127.0.0.1"); await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address() as {port:number}; const base = `http://127.0.0.1:${address.port}/ai-delegation`;
  const apply = { serviceId: "jobs", kind: "apply", recordId: "engineer", coverNote: "I work with TypeScript." };
  const save = { serviceId: "store", kind: "save_product", recordId: String(product._id) };
  const claims = (action: any, operation: string) => ({ aud: "smaj-hub-delegation", bindingConfirmed: true, sub: String(user._id), uid: user.uid, contractId: "approved-task", approvedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60000).toISOString(), exp: Math.floor(Date.now()/1000) + 60, action, operation });
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
    assert.equal((await post({...claims(apply,"execute"),bindingConfirmed:false})).status,400);
    assert.equal(applications.length,0);
    assert.equal((await post(claims(apply,"verify"))).status, 409);
    profile = null; assert.equal((await post(claims(apply,"execute"))).status, 409);
    profile = { title: "Engineer", skills: ["TypeScript"], cv: { protectedAsset: "private", visibility: "private" } };
    assert.equal((await post(claims(apply,"execute"))).status, 200);
    assert.equal((await post(claims(apply,"execute"))).status, 200);
    assert.equal(applications.length, 1); assert.equal(applications[0].profileSnapshot.cv, undefined);
    const verified = await post(claims(apply,"verify")); assert.equal(verified.status, 200); assert.equal((await verified.json() as any).evidence.backendId, String(applications[0]._id));
    assert.equal((await post(claims({...apply,coverNote:"Changed after approval"},"verify"))).status, 409);
    assert.equal((await post({...claims(apply,"verify"),contractId:"different-task"})).status, 409);
    assert.equal((await post(claims(save,"execute"))).status, 200);
    assert.equal((await post(claims(save,"execute"))).status, 200);
    assert.equal(favorites.length, 1); assert.equal((await post(claims(save,"verify"))).status, 200);
    process.env.SMAJ_PRODUCTION_WRITES_ENABLED = "false";
    assert.equal((await post(claims(save,"execute"))).status, 503);
    console.log("Live delegation contract tests passed: signatures, identity, expiry, scopes, profile privacy, idempotence, independent reads, kill switch. Fixture database only.");
  } finally { server.close(); process.env = previous; }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
