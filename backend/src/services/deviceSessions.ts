import { SESSION_TTL_MS } from "./sessionPolicy";
import crypto from "crypto";
import type { Request } from "express";

const ACTIVITY_INTERVAL_MS = 5 * 60 * 1000;
const MAX_TEXT = 120;

export type DeviceMetadata = {
  deviceId?: string;
  name?: string;
  model?: string;
  manufacturer?: string;
  platform?: string;
  operatingSystem?: string;
  osVersion?: string;
};

const clean = (value: unknown, fallback = "") => String(value || fallback).trim().slice(0, MAX_TEXT);
export const deviceSessionKey = (value: string) => crypto.createHash("sha256").update(value).digest("hex");

const browserFromUserAgent = (userAgent: string) => {
  if (/PiBrowser/i.test(userAgent)) return "Pi Browser";
  if (/Edg\//i.test(userAgent)) return "Microsoft Edge";
  if (/Chrome\//i.test(userAgent)) return "Chrome";
  if (/Safari\//i.test(userAgent)) return "Safari";
  if (/Firefox\//i.test(userAgent)) return "Firefox";
  return "Web Browser";
};

const systemFromUserAgent = (userAgent: string) => {
  if (/Android/i.test(userAgent)) return "Android";
  if (/iPhone|iPad/i.test(userAgent)) return "iOS";
  if (/Windows/i.test(userAgent)) return "Windows";
  if (/Mac OS/i.test(userAgent)) return "macOS";
  if (/Linux/i.test(userAgent)) return "Linux";
  return "Unknown system";
};

const requestLocation = (req: Request) => {
  const city = clean(req.get("cf-ipcity") || req.get("x-vercel-ip-city"));
  const region = clean(req.get("cf-region") || req.get("x-vercel-ip-country-region"));
  const country = clean(req.get("cf-ipcountry") || req.get("x-vercel-ip-country"));
  return [city, region, country].filter(Boolean).join(", ") || "Approximate location unavailable";
};

export const ensureDeviceSession = async (req: Request, userId: string, metadata: DeviceMetadata = {}) => {
  const collection = req.app.locals.deviceSessionCollection;
  if (!collection) return "";
  if (!req.session.deviceSessionId) req.session.deviceSessionId = crypto.randomBytes(32).toString("hex");
  const key = deviceSessionKey(req.session.deviceSessionId);
  const userAgent = clean(req.get("user-agent"), "Unknown client");
  const platform = clean(metadata.platform, /Android/i.test(userAgent) ? "android" : "web").toLowerCase();
  const browser = platform === "android" ? "SMAJ PI HUB Android" : browserFromUserAgent(userAgent);
  const operatingSystem = clean(metadata.operatingSystem, systemFromUserAgent(userAgent));
  const model = clean(metadata.model);
  const manufacturer = clean(metadata.manufacturer);
  const name = clean(metadata.name, model ? [manufacturer, model].filter(Boolean).join(" ") : `${browser} on ${operatingSystem}`);
  const forwardedIp = clean(req.get("cf-connecting-ip") || req.get("x-forwarded-for")?.split(",")[0] || req.ip);
  const now = new Date();
  await collection.updateOne(
    { sessionKey: key },
    {
      $set: {
        userId,
        name,
        model,
        manufacturer,
        platform,
        browser,
        operatingSystem,
        osVersion: clean(metadata.osVersion),
        location: requestLocation(req),
        ipHash: forwardedIp ? deviceSessionKey(forwardedIp) : "",
        lastActiveAt: now,
        active: true,
        revokedAt: null,
        expiresAt: req.session.cookie.expires || new Date(now.getTime() + SESSION_TTL_MS),
      },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true },
  );
  return key;
};

export const validateAndTouchDeviceSession = async (req: Request, userId: string) => {
  if (!req.session.deviceSessionId || !req.app.locals.deviceSessionCollection) return true;
  const sessionKey = deviceSessionKey(req.session.deviceSessionId);
  const record = await req.app.locals.deviceSessionCollection.findOne({ sessionKey, userId });
  if (!record || record.revokedAt || record.active === false || new Date(record.expiresAt).getTime() <= Date.now()) return false;
  const lastActive = new Date(record.lastActiveAt || 0).getTime();
  if (Date.now() - lastActive >= ACTIVITY_INTERVAL_MS) {
    await req.app.locals.deviceSessionCollection.updateOne(
      { sessionKey, userId, active: true },
      { $set: { lastActiveAt: new Date(), expiresAt: req.session.cookie.expires || record.expiresAt } },
    );
  }
  return true;
};

export const currentDeviceSessionKey = (req: Request) => req.session.deviceSessionId
  ? deviceSessionKey(req.session.deviceSessionId)
  : "";