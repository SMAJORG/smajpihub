import assert from "node:assert/strict";
import express from "express";
import mountJobs from "../handlers/jobs";
import mountStream from "../handlers/stream";

async function main() {
  const jobRouter = express.Router(); mountJobs(jobRouter);
  const jobs = (jobRouter as any).stack.find((layer: any) => layer.route?.path === "/jobs").route.stack[0].handle;
  let query: any;
  let jobQuery: any;
  const documents = [{ slug: "verified-job", title: "Engineer", companyId: "verified-company", employerId: "employer-1" }];
  const cursor = { sort() { return this; }, skip() { return this; }, limit() { return this; }, async toArray() { return documents; } };
  const collection = { find(q: any) { jobQuery = q; return cursor; }, async countDocuments() { return documents.length; }, insertMany() { throw new Error("Discovery must not seed"); }, updateOne() { throw new Error("Discovery must not update"); } };
  const emptyCursor = { sort() { return this; }, limit() { return this; }, async toArray() { return []; } };
  const streamCursor = { sort() { return this; }, limit() { return this; }, async toArray() { return [{ _id: "video-1", title: "Catalog title", posterUrl: "https://image.tmdb.org/t/p/w500/poster.jpg" }, { _id: "video-2", title: "Thumbnail fallback", thumbnailUrl: "https://smajpihub.com/thumb.jpg" }]; } };
  const streamCollection = { find(q: any) { query = q; return streamCursor; } };
  let payload: any;
  const jobCompanyCollection = {
    find() {
      return {
        project() { return this; },
        async toArray() { return [{ slug: "verified-company", verified: true, verificationStatus: "verified", moderationStatus: "approved" }]; },
      };
    },
  };
  await jobs(
    { query: { catalog_read: "true" }, app: { locals: { jobCollection: collection, jobCompanyCollection } } },
    { json(value: any) { payload = value; } },
  );
  assert.equal(payload.jobs[0].employerVerified, true); assert.equal(jobQuery.status, "active"); assert.equal(jobQuery.moderationStatus, "approved");
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
  await stream({ query: {}, app: { locals: { streamContentCollection: streamCollection } } }, res);
  assert.equal(status, 200);
  assert.equal(payload.videos[0].posterUrl, "https://image.tmdb.org/t/p/w500/poster.jpg");
  assert.equal(payload.videos[0].thumbnailUrl, "https://image.tmdb.org/t/p/w500/poster.jpg");
  assert.equal(payload.videos[1].posterUrl, "https://smajpihub.com/thumb.jpg");
  assert.deepEqual(query, { visibility: "public", moderationStatus: "approved", playbackAllowed: true });
  console.log("Catalog discovery skips seeding and enforces Stream public visibility/storage availability");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
