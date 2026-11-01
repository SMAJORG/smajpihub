import type { Router } from "express";
import { createHash, createHmac, timingSafeEqual } from "crypto";
import { ObjectId } from "mongodb";
import { isEmployerBackedJob, isVerifiedEmployerCompany } from "./jobs";
import { createNotification } from "../services/notifications";

const stableStringify = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
};
const hash = (value: unknown) => createHash("sha256").update(stableStringify(value)).digest("hex");
const applicationStatus = (value: unknown) => ["submitted", "reviewing", "shortlisted", "hired", "rejected"].includes(String(value));

const getJobContext = async (req: any, action: any) => {
  const job = await req.app.locals.jobCollection.findOne({
    slug: action.recordId,
    employerId: { $type: "string", $ne: "" },
    isDemo: { $ne: true },
    status: "active",
    moderationStatus: "approved",
    expiresAt: { $gt: new Date().toISOString() },
  });
  if (!job || !isEmployerBackedJob(job)) return null;
  const company = await req.app.locals.jobCompanyCollection.findOne({ slug: job.companyId });
  if (!isVerifiedEmployerCompany(company)) return null;
  return { job, company };
};

const prepareApplication = async (req: any, user: any, claims: any, action: any) => {
  const context = await getJobContext(req, action);
  if (!context) return { error: "verified_job_unavailable", message: "This job is no longer available from a verified employer." };
  const { job, company } = context;
  const profile = await req.app.locals.jobProfileCollection.findOne({ userId: String(user._id) });
  if (!profile) return { error: "profile_required", message: "Complete your SMAJ Jobs professional profile before preparing an application." };
  if (profile.blockedEmployerIds?.includes(job.companyId)) return { error: "employer_blocked", message: "This employer is blocked in your professional profile." };
  if (typeof action.coverNote !== "string" || !action.coverNote.trim() || action.coverNote.length > 2000) return { error: "invalid_application_draft", message: "Review a nonempty application draft of at most 2,000 characters." };
  const cvCanBeShared = profile.cv?.protectedAsset === true && (
    profile.cv.visibility === "applications" ||
    (profile.cv.visibility === "verified_employers" && isVerifiedEmployerCompany(company))
  );
  const profileSnapshot = {
    title: String(profile.title || ""),
    skills: Array.isArray(profile.skills) ? profile.skills.filter((skill: unknown): skill is string => typeof skill === "string") : [],
    location: String(profile.location || ""),
    portfolio: String(profile.portfolio || ""),
    summary: String(profile.summary || ""),
    avatar: String(user.avatar || profile.avatarConfirmationValue || ""),
    avatarConfirmationValue: String(profile.avatarConfirmationValue || user.avatar || ""),
    ...(cvCanBeShared ? { cv: profile.cv } : {}),
  };
  const jobSnapshot = {
    recordId: String(job.slug),
    title: String(job.title || ""),
    company: String(job.company || ""),
    location: String(job.location || ""),
    type: String(job.type || ""),
    mode: String(job.mode || ""),
    salary: String(job.salary || ""),
    category: String(job.category || ""),
  };
  const applicationDetailsHash = hash({
    contractId: claims.contractId,
    actionId: action.id,
    candidateId: String(user._id),
    jobId: action.recordId,
    coverNote: action.coverNote.trim(),
    jobSnapshot,
    profileSnapshot,
  });
  return {
    profileSnapshot,
    applicationDetailsHash,
    preview: {
      detailsHash: applicationDetailsHash,
      job: jobSnapshot,
      profile: {
        title: profileSnapshot.title,
        skills: profileSnapshot.skills,
        location: profileSnapshot.location,
        portfolio: profileSnapshot.portfolio,
        summary: profileSnapshot.summary,
        profilePhoto: profileSnapshot.avatar,
      },
      cv: {
        attached: cvCanBeShared,
        ...(profile.cv ? {
          name: String(profile.cv.name || "CV"),
          size: Number(profile.cv.size) || 0,
          visibility: String(profile.cv.visibility),
        } : {}),
      },
    },
  };
};

