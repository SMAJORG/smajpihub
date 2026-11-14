import type { RequestHandler } from "express";
import { resolveHubAccessUser } from "./persistentSessions";
const identityPaths = new Set(["/user", "/user/signin", "/user/refresh", "/user/signout", "/user/presence"]);
const normalized = (path: string) => path.replace(/\/+$/, "");
// Authentication remains mandatory even when credentials are missing: CORS must
// allow the dashboard to report configuration errors. Mainnet routes stay excluded.
export const allowsTestnetSandboxOrigin = (path: string, origin: string | undefined, _testnetConfigured: boolean) => Boolean(origin === "https://sandbox.minepi.com" && (/^\/admin\/testnet(?:\/|$)/.test(path) || identityPaths.has(normalized(path)) || normalized(path) === "/user/testnet/wallet-consent"));

// Never let a Sandbox page exchange another site's cookies for Hub credentials.
// Signin verifies its own Pi token; refresh requires its own explicit secret;
// all other allowed identity reads/mutations require a verified Hub bearer.
export const guardTestnetSandboxIdentity: RequestHandler = async (req, res, next) => {
  const path = normalized(req.path);
  if (req.get("origin") !== "https://sandbox.minepi.com" || !identityPaths.has(path) || path === "/user/signin" || req.method === "OPTIONS") return next();
  if (path === "/user/refresh") {
    if (/^hub_refresh_[a-f0-9]{64}\.[a-f0-9]{64}$/.test(req.get("x-smaj-refresh-token") || "")) return next();
  } else {
    const token = req.get("authorization")?.match(/^Bearer (hub_access\.[^\s]+)$/i)?.[1];
    try { if (token && await resolveHubAccessUser(req, token)) return next(); }
    catch { res.status(503).json({ code: "authentication_unavailable", message: "Session verification is unavailable. Retry later." }); return; }
  }
  res.status(401).json({ code: "sandbox_session_required", message: "Sign in through this Testnet app to establish its own secure session." });
};
