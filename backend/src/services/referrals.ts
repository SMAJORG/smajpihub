import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import env from "../environments";

const REFERRAL_CODE_PATTERN = /^[A-Za-z0-9_-]{20,32}$/;
const ATTRIBUTION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const sign = (payload: string) =>
  createHmac("sha256", env.session_secret).update(`referral-attribution:${payload}`).digest("base64url");

export const isValidReferralCode = (code: unknown): code is string =>
  typeof code === "string" && REFERRAL_CODE_PATTERN.test(code);

export const createReferralCode = () => randomBytes(18).toString("base64url");

export const createReferralAttribution = (code: string, now = Date.now()) => {
  const payload = Buffer.from(JSON.stringify({
    code,
    issuedAt: now,
    nonce: randomBytes(16).toString("base64url"),
  })).toString("base64url");
  return `${payload}.${sign(payload)}`;
};

export const verifyReferralAttribution = (token: unknown, now = Date.now()) => {
  if (typeof token !== "string" || token.length > 2048) return null;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return null;
  const expected = sign(payload);
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      code?: unknown;
      issuedAt?: unknown;
      nonce?: unknown;
    };
    if (
      !isValidReferralCode(claims.code) ||
      typeof claims.issuedAt !== "number" ||
      !Number.isSafeInteger(claims.issuedAt) ||
      claims.issuedAt > now + 60_000 ||
      now - claims.issuedAt > ATTRIBUTION_MAX_AGE_MS ||
      typeof claims.nonce !== "string" ||
      !/^[A-Za-z0-9_-]{20,24}$/.test(claims.nonce)
    ) return null;
    return { code: claims.code };
  } catch {
    return null;
  }
};

export const ensureReferralCode = async (users: any, user: any) => {
  if (isValidReferralCode(user?.referralCode)) return user.referralCode as string;
  if (!user?._id) throw new Error("Cannot create a referral code for an account without a database ID.");

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const referralCode = createReferralCode();
    try {
      await users.updateOne(
        { _id: user._id, referralCode: { $exists: false } },
        { $set: { referralCode } },
      );
    } catch (error) {
      if ((error as { code?: number })?.code !== 11000) throw error;
    }
    const current = await users.findOne({ _id: user._id });
    if (isValidReferralCode(current?.referralCode)) return current.referralCode;
  }
  throw new Error("Could not allocate a unique referral code.");
};

export const referralVisitorHash = (ip: string) =>
  createHmac("sha256", env.session_secret).update(`referral-visitor:${ip}`).digest("hex");
