import type { Router } from "express";
import { completeIdentityLink, IdentityLinkError, previewIdentityLink, startIdentityLink, verifyLinkIdentity } from "../services/piIdentityLinks";

export default function mountPiIdentityLinks(router: Router) {
  const attempts = new Map<string, { until: number; count: number }>();
  for (const action of ["start", "preview", "complete"] as const) {
    router.post(`/pi-identities/${action}`, async (req, res) => {
      res.setHeader("Cache-Control", "no-store");
      const now = Date.now(), key = req.ip || "unknown";
      for (const [address, attempt] of attempts) if (attempt.until <= now) attempts.delete(address);
      const attempt = attempts.get(key) || { until: now + 60000, count: 0 };
      if (attempt.count >= 30 || (!attempts.has(key) && attempts.size >= 4096)) {
        res.setHeader("Retry-After", "60");
        return res.status(429).json({ message: "Too many verification attempts. Wait a minute and retry." });
      }
      attempt.count++; attempts.set(key, attempt);
      try {
        // Explicit Pi proof is required even when a browser has an admin cookie.
        const identity = await verifyLinkIdentity(req.body?.accessToken);
        const locals = req.app.locals;
        if (!locals.piIdentityLinkCollection || !locals.piIdentityChallengeCollection) return res.status(503).json({ message: "Identity verification is temporarily unavailable." });
        const result = action === "start" ? await startIdentityLink(locals, identity)
          : action === "preview" ? await previewIdentityLink(locals, req.body?.code, identity)
          : await completeIdentityLink(locals, req.body?.code, identity, req.body?.confirmedOriginalUid);
        return res.json(result);
      } catch (error) {
        if (error instanceof IdentityLinkError) return res.status(error.status).json({ error: error.code, message: error.message });
        // Never log tokens, pairing codes, database errors or request bodies.
        return res.status(503).json({ error: "pi_link_unavailable", message: "Identity verification could not complete. Retry shortly; sign in normally if linking already succeeded." });
      }
    });
  }
}
