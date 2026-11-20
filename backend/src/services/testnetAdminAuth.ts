import { createHash, randomBytes, scrypt, timingSafeEqual } from "crypto";
import { promisify } from "util";
import type { Request, Response } from "express";
import env from "../environments";
import { requireIsolatedTestnetDeployment } from "./testnetA2USafety";

const derive = promisify(scrypt);
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const normalize = (value: string) => value.trim().replace(/^@+/, "").toLowerCase();
const TTL = 30 * 60 * 1000;
const tokenPattern = /^testnet_admin\.[a-f0-9]{64}$/;

function configuration(req: Request) {
  requireIsolatedTestnetDeployment();
  if (process.env.PI_TESTNET_ADMIN_AUTH_ENABLED !== "true" || req.app.locals.memoryDatabase) throw new Error("Testnet administrator login is disabled.");
  const username = normalize(process.env.PI_TESTNET_ADMIN_USERNAME || "");
  const hash = process.env.PI_TESTNET_ADMIN_PASSWORD_HASH || "";
  if (!username || !env.admin_pi_usernames.includes(username) || !/^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(hash)) throw new Error("Testnet administrator credentials are not configured.");
  const collection = req.app.locals.testnetAdminAuthCollection;
  if (!collection) throw new Error("Persistent Testnet administrator session storage is unavailable.");
  return { username, hash, collection, version: digest(username + "\0" + hash) };
}

// This is an administrator credential, not a Pi identity or a Hub user token.
// It is accepted exclusively by Testnet payout handlers, never general admin APIs.
export async function resolveTestnetAdmin(req: Request, token: string) {
  try {
    const config = configuration(req);
    if (!tokenPattern.test(token)) return null;
    const record = await config.collection.findOne({ _id: digest(token), kind: "session", username: config.username, credentialVersion: config.version, expiresAt: { $gt: new Date() }, revoked: false });
    if (!record) return null;
    return { uid: `testnet-admin:${config.username}`, username: config.username, role: "admin", authMethod: "testnet-admin" };
  } catch { return null; }
}

export async function testnetAdminLogin(req: Request, res: Response) {
  res.setHeader("Cache-Control", "no-store");
  try {
    const { username, hash, collection, version } = configuration(req);
    if (typeof req.body?.username !== "string" || typeof req.body?.password !== "string" || req.body.username.length > 100 || Buffer.byteLength(req.body.password) > 1024 || req.body.password.length < 16) return res.status(401).json({ message: "Invalid administrator credentials." });
    // Shared persistent limiter across replicas, including unknown usernames.
    // Credentials are never logged, returned, or stored in session records.
    const window = Math.floor(Date.now() / (15 * 60 * 1000));
    const query = { _id: `login-rate:${window}` };
    const update = { $inc: { attempts: 1 }, $setOnInsert: { kind: "rate", expiresAt: new Date((window + 2) * 15 * 60 * 1000) } };
    let rate;
    try { rate = await collection.findOneAndUpdate(query, update, { upsert: true, returnDocument: "after" }); }
    catch (error: any) { if (error.code !== 11000) throw error; rate = await collection.findOneAndUpdate(query, update, { returnDocument: "after" }); }
    if (!rate || rate.attempts > 10) { res.setHeader("Retry-After", "900"); return res.status(429).json({ message: "Too many login attempts. Try again in 15 minutes." }); }
    const [, salt, expected] = hash.split("$");
    const actual = await derive(req.body.password, Buffer.from(salt, "hex"), 64) as Buffer;
    const validPassword = timingSafeEqual(actual, Buffer.from(expected, "hex"));
    const validUsername = timingSafeEqual(Buffer.from(digest(normalize(req.body.username)), "hex"), Buffer.from(digest(username), "hex"));
    if (!validPassword || !validUsername) return res.status(401).json({ message: "Invalid administrator credentials." });
    const token = `testnet_admin.${randomBytes(32).toString("hex")}`;
    const expiresAt = new Date(Date.now() + TTL);
    await collection.insertOne({ _id: digest(token), kind: "session", username, credentialVersion: version, expiresAt, revoked: false, createdAt: new Date() });
    return res.json({ token, username, expiresAt: expiresAt.toISOString(), scope: "testnet-payouts" });
  } catch { return res.status(503).json({ message: "Testnet administrator login is unavailable. Check the isolated Testnet server configuration." }); }
}

export async function testnetAdminLogout(req: Request, res: Response) {
  res.setHeader("Cache-Control", "no-store");
  try {
    const config = configuration(req);
    const token = req.get("authorization")?.replace(/^Bearer /i, "") || "";
    if (tokenPattern.test(token)) await config.collection.updateOne({ _id: digest(token), kind: "session" }, { $set: { revoked: true } });
    return res.status(204).end();
  } catch { return res.status(503).json({ message: "Testnet administrator session storage is unavailable." }); }
}
