import assert from "node:assert/strict";
import express from "express";
import mountJobs from "../handlers/jobs";
import mountStream from "../handlers/stream";

async function main() {
  const jobRouter = express.Router(); mountJobs(jobRouter);
  const jobs = (jobRouter as any).stack.find((layer: any) => layer.route?.path === "/jobs").route.stack[0].handle;
  let query: any;
  const cursor = { sort() { return this; }, skip() { return this; }, limit() { return this; }, async toArray() { return []; } };
  const collection = { find(q: any) { query = q; return cursor; }, async countDocuments() { return 0; }, insertMany() { throw new Error("Discovery must not seed"); }, updateOne() { throw new Error("Discovery must not update"); } };
  let payload: any;
  await jobs({ query: { catalog_read: "true" }, app: { locals: { jobCollection: collection } } }, { json(value: any) { payload = value; } });
  assert.deepEqual(payload.jobs, []); assert.equal(query.status, "active"); assert.equal(query.moderationStatus, "approved");
  const apply = (jobRouter as any).stack.find((layer: any) => layer.route?.path === "/jobs/:jobId/apply").route.stack[0].handle;
  const candidateId = "507f1f77bcf86cd799439011";
  let applicationStatus = 200;
  let applicationWrites = 0;
  const response = {
    status(value: number) { applicationStatus = value; return this; },
    json(value: any) { payload = value; },
  };
  await apply({
    params: { jobId: "react-sample" },
    session: { user: { userId: candidateId } },
    get() { return ""; },
    app: { locals: {
      userCollection: { async findOne() { return { _id: { toString: () => candidateId } }; } },
      jobCollection: { async findOne() { return { slug: "react-sample", status: "active", moderationStatus: "approved" }; } },
      jobApplicationCollection: { async insertOne() { applicationWrites++; } },
    } },
  }, response);
  assert.equal(applicationStatus, 409); assert.equal(payload.error, "sample_listing"); assert.equal(applicationWrites, 0);
  const streamRouter = express.Router(); mountStream(streamRouter);
  const stream = (streamRouter as any).stack.find((layer: any) => layer.route?.path === "/creator-content").route.stack[0].handle;
  let status = 200;
  const res = { status(value: number) { status = value; return this; }, json(value: any) { payload = value; } };
  await stream({ query: {}, app: { locals: {} } }, res); assert.equal(status, 503);
  status = 200;
  await stream({ query: {}, app: { locals: { streamContentCollection: collection } } }, res);
  assert.equal(status, 200); assert.deepEqual(payload.videos, []);
  assert.deepEqual(query, { visibility: "public", moderationStatus: "approved", playbackAllowed: true });
  console.log("Catalog discovery skips seeding and enforces Stream public visibility/storage availability");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
