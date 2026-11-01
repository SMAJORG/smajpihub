import assert from "node:assert/strict";
import { clampPage, clampPageSize, cleanJobInput, isEmployerBackedJob, serializeJobDocument } from "../handlers/jobs";

const job = cleanJobInput({ title: "  Engineer  ", companyId: "owned-company", location: "Remote", type: "Project", mode: "Remote", salary: "100 Pi", category: "Engineering", summary: "A sufficiently detailed opportunity description for validation.", skills: [" TypeScript ", "", "Node.js"], durationDays: 999 });
assert.equal(job.title, "Engineer");
assert.equal(job.freelance, true);
assert.deepEqual(job.skills, ["TypeScript", "Node.js"]);
assert.ok(new Date(job.expiresAt).getTime() <= Date.now() + 91 * 86_400_000);
assert.equal(clampPage("-4"), 1);
assert.equal(clampPageSize("500"), 50);
assert.equal(clampPageSize("0"), 1);
assert.deepEqual(serializeJobDocument({ _id: { toString: () => "mongo-id" }, title: "Role" }), { _id: undefined, id: "mongo-id", title: "Role" });
assert.equal(isEmployerBackedJob({ employerId: "employer-1" }), true);
assert.equal(isEmployerBackedJob({ companyId: "orbit-commerce" }), false);
assert.equal(isEmployerBackedJob({ employerId: "employer-1", isDemo: true }), false);
console.log("Jobs validation tests passed.");