// Server-to-server capability, separate from login/bridge credentials. Each signature
// binds one approved action, one real user, an expiry, and execute versus verify.
export default function mountAiDelegationEndpoints(router: Router) {
  router.post("/:operation(prepare|execute|verify)", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const secret = process.env.SMAJ_AI_DELEGATION_SECRET?.trim();
    const operation = req.params.operation;
    if (!secret || secret.length < 32 || (operation === "execute" && process.env.SMAJ_PRODUCTION_WRITES_ENABLED !== "true")) return res.status(503).json({ code: "delegation_disabled", message: "Live delegation requires SMAJ_AI_DELEGATION_SECRET and SMAJ_PRODUCTION_WRITES_ENABLED=true on the Hub." });
    try {
      const token = req.get("X-SMAJ-Delegation") || "";
      const [encoded, signature, extra] = token.split(".");
      const expected = createHmac("sha256", secret).update(encoded || "").digest("base64url");
      if (!encoded || !signature || extra || signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return res.status(401).json({ message: "Invalid delegation signature" });
      const claims = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
      const now = Date.now();
      if (claims.aud !== "smaj-hub-delegation" || claims.operation !== operation || typeof claims.exp !== "number" || claims.exp * 1000 <= now || claims.exp * 1000 > now + 90_000 || !ObjectId.isValid(claims.sub) || !claims.uid || typeof claims.contractId !== "string" || claims.contractId.length > 100) return res.status(401).json({ message: "Invalid or expired delegation capability" });
      if (operation !== "prepare" && (!claims.approvedAt || !Number.isFinite(Date.parse(claims.expiresAt)) || Date.parse(claims.expiresAt) <= now || claims.bindingConfirmed !== true)) return res.status(401).json({ message: "Explicit approval of the application details is required" });
      const action = claims.action;
      if (!action || typeof action.id !== "string" || action.id.length > 100 || typeof action.recordId !== "string" || action.recordId.length > 160 || !((action.serviceId === "jobs" && action.kind === "apply") || (action.serviceId === "store" && action.kind === "save_product"))) return res.status(400).json({ message: "Unsupported delegated action" });
      const user = await req.app.locals.userCollection.findOne({ _id: new ObjectId(claims.sub), uid: claims.uid });
      if (!user || user.blocked || user.isBlocked || user.accessTokenRevokedAt || user.status === "blocked") return res.status(403).json({ message: "Delegated user is unavailable" });
      const execute = operation === "execute";
      if (action.kind === "apply") {
        const key = { candidateId: String(user._id), jobId: action.recordId };
        if (operation === "prepare") {
          const prepared = await prepareApplication(req, user, claims, action);
          if ("error" in prepared) return res.status(prepared.error === "profile_required" ? 409 : 422).json(prepared);
          return res.json({ preview: prepared.preview });
        }
        if (execute) {
          const prepared = await prepareApplication(req, user, claims, action);
          if ("error" in prepared) return res.status(prepared.error === "profile_required" ? 409 : 422).json(prepared);
          if (claims.applicationDetailsHash !== prepared.applicationDetailsHash || action.applicationPreview?.detailsHash !== prepared.applicationDetailsHash) return res.status(409).json({ message: "Your job, profile, or CV sharing settings changed after review. Prepare and approve the application details again." });
          const { job } = (await getJobContext(req, action))!;
          const at = new Date().toISOString();
          const idempotencyKey = hash({ ownerId: String(user._id), contractId: claims.contractId, actionId: action.id, jobId: action.recordId });
          const profileSnapshot = prepared.profileSnapshot;
          const insertion = await req.app.locals.jobApplicationCollection.updateOne(key, { $setOnInsert: {
            ...key, employerId: job.employerId, jobTitle: job.title, company: job.company,
            coverNote: action.coverNote.trim(), delegationId: claims.contractId, delegationActionId: action.id,
            idempotencyKey, applicationDetailsHash: prepared.applicationDetailsHash,
            profileSnapshot,
            status: "submitted", statusHistory: [{ status: "submitted", at, actorId: String(user._id) }], createdAt: at, updatedAt: at,
          } }, { upsert: true });
          if (insertion.upsertedCount) {
            await req.app.locals.jobAuditCollection?.insertOne({
              actorId: String(user._id),
              action: "application.created",
              targetId: action.recordId,
              details: { delegationId: claims.contractId },
              createdAt: at,
            });
            const employer = ObjectId.isValid(job.employerId) && req.app.locals.userCollection
              ? await req.app.locals.userCollection.findOne({ _id: new ObjectId(job.employerId) })
              : null;
            if (employer) await createNotification(req.app, {
              userId: employer.uid,
              type: "jobs_new_application",
              title: "New application received",
              message: `${profileSnapshot.title || user.displayName || user.username || "A candidate"} applied for ${job.title}.`,
              relatedId: String(insertion.upsertedId),
            });
          }
        }
        // Independent lookup also runs on retries after a lost execute response.
        const application = await req.app.locals.jobApplicationCollection.findOne(key);
        if (!application || application.delegationId !== claims.contractId || application.delegationActionId !== action.id || application.coverNote !== action.coverNote?.trim() || application.applicationDetailsHash !== claims.applicationDetailsHash || !application.idempotencyKey) return res.status(409).json({ message: "No matching delegated application was found; an existing application is never relabeled as a new submission." });
        if (!applicationStatus(application.status) || !application.createdAt) return res.status(409).json({ message: "The backend application record does not have a verifiable submitted status." });
        return res.json({ evidence: { serviceId: "jobs", kind: "apply", recordId: action.recordId, ownerId: String(user._id), contractId: claims.contractId, backendId: String(application._id), status: application.status, createdAt: application.createdAt, jobTitle: application.jobTitle, company: application.company, applicationDetailsHash: application.applicationDetailsHash, idempotencyKey: application.idempotencyKey, cvAttached: Boolean(application.profileSnapshot?.cv?.protectedAsset === true) } });
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
      if ((error as { code?: number })?.code === 11000) return res.status(503).json({ message: "Concurrent submission detected; retry safely to verify the existing application record." });
      console.error("[ai-delegation] backend operation failed", error);
      return res.status(502).json({ message: "Delegated backend operation failed; no verified outcome is claimed." });
    }
  });
}
