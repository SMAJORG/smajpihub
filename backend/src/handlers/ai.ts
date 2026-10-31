import { Router } from "express";
import axios from "axios";
import { createHmac } from "crypto";
import { resolveCurrentUser } from "../services/auth";

// Only these AI APIs are exposed. Never forward Hub cookies or Pi credentials.
export default function mountAiEndpoints(router: Router) {
  router.all("*", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const route = req.path;
    const allowed = /^(?:\/tasks(?:\/[a-zA-Z0-9-]+(?:\/discover)?)?|\/connections|\/jobs|\/store|\/delegations(?:\/[a-zA-Z0-9-]+(?:\/(?:approve|execute|events))?)?)$/.test(route);
    if (!allowed || !["GET", "POST", "DELETE"].includes(req.method)) return res.sendStatus(404);
    try {
      const user = await resolveCurrentUser(req);
      if (!user) return res.status(401).json({ message: "Your Pi session has expired. Please sign in to SMAJ PI HUB again." });
      const secret = process.env.SMAJ_AI_SSO_SECRET?.trim();
      const base = process.env.SMAJ_AI_BACKEND_URL?.trim();
      if (!secret || secret.length < 32 || !base) return res.status(503).json({ message: "SMAJ AI is being connected. Please try again shortly." });
      const upstream = new URL(base);
      if (upstream.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && upstream.hostname === "localhost")) throw new Error("Invalid AI backend URL");
      const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
      const payload = Buffer.from(JSON.stringify({ sub: user._id.toString(), uid: user.uid, piUsername: user.piUsername, iss: "smajpihub", aud: process.env.SMAJ_AI_CLIENT_ID || "smaj-ai", scope: "profile:read jobs:read store:read", exp: Math.floor(Date.now() / 1000) + 60 })).toString("base64url");
      const signature = createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");
      const response = await axios.request({
        url: `${upstream.origin}/api${route}`, method: req.method,
        data: req.method === "POST" ? req.body : undefined,
        headers: { "X-SMAJ-Hub-Token": `${header}.${payload}.${signature}`, Origin: upstream.origin, "Content-Type": "application/json", ...(req.get("idempotency-key") ? { "Idempotency-Key": req.get("idempotency-key") } : {}) },
        timeout: 60000, maxRedirects: 0, validateStatus: () => true,
      });
      if (response.status >= 300 && response.status < 400) throw new Error("Unexpected AI redirect");
      return res.status(response.status).json(response.data);
    } catch {
      return res.status(502).json({ message: "SMAJ AI could not be reached. Please try again." });
    }
  });
}
