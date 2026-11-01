import type { Router } from "express";
import { createHmac, timingSafeEqual } from "crypto";
import { ObjectId } from "mongodb";

// Server-to-server capability, separate from login/bridge credentials. Each signature
// binds one approved action, one real user, an expiry, and execute versus verify.
export default function mountAiDelegationEndpoints(router: Router) {
  router.post("/:operation(execute|verify)", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const secret = process.env.SMAJ_AI_DELEGATION_SECRET?.trim();
    if (!secret || secret.length < 32 || process.env.SMAJ_PRODUCTION_WRITES_ENABLED !== "true") return res.status(503).json({ code: "delegation_disabled", message: "Live delegation requires SMAJ_AI_DELEGATION_SECRET and SMAJ_PRODUCTION_WRITES_ENABLED=true on the Hub." });
    try {
      const token = req.get("X-SMAJ-Delegation") || "";
      const [encoded, signature, extra] = token.split(".");
      const expected = createHmac("sha256", secret).update(encoded || "").digest("base64url");
      if (!encoded || !signature || extra || signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return res.status(401).json({ message: "Invalid delegation signature" });
      const claims = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
      const now = Date.now();
      if (claims.aud !== "smaj-hub-delegation" || claims.operation !== req.params.operation || typeof claims.exp !== "number" || claims.exp * 1000 <= now || claims.exp * 1000 > now + 90_000 || !claims.approvedAt || !Number.isFinite(Date.parse(claims.expiresAt)) || Date.parse(claims.expiresAt) <= now || !ObjectId.isValid(claims.sub) || !claims.uid || typeof claims.contractId !== "string" || claims.contractId.length > 100) return res.status(401).json({ message: "Invalid or expired delegation capability" });
      const action = claims.action;
      if (!action || typeof action.recordId !== "string" || action.recordId.length > 160 || !((action.serviceId === "jobs" && action.kind === "apply") || (action.serviceId === "store" && action.kind === "save_product"))) return res.status(400).json({ message: "Unsupported delegated action" });
      const user = await req.app.locals.userCollection.findOne({ _id: new ObjectId(claims.sub), uid: claims.uid });
      if (!user || user.blocked || user.isBlocked || user.accessTokenRevokedAt || user.status === "blocked") return res.status(403).json({ message: "Delegated user is unavailable" });
      const execute = req.params.operation === "execute";
      if (action.kind === "apply") {
        const key = { candidateId: String(user._id), jobId: action.recordId };
        if (execute) {
          const job = await req.app.locals.jobCollection.findOne({ slug: action.recordId, employerId: { $type: "string", $ne: "" }, isDemo: { $ne: true }, status: "active", moderationStatus: "approved", expiresAt: { $gt: new Date().toISOString() } });
          if (!job) return res.status(404).json({ message: "Published employer job is no longer available" });
          const profile = await req.app.locals.jobProfileCollection.findOne({ userId: String(user._id) });
          if (!profile) return res.status(409).json({ message: "Complete your Jobs professional profile before approving an application" });
          if (typeof action.coverNote !== "string" || !action.coverNote.trim() || action.coverNote.length > 2000) return res.status(400).json({ message: "Approve a nonempty application draft of at most 2,000 characters" });
          const company = await req.app.locals.jobCompanyCollection.findOne({ slug: job.companyId });
          if (profile.blockedEmployerIds?.includes(job.companyId)) return res.status(403).json({ message: "This employer is blocked in your professional profile" });
          const shareCv = profile.cv?.protectedAsset && (profile.cv.visibility === "applications" || (profile.cv.visibility === "verified_employers" && company?.verified === true));
          const at = new Date().toISOString();
          // The existing unique (candidateId, jobId) index protects all submission paths.
          await req.app.locals.jobApplicationCollection.updateOne(key, { $setOnInsert: {
            ...key, employerId: job.employerId, jobTitle: job.title, company: job.company,
            coverNote: action.coverNote, delegationId: claims.contractId,
            profileSnapshot: { title: profile.title, skills: profile.skills, location: profile.location, portfolio: profile.portfolio, summary: profile.summary, avatar: user.avatar || profile.avatarConfirmationValue || "", ...(shareCv ? { cv: profile.cv } : {}) },
            status: "submitted", statusHistory: [{ status: "submitted", at, actorId: String(user._id) }], createdAt: at, updatedAt: at,
          } }, { upsert: true });
        }
        // Independent lookup also runs on retries after a lost execute response.
        const application = await req.app.locals.jobApplicationCollection.findOne(key);
        if (!application || application.delegationId !== claims.contractId || application.coverNote !== action.coverNote) return res.status(409).json({ message: "No matching delegated application; an existing application is never relabeled as a new submission" });
        if (!["submitted", "reviewing", "shortlisted", "hired", "rejected"].includes(application.status)) return res.status(409).json({ message: "Application is not in a verifiable submitted state" });
        return res.json({ evidence: { serviceId: "jobs", kind: "apply", recordId: action.recordId, ownerId: String(user._id), contractId: claims.contractId, backendId: String(application._id), status: application.status, createdAt: application.createdAt } });
      }
      if (!ObjectId.isValid(action.recordId)) return res.status(400).json({ message: "Invalid product ID" });
      const key = { userId: user.uid, productId: action.recordId };
      if (execute) {
        const product = await req.app.locals.productCollection.findOne({ _id: new ObjectId(action.recordId), active: true, hidden: { $ne: true }, approved: true, reviewStatus: "approved" });
        if (!product) return res.status(404).json({ message: "Published product is no longer available" });
        // Set saved=true rather than calling the interactive toggle endpoint. A stable
        // ID makes retries idempotent without adding an index to existing user data.
        if (!await req.app.locals.favoriteCollection.findOne(key)) {
          const _id = `ai:${user.uid}:${action.recordId}`;
          await req.app.locals.favoriteCollection.updateOne({ _id }, { $setOnInsert: { ...key, createdAt: new Date(), delegationId: claims.contractId } }, { upsert: true });
        }
      }
      const saved = await req.app.locals.favoriteCollection.findOne(key);
      if (!saved) return res.status(409).json({ message: "Product is not saved in the backend" });
      return res.json({ evidence: { serviceId: "store", kind: "save_product", recordId: action.recordId, ownerId: String(user._id), contractId: claims.contractId, backendId: String(saved._id), status: "saved" } });
    } catch (error) {
      if ((error as { code?: number })?.code === 11000) return res.status(503).json({ message: "Concurrent submission detected; retry safely to verify the existing record" });
      return res.status(502).json({ message: "Delegated backend action failed; no verified outcome claimed" });
    }
  });
}
