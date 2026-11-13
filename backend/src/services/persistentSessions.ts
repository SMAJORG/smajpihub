import { resolvePiSessionAccount, PiAccountIdentityError } from "./piAccountIdentity";
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
  let user: any;
  try { user = (await resolvePiSessionAccount(req.app.locals.userCollection, req.app.locals.piIdentityLinkCollection, claims.uid)).account; }
  catch (error) { if (error instanceof PiAccountIdentityError) return null; throw error; }
  // An old alias token must renew into a canonical token, not open the duplicate.
  if (!user || user.blocked || user.uid !== claims.uid) return null;
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
  const id = parsed[1];
  if (digest(id) !== record.sessionKey) return null;
  const resolution = await resolvePiSessionAccount(req.app.locals.userCollection, req.app.locals.piIdentityLinkCollection, record.userId);
  const user = resolution.account;
  if (!user || user.blocked) return null;
  const migrating = user.uid !== record.userId;
  const identityRecovery = migrating
    ? { fromUid: record.userId, canonicalUid: user.uid, bindingId: String(resolution.bindingId) }
    : record.identityRecovery?.canonicalUid === user.uid ? record.identityRecovery : undefined;
  // Preserve the device document and its history. Only a verified approved binding
  // may move this authenticated device to the original canonical account.
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const updated = await collection.updateOne({ ...query, sessionKey: record.sessionKey, userId: record.userId }, { $set: {
    expiresAt, lastActiveAt: new Date(), ...(migrating ? { userId: user.uid, identityRecovery, identityRecoveredAt: new Date() } : {}),
  } });
  if (!updated.matchedCount) {
    const concurrent = await collection.findOne({ ...query, sessionKey: record.sessionKey, userId: user.uid });
    if (!concurrent || concurrent.revokedAt) return null;
  }
  req.session.deviceSessionId = id;
  req.session.cookie.maxAge = SESSION_TTL_MS;
  req.session.user = { userId: String(user._id), uid: user.uid, piUsername: user.piUsername || user.username, role: user.role };
  return { user, identityRecovery, session: { ...accessToken(user, id), refreshToken: token, expiresAt: expiresAt.toISOString() } };
};

export const setRefreshCookie = (res: Response, token: string, options: any) => {
  res.cookie(REFRESH_COOKIE, token, { ...options, maxAge: SESSION_TTL_MS, path: "/user" });
};
