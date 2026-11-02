import { Router } from "express";
import axios from "axios";
import { createHmac } from "crypto";
import { resolveCurrentUser } from "../services/auth";

// Only these AI APIs are exposed. Never forward Hub cookies or Pi credentials.
export default function mountAiEndpoints(router: Router) {
  router.all("*", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const route = req.path;
    const allowed = /^(?:\/tasks(?:\/[a-zA-Z0-9-]+(?:\/(?:discover|approve|retry|receipt(?:\/pdf)?))?)?|\/conversations(?:\/[a-zA-Z0-9-]+)?|\/connections|\/jobs|\/store|\/preferences)$/.test(route);
    const allowedMethod = route === "/preferences"
      ? ["GET", "PUT"].includes(req.method)
      : route === "/conversations"
        ? req.method === "GET"
        : route.startsWith("/conversations/")
          ? ["PATCH", "DELETE"].includes(req.method)
          : ["GET", "POST", "DELETE"].includes(req.method);
    if (!allowed || !allowedMethod) return res.sendStatus(404);
    try {
      const user = await resolveCurrentUser(req);
      if (!user) return res.status(401).json({ message: "Your Pi session has expired. Please sign in to SMAJ PI HUB again." });
      const secret = process.env.SMAJ_AI_SSO_SECRET?.trim();
      const base = process.env.SMAJ_AI_BACKEND_URL?.trim();
      if (!secret || secret.length < 32 || !base) return res.status(503).json({ message: "SMAJ AI bridge is not configured: set server-only SMAJ_AI_BACKEND_URL and matching SMAJ_AI_SSO_SECRET (at least 32 characters)." });
      const upstream = new URL(base);
      if (upstream.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && upstream.hostname === "localhost")) throw new Error("Invalid AI backend URL");
      const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
      const payload = Buffer.from(JSON.stringify({ sub: user._id.toString(), uid: user.uid, piUsername: user.piUsername, iss: "smajpihub", aud: process.env.SMAJ_AI_CLIENT_ID || "smaj-ai", scope: "profile:read jobs:read store:read ai:preferences:read ai:preferences:write ai:conversations:read ai:conversations:write", exp: Math.floor(Date.now() / 1000) + 60 })).toString("base64url");
      const signature = createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");
      const receipt = route.includes("/receipt");
      const format = route.endsWith("/pdf") || req.query.format === "pdf" ? "pdf" : "json";
      const response = await axios.request({
        url: `${upstream.origin}/api${route}${route.endsWith("/receipt") ? `?format=${format}` : ""}`, method: req.method,
        data: ["POST", "PUT", "PATCH"].includes(req.method) ? req.body : undefined,
        headers: { "X-SMAJ-Hub-Token": `${header}.${payload}.${signature}`, Origin: upstream.origin, "Content-Type": "application/json", ...(req.get("idempotency-key") ? { "Idempotency-Key": req.get("idempotency-key") } : {}) },
        ...(receipt ? { responseType: "arraybuffer" as const } : {}),
        timeout: 150000, maxRedirects: 0, validateStatus: () => true,
      });
      if (response.status >= 300 && response.status < 400) throw new Error("Unexpected AI redirect");
      if (receipt) {
        res.setHeader("Content-Type", response.headers["content-type"] || "application/json");
        if (response.headers["content-disposition"]) res.setHeader("Content-Disposition", response.headers["content-disposition"]);
        return res.status(response.status).send(response.data);
      }
      return res.status(response.status).json(response.data);
    } catch (error) {
      if (axios.isAxiosError(error) && error.code === "ECONNABORTED") return res.status(504).json({ message: "SMAJ AI timed out waiting for its backend. No generated answer was received. Retry or reopen the saved task." });
      return res.status(502).json({ message: "SMAJ AI could not be reached. Please try again." });
    }
  });
}
