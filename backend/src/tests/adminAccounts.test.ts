import assert from "node:assert/strict";
import express from "express";
import { ObjectId } from "mongodb";
import { createMemoryCollections } from "../services/memoryDatabase";
import mountAdminEndpoints from "../handlers/admin";
async function main() {
  const locals: any = createMemoryCollections();
  await locals.userCollection.insertOne({ uid: "account-test-admin", username: "account-test-admin", role: "admin", accessToken: "account-admin-token" });
  const target = await locals.userCollection.insertOne({ uid: "account-target", displayName: "Before", role: "buyer", accessToken: "private-token", password: "private-password", session: "private-session" });
  const app = express(); Object.assign(app.locals, locals); app.use(express.json()); app.use((req, _res, next) => { (req as any).session = {}; next(); }); const router = express.Router(); mountAdminEndpoints(router); app.use("/admin", router);
  const server = app.listen(0, "127.0.0.1"); await new Promise<void>(resolve => server.once("listening", resolve)); const base = "http://127.0.0.1:" + (server.address() as any).port;
  const patch = (body: object, token = "account-admin-token", id = target.insertedId.toString()) => fetch(base + "/admin/users/" + id, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token }, body: JSON.stringify(body) });
  try {
    assert.equal((await patch({ displayName: "Unauthorized" }, "")).status, 401);
    assert.equal((await patch({ displayName: "Unauthorized" }, "private-token")).status, 403);
    assert.equal((await patch({ displayName: "" })).status, 400);
    assert.equal((await patch({ email: "invalid" })).status, 400);
    assert.equal((await patch({ bio: "x".repeat(1001) })).status, 400);
    assert.equal((await patch({ displayName: "Missing" }, "account-admin-token", new ObjectId().toString())).status, 404);
    const response = await patch({ displayName: " Updated ", email: "user@example.com", contactPhone: "+123", country: "Nigeria", bio: "New bio", uid: "tampered", accessToken: "tampered", role: "seller", sellerActive: true, blocked: true });
    assert.equal(response.status, 200); const result: any = await response.json();
    assert.equal(result.user.displayName, "Updated"); assert.equal(result.user.role, "seller"); assert.equal(result.user.blocked, true); assert.equal(result.user.sellerActive, true); assert.equal(result.user.uid, "account-target");
    for (const key of ["password", "accessToken", "session"]) assert.equal(result.user[key], undefined);
    const stored = await locals.userCollection.findOne({ _id: target.insertedId }); assert.equal(stored?.accessToken, "private-token"); assert.equal(stored?.email, "user@example.com");
    assert.equal((await patch({ blocked: false })).status, 200);
    console.log("Admin profile/access edits, validation, immutable Pi identity, missing accounts, authorization and secret exclusion passed.");
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
