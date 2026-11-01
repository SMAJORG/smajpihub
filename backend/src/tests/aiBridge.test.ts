import assert from "node:assert/strict";
import express from "express";
import axios from "axios";
import { createHmac } from "crypto";
import mountAiEndpoints from "../handlers/ai";
import * as auth from "../services/auth";

async function main() {
  const originalResolve = auth.resolveCurrentUser;
  const originalRequest = axios.request;
  const previousSecret = process.env.SMAJ_AI_SSO_SECRET;
  const previousBase = process.env.SMAJ_AI_BACKEND_URL;
  let user: any = null;
  let calls = 0;
  const forwarded: any[] = [];
  (auth as any).resolveCurrentUser = async () => user;
  process.env.SMAJ_AI_SSO_SECRET = "integration-test-secret-with-at-least-32-characters";
  process.env.SMAJ_AI_BACKEND_URL = "https://ai.example";
  (axios as any).request = async (config: any) => {
    calls++;
    forwarded.push(config);
    const receipt = config.url.includes("/receipt");
    if (config.url.endsWith("/tasks")) assert.equal(config.url, "https://ai.example/api/tasks");
    if (config.url.includes("/retry")) assert.equal(config.url, "https://ai.example/api/tasks/task-id/retry");
    if (config.url.endsWith("/receipt?format=pdf")) assert.equal(config.url, "https://ai.example/api/tasks/task-id/receipt?format=pdf");
    if (config.url.endsWith("/receipt/pdf")) assert.equal(config.url, "https://ai.example/api/tasks/task-id/receipt/pdf");
    if (receipt) assert.equal(config.responseType, "arraybuffer");
    assert.equal(config.headers.Cookie, undefined);
    assert.equal(config.headers.Authorization, undefined);
    const [header, payload, signature] = config.headers["X-SMAJ-Hub-Token"].split(".");
    assert.equal(signature, createHmac("sha256", process.env.SMAJ_AI_SSO_SECRET!).update(`${header}.${payload}`).digest("base64url"));
    assert.equal(JSON.parse(Buffer.from(payload, "base64url").toString()).sub, "hub-user");
    if (receipt) return { status: 200, data: Buffer.from("%PDF-1.4 fixture"), headers: {"content-type":"application/pdf","content-disposition":"attachment; filename=proof.pdf"} };
    return { status: 200, data: { tasks: [] } };
  };
  const app = express(); app.use(express.json()); const router = express.Router(); mountAiEndpoints(router); app.use("/ai", router);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address() as { port: number }; const base = `http://127.0.0.1:${address.port}/ai`;
  try {
    assert.equal((await fetch(`${base}/tasks`)).status, 401);
    assert.equal(calls, 0);
    user = { _id: "hub-user", uid: "pi-user" };
    const response = await fetch(`${base}/tasks`);
    assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), { tasks: [] });
    assert.equal((await fetch(`${base}/auth/demo`)).status, 404);
    const pdf = await fetch(`${base}/tasks/task-id/receipt?format=pdf`);
    assert.equal(pdf.status,200); assert.equal(pdf.headers.get("content-type"),"application/pdf"); assert.match(await pdf.text(),/^%PDF-/);
    const pdfPath = await fetch(`${base}/tasks/task-id/receipt/pdf`);
    assert.equal(pdfPath.status,200); assert.equal(pdfPath.headers.get("content-type"),"application/pdf"); assert.match(await pdfPath.text(),/^%PDF-/);
    const retry = await fetch(`${base}/tasks/task-id/retry`, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": "retry-key" }, body: "{}" });
    assert.equal(retry.status,200);
    assert.equal(forwarded.at(-1).headers["Idempotency-Key"],"retry-key");
    assert.deepEqual(forwarded.at(-1).data,{});
    assert.equal((await fetch(`${base}/delegations`)).status,404);
    delete process.env.SMAJ_AI_SSO_SECRET;
    assert.equal((await fetch(`${base}/tasks`)).status, 503);
    assert.equal(calls, 4);
    console.log("AI bridge: authentication, identity signature, credential isolation, task retry, PDF receipts, allowlist and missing config passed");
  } finally {
    server.close(); (auth as any).resolveCurrentUser = originalResolve; axios.request = originalRequest;
    if (previousSecret === undefined) delete process.env.SMAJ_AI_SSO_SECRET; else process.env.SMAJ_AI_SSO_SECRET = previousSecret;
    if (previousBase === undefined) delete process.env.SMAJ_AI_BACKEND_URL; else process.env.SMAJ_AI_BACKEND_URL = previousBase;
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
