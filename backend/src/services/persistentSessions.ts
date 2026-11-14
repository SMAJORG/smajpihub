import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import type { Request, Response } from "express";
import env from "../environments";
import { currentDeviceSessionKey, ensureDeviceSession } from "./deviceSessions";
import { ACCESS_TTL_SECONDS, REFRESH_COOKIE, SESSION_TTL_MS } from "./sessionPolicy";

const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const sign = (value: string) => createHmac("sha256", env.session_secret).update(`hub-access:${value}`).digest("base64url");
export const isHubAccessToken = (token: string) => token.startsWith("hub_access.");
const accessToken = (user: any, deviceId: string) => {
  const expires = Date.now() + ACCESS_TTL_SECONDS * 1000;
  const body = Buffer.from(JSON.stringify({ uid: user.uid, deviceId, exp: Math.floor(expires / 1000) })).toString("base64url");
  return { accessToken: `hub_access.${body}.${sign(body)}`, accessTokenExpiresAt: new Date(expires).toISOString() };
};

// Pi verifies the initial identity. Hub credentials subsequently authenticate the
// same device without pretending that an expired Pi OAuth token was refreshed.
export const resolveHubAccessUser = async (req: Request, token: string) => {
  let claims: any;
  try {
    if (token.length > 2048) return null;
    const [prefix, body, signature, extra] = token.split(".");
    if (prefix !== "hub_access" || !body || !signature || extra) return null;
    const expected = sign(body);
    if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
    claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (typeof claims.uid !== "string" || !/^[a-f0-9]{64}$/.test(claims.deviceId) || !Number.isFinite(claims.exp) || claims.exp * 1000 <= Date.now()) return null;
  } catch { return null; }
  const record = await req.app.locals.deviceSessionCollection?.findOne({ sessionKey: digest(claims.deviceId), userId: claims.uid, active: true, expiresAt: { $gt: new Date() } });
  if (!record || record.revokedAt) return null;
  const user = await req.app.locals.userCollection.findOne({ uid: claims.uid });
  if (!user || user.blocked) return null;
  req.session.deviceSessionId = claims.deviceId;
  req.session.user = { userId: String(user._id), uid: user.uid, piUsername: user.piUsername || user.username, role: user.role };
  return user;
};

export const issuePersistentSession = async (req: Request, user: any) => {
  req.session.cookie.maxAge = SESSION_TTL_MS;
  if (!req.session.deviceSessionId) await ensureDeviceSession(req, user.uid);
  const refreshToken = `hub_refresh_${req.session.deviceSessionId}.${randomBytes(32).toString("hex")}`;
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const issued = await req.app.locals.deviceSessionCollection.updateOne(
    { sessionKey: currentDeviceSessionKey(req), userId: user.uid, active: true, revokedAt: null },
    { $set: { refreshTokenHash: digest(refreshToken), expiresAt } },
  );
  if (!issued.matchedCount) throw new Error("Device session unavailable");
  return { ...accessToken(user, req.session.deviceSessionId!), refreshToken, expiresAt: expiresAt.toISOString() };
};

export const refreshPersistentSession = async (req: Request) => {
  const token = req.get("x-smaj-refresh-token") || req.cookies?.[REFRESH_COOKIE] || "";
  const parsed = token.match(/^hub_refresh_([a-f0-9]{64})\.[a-f0-9]{64}$/);
  if (!parsed) return null;
  const collection = req.app.locals.deviceSessionCollection;
  const query = { refreshTokenHash: digest(token), active: true, expiresAt: { $gt: new Date() } };
  const record = await collection?.findOne(query);
  if (!record || record.revokedAt) return null;
  const user = await req.app.locals.userCollection.findOne({ uid: record.userId });
  if (!user || user.blocked) return null;
  // Keep the random refresh credential stable across concurrent tabs and lost
  // responses. Only its hash is stored; revocation is checked on every use.
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const updated = await collection.updateOne({ ...query, sessionKey: record.sessionKey }, { $set: { expiresAt, lastActiveAt: new Date() } });
  if (!updated.matchedCount) return null;
  const id = parsed[1];
  if (digest(id) !== record.sessionKey) return null;
  req.session.deviceSessionId = id;
  req.session.cookie.maxAge = SESSION_TTL_MS;
  req.session.user = { userId: String(user._id), uid: user.uid, piUsername: user.piUsername || user.username, role: user.role };
  return { user, session: { ...accessToken(user, id), refreshToken: token, expiresAt: expiresAt.toISOString() } };
};

export const setRefreshCookie = (res: Response, token: string, options: any) => {
  res.cookie(REFRESH_COOKIE, token, { ...options, maxAge: SESSION_TTL_MS, path: "/user" });
};
