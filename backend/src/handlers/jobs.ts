import type { Request, Response, Router } from "express";
import { ObjectId } from "mongodb";
import { resolveCurrentUser } from "../services/auth";
import { PI_USDT_RATE, piFromUsdt } from "../services/piPricing";
import { platformAPIKeyClient } from "../services/platformAPIClient";
import { createNotification } from "../services/notifications";
import env from "../environments";

const ACTIVE = {
  status: "active",
  moderationStatus: "approved",
  expiresAt: { $gt: new Date().toISOString() },
};
const APPLICATION_STATUSES = [
  "submitted",
  "reviewing",
  "shortlisted",
  "rejected",
  "hired",
  "withdrawn",
];
const employerPlans = [
  { id: "standard", name: "Standard job post", priceUsdt: 25 },
  { id: "featured", name: "Featured job post", priceUsdt: 99 },
  { id: "monthly", name: "Monthly employer plan", priceUsdt: 299 },
].map(plan => ({ ...plan, pricePi: piFromUsdt(plan.priceUsdt), piRateUsed: PI_USDT_RATE }));

const seedJobCatalog = [
  {
    slug: "product-designer",
    title: "Senior Product Designer",
    companyId: "pioneer-labs",
    company: "Pioneer Labs",
    location: "Remote",
    type: "Full time",
    mode: "Remote",
    salary: "1,800–2,400 Pi / mo",
    category: "Design",
    featured: true,
    freelance: false,
    summary:
      "Shape trusted marketplace experiences used by a growing global Pi community.",
    skills: ["Figma", "Design systems", "Research"],
  },
  {
    slug: "react-engineer",
    title: "React Frontend Engineer",
    companyId: "orbit-commerce",
    company: "Orbit Commerce",
    location: "Lagos, Nigeria",
    type: "Full time",
    mode: "Hybrid",
    salary: "2,200–3,000 Pi / mo",
    category: "Engineering",
    featured: true,
    freelance: false,
    summary:
      "Build fast, accessible commerce tools for merchants and customers.",
    skills: ["React", "TypeScript", "APIs"],
  },
  {
    slug: "community-lead",
    title: "Community Growth Lead",
    companyId: "piworks-africa",
    company: "PiWorks Africa",
    location: "Accra, Ghana",
    type: "Contract",
    mode: "Remote",
    salary: "900–1,200 Pi / mo",
    category: "Marketing",
    featured: false,
    freelance: false,
    summary:
      "Grow a welcoming community through partnerships, events and content.",
    skills: ["Community", "Content", "Analytics"],
  },
  {
    slug: "mobile-audit",
    title: "Mobile UX Audit",
    companyId: "nova-health",
    company: "Nova Health",
    location: "Remote",
    type: "Project",
    mode: "Remote",
    salary: "350 Pi fixed",
    category: "Design",
    featured: false,
    freelance: true,
    summary:
      "Review an existing health app and deliver an actionable UX report.",
    skills: ["UX audit", "Mobile", "Accessibility"],
  },
];

const seedCompensation: Record<string, { minimum: number; maximum: number; period: string }> = {
  "product-designer": { minimum: 1800, maximum: 2400, period: "mo" },
  "react-engineer": { minimum: 2200, maximum: 3000, period: "mo" },
  "community-lead": { minimum: 900, maximum: 1200, period: "mo" },
  "mobile-audit": { minimum: 350, maximum: 350, period: "project" },
};
const formatSeedPi = (value: number) =>
  `π ${piFromUsdt(value).toFixed(5).replace(/\.?0+$/, "")}`;
const seedJobs = seedJobCatalog.map((job) => {
  const compensation = seedCompensation[job.slug];
  return {
    ...job,
    compensationMinUsdt: compensation.minimum,
    compensationMaxUsdt: compensation.maximum,
    compensationPeriod: compensation.period,
    piRateUsed: PI_USDT_RATE,
    salary: `${formatSeedPi(compensation.minimum)}${compensation.maximum > compensation.minimum ? `–${formatSeedPi(compensation.maximum).replace("π ", "")}` : ""} / ${compensation.period}`,
  };
});

const ecosystemCompanyNames = [
  "SMAJ PI HUB",
  "Map of Pi",
  "PyNook",
  "City for Pi",
  "EasyGoods",
  "Bharat Shopping Mart",
  "Country of Pi",
  "Daabia",
  "Polls for Pi",
  "Connect Social",
  "Pi Workforce Pool",
  "World of Pi Championships",
  "Watugot",
  "Pi Game Platform",
  "Pi Barter Mall",
  "PitoGo",
  "Pi Webinars",
  "Pi Games from Latin America",
  "Blind_Lounge",
  "Starmax",
  "RUN FOR PI",
  "Kindrek",
  "Workflet for Pi",
  "PallyPay",
  "SimpleJoy",
  "Agora Pulse",
];
const companySlug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
const seedCompanies = ecosystemCompanyNames.map((name, priority) => ({
  slug: companySlug(name),
  name,
  field: "Pi application",
  mark: name
    .split(/\s+/)
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase(),
  verified: false,
  verificationStatus: "unclaimed",
  directoryPriority: priority,
}));

export const serializeJobDocument = (document: any) =>
  document
    ? {
        ...document,
        _id: undefined,
        id: document.slug || document._id?.toString(),
      }
    : null;
export const clampPage = (value: unknown) =>
  Math.max(1, Math.min(10_000, Number.parseInt(String(value ?? "1"), 10) || 1));
export const clampPageSize = (value: unknown) =>
  Math.max(
    1,
    Math.min(
      50,
      Number.parseInt(String(value ?? "20"), 10) ||
        (String(value) === "0" ? 0 : 20),
    ),
  );
export const cleanJobInput = (body: any) => {
  const compensationMinUsdt = Number(body?.compensationMinUsdt);
  const compensationMaxUsdt =
    Number(body?.compensationMaxUsdt) || compensationMinUsdt;
  const compensationPeriod = [
    "hour",
    "day",
    "week",
    "month",
    "year",
    "project",
  ].includes(body?.compensationPeriod)
    ? body.compensationPeriod
    : "month";
  return {
    title: String(body?.title || "")
      .trim()
      .slice(0, 120),
    companyId: String(body?.companyId || "")
      .trim()
      .slice(0, 120),
    location: String(body?.location || "")
      .trim()
      .slice(0, 120),
    type: ["Full time", "Part time", "Contract", "Project"].includes(body?.type)
      ? body.type
      : "Full time",
    mode: ["Remote", "Hybrid", "On-site"].includes(body?.mode)
      ? body.mode
      : "Remote",
    salary: String(body?.salary || "")
      .trim()
      .slice(0, 120),
    compensationMinUsdt,
    compensationMaxUsdt,
    compensationMinPi: piFromUsdt(compensationMinUsdt),
    compensationMaxPi: piFromUsdt(compensationMaxUsdt),
    compensationPeriod,
    piRateUsed: PI_USDT_RATE,
    category: String(body?.category || "Other")
      .trim()
      .slice(0, 80),
    summary: String(body?.summary || "")
      .trim()
      .slice(0, 4000),
    skills: Array.isArray(body?.skills)
      ? body.skills
          .map((skill: unknown) => String(skill).trim().slice(0, 50))
          .filter(Boolean)
          .slice(0, 20)
      : [],
    freelance: body?.type === "Project" || Boolean(body?.freelance),
    expiresAt: new Date(
      Date.now() +
        Math.max(1, Math.min(90, Number(body?.durationDays) || 30)) *
          86_400_000,
    ).toISOString(),
  };
};

const userId = (user: any) => user._id?.toString() || user.uid;
const isAdmin = (user: any) => user.role === "admin";
const isEmployer = (user: any) =>
  isAdmin(user) || user.role === "seller" || user.jobsRole === "employer";
const validObjectIds = (ids: string[]) =>
  ids.filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id));
const enrichApplicationsWithCandidateProfiles = async (req: Request, applications: any[]) => {
  const candidateIds = Array.from(new Set(applications.map((application) => application.candidateId).filter(Boolean)));
  if (!candidateIds.length) return applications;
  const profiles = await req.app.locals.jobProfileCollection
    .find({ userId: { $in: candidateIds } })
    .toArray();
  const profileByUserId = new Map(profiles.map((profile: any) => [profile.userId, profile]));
  const userObjectIds = validObjectIds(candidateIds);
  const users = req.app.locals.userCollection
    ? await req.app.locals.userCollection
        .find({
          $or: [
            { uid: { $in: candidateIds } },
            ...(userObjectIds.length ? [{ _id: { $in: userObjectIds } }] : []),
          ],
        })
        .toArray()
    : [];
  const userById = new Map(
    users.flatMap((user: any) =>
      [user.uid, user._id?.toString()].filter(Boolean).map((id) => [id, user]),
    ),
  );
  return applications.map((application) => {
    const profile: any = profileByUserId.get(application.candidateId);
    const candidate: any = userById.get(application.candidateId);
    const avatar =
      candidate?.avatar ||
      profile?.avatar ||
      profile?.avatarConfirmationValue ||
      application.profileSnapshot?.avatar ||
      application.profileSnapshot?.avatarConfirmationValue ||
      "";
    return {
      ...application,
      profileSnapshot: {
        ...(application.profileSnapshot || {}),
        ...(avatar ? { avatar, avatarConfirmationValue: avatar } : {}),
      },
    };
  });
};
const isCandidateBlockingEmployer = async (req: Request, employerUserId: string, candidateUserId: string) => {
  const company = await req.app.locals.jobCompanyCollection.findOne({ ownerId: employerUserId });
  if (!company) return false;
  const profile = await req.app.locals.jobProfileCollection.findOne({ userId: candidateUserId });
  return Boolean(profile?.blockedEmployerIds?.includes(company.slug));
};
const requireUser = async (req: Request, res: Response) => {
  const user = await resolveCurrentUser(req);
  if (!user)
    res.status(401).json({
      error: "unauthorized",
      message: "Your SMAJ PI HUB session is required for this Jobs feature.",
    });
  return user;
};
const requireEmployer = async (req: Request, res: Response) => {
  const user = await requireUser(req, res);
  if (user && !isEmployer(user)) {
    res.status(403).json({
      error: "employer_required",
      message: "Activate an employer account before managing opportunities.",
    });
    return null;
  }
  return user;
};
const audit = (
  req: Request,
  actor: any,
  action: string,
  targetId: string,
  details: Record<string, unknown> = {},
) =>
  req.app.locals.jobAuditCollection?.insertOne({
    actorId: userId(actor),
    action,
    targetId,
    details,
    createdAt: new Date().toISOString(),
  });
const safeRegex = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").slice(0, 80);
const cleanPublicUrl = (value: unknown, maxLength = 1000) => {
  const candidate = String(value || "").trim().slice(0, maxLength);
  if (!candidate) return "";
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : "";
  } catch {
    return "";
  }
};
const documentId = (value: string) =>
  ObjectId.isValid(value) ? new ObjectId(value) : value;

const ensureSeedData = async (req: Request) => {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 365 * 86_400_000).toISOString();
  if ((await req.app.locals.jobCollection.countDocuments({})) === 0)
    await req.app.locals.jobCollection.insertMany(
      seedJobs.map((job) => ({
        ...job,
        status: "active",
        moderationStatus: "approved",
        expiresAt,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      })),
    );
  await Promise.all(
    seedJobs.map((job) =>
      req.app.locals.jobCollection.updateOne(
        { slug: job.slug },
        {
          $set: {
            salary: job.salary,
            compensationMinUsdt: job.compensationMinUsdt,
            compensationMaxUsdt: job.compensationMaxUsdt,
            compensationPeriod: job.compensationPeriod,
            piRateUsed: PI_USDT_RATE,
          },
        },
      ),
    ),
  );
  const seededSlugs = seedCompanies.map((company) => company.slug);
  const existingSeedCompanies = await req.app.locals.jobCompanyCollection
    .find({ slug: { $in: seededSlugs } })
    .toArray();
  const existingSlugs = new Set(
    existingSeedCompanies.map((company: any) => company.slug),
  );
  const missingCompanies = seedCompanies.filter(
    (company) => !existingSlugs.has(company.slug),
  );
  if (missingCompanies.length)
    await req.app.locals.jobCompanyCollection.insertMany(
      missingCompanies.map((company) => ({
        ...company,
        moderationStatus: "approved",
        createdAt: now.toISOString(),
      })),
    );
  await req.app.locals.jobCollection.updateMany(
    { moderationStatus: { $exists: false } },
    { $set: { moderationStatus: "approved", expiresAt } },
  );
  await req.app.locals.jobCompanyCollection.updateMany(
    { moderationStatus: { $exists: false } },
    { $set: { moderationStatus: "approved" } },
  );
  await req.app.locals.jobCompanyCollection.updateMany(
    { verificationStatus: { $exists: false }, ownerId: { $exists: true } },
    { $set: { verificationStatus: "claimed", verified: false } },
  );
  await req.app.locals.jobCompanyCollection.updateMany(
    {
      verificationStatus: "pending",
      ownerId: { $exists: true },
      verificationEvidence: { $exists: false },
    },
    { $set: { verificationStatus: "claimed", verified: false } },
  );
  await req.app.locals.jobCompanyCollection.updateMany(
    { verificationStatus: { $exists: false }, ownerId: { $exists: false } },
    { $set: { verificationStatus: "unclaimed", verified: false } },
  );
};

export default function mountJobsEndpoints(router: Router) {
  router.get("/metrics", async (req, res) => {
    await ensureSeedData(req);
    const [opportunities, employers, remote] = await Promise.all([
      req.app.locals.jobCollection.countDocuments(ACTIVE),
      req.app.locals.jobCompanyCollection.countDocuments({
        verified: true,
        moderationStatus: "approved",
      }),
      req.app.locals.jobCollection.countDocuments({
        ...ACTIVE,
        mode: "Remote",
      }),
    ]);
    res.json({
      metrics: {
        opportunities,
        verifiedEmployers: employers,
        remotePercent: opportunities
          ? Math.round((remote / opportunities) * 100)
          : 0,
      },
    });
  });
  router.get("/jobs", async (req, res) => {
    await ensureSeedData(req);
    const page = clampPage(req.query.page);
    const pageSize = clampPageSize(req.query.pageSize);
    const query: Record<string, any> = { ...ACTIVE };
    const search = String(req.query.search || "").trim();
    const location = String(req.query.location || "").trim();
    const category = String(req.query.category || "").trim();
    if (category && category !== "All") query.category = category;
    if (req.query.freelance === "true") query.freelance = true;
    if (location)
      query.location = { $regex: safeRegex(location), $options: "i" };
    if (search)
      query.$or = ["title", "company", "location", "category", "skills"].map(
        (field) => ({ [field]: { $regex: safeRegex(search), $options: "i" } }),
      );
    const [documents, total] = await Promise.all([
      req.app.locals.jobCollection
        .find(query)
        .sort({ featured: -1, createdAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .toArray(),
      req.app.locals.jobCollection.countDocuments(query),
    ]);
    res.json({
      jobs: documents.map(serializeJobDocument),
      pagination: { page, pageSize, total, pages: Math.ceil(total / pageSize) },
    });
  });
  router.get("/jobs/:id", async (req, res) => {
    await ensureSeedData(req);
    const document = await req.app.locals.jobCollection.findOne({
      slug: req.params.id,
      ...ACTIVE,
    });
    if (!document)
      return res
        .status(404)
        .json({ error: "not_found", message: "Job not found." });
    res.json({ job: serializeJobDocument(document) });
  });
  router.post("/employer/enroll", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    await req.app.locals.userCollection.updateOne(
      { _id: user._id },
      { $set: { jobsRole: "employer", updatedAt: new Date().toISOString() } },
    );
    await audit(req, user, "employer.enrolled", userId(user));
    res.json({ role: "employer" });
  });
  router.post("/companies", async (req, res) => {
    const user = await requireEmployer(req, res);
    if (!user) return;
    const name = String(req.body?.name || "")
      .trim()
      .slice(0, 120);
    if (name.length < 2)
      return res.status(400).json({
        error: "invalid_company",
        message: "Company name is required.",
      });
    const ownerId = userId(user);

    const slug = `${name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 70)}-${Date.now().toString(36)}`;
    const company = {
      slug,
      name,
      field: String(req.body?.field || "Other")
        .trim()
        .slice(0, 100),
      mark: name
        .split(/\s+/)
        .map((word: string) => word[0])
        .join("")
        .slice(0, 2)
        .toUpperCase(),
      ownerId,
      verified: false,
      verificationStatus: "claimed",
      website: cleanPublicUrl(req.body?.website, 500),
      logoUrl: cleanPublicUrl(req.body?.logoUrl),
      description: String(req.body?.description || "").trim().slice(0, 1200),
      location: String(req.body?.location || "").trim().slice(0, 160),
      country: String(req.body?.country || "").trim().slice(0, 120),
      registrationNumber: String(req.body?.registrationNumber || "").trim().slice(0, 120),
      representativeRole: String(req.body?.representativeRole || "").trim().slice(0, 120),
      moderationStatus: "pending",
      createdAt: new Date().toISOString(),
    };
    await req.app.locals.jobCompanyCollection.insertOne(company);
    await audit(req, user, "company.created", slug);
    res.status(201).json({ company: serializeJobDocument(company) });
  });
  router.patch("/companies/:id", async (req, res) => {
    const user = await requireEmployer(req, res);
    if (!user) return;
    const company = await req.app.locals.jobCompanyCollection.findOne({ slug: req.params.id, ownerId: userId(user) });
    if (!company) return res.status(404).json({ error: "not_found", message: "Company not found." });
    const updates = {
      name: String(req.body?.name || company.name).trim().slice(0, 120),
      field: String(req.body?.field || company.field || "Other").trim().slice(0, 100),
      logoUrl: cleanPublicUrl(req.body?.logoUrl ?? company.logoUrl),
      website: cleanPublicUrl(req.body?.website ?? company.website, 500),
      description: String(req.body?.description ?? company.description ?? "").trim().slice(0, 1200),
      location: String(req.body?.location ?? company.location ?? "").trim().slice(0, 160),
      country: String(req.body?.country ?? company.country ?? "").trim().slice(0, 120),
      updatedAt: new Date().toISOString(),
    };
    if (updates.name.length < 2) return res.status(400).json({ error: "invalid_company", message: "Company name is required." });
    await req.app.locals.jobCompanyCollection.updateOne({ slug: company.slug }, { $set: updates });
    await audit(req, user, "company.profile_updated", company.slug);
    res.json({ company: serializeJobDocument({ ...company, ...updates }) });
  });
  router.post("/companies/:id/claim", async (req, res) => {
    const user = await requireEmployer(req, res); if (!user) return;
    const company = await req.app.locals.jobCompanyCollection.findOne({ slug: req.params.id });
    if (!company || (company.ownerId && company.ownerId !== userId(user))) return res.status(409).json({ error: "not_claimable", message: "This company is already claimed." });
    const evidence = String(req.body?.evidence || "").trim().slice(0, 1000); const website = cleanPublicUrl(req.body?.website || company.website, 500);
    if (!evidence || !website) return res.status(400).json({ error: "evidence_required" });
    await req.app.locals.jobCompanyCollection.updateOne({ slug: company.slug }, { $set: { ownerId: userId(user), website, claimEvidence: evidence, verificationStatus: "claimed", claimedAt: new Date().toISOString() } });
    await audit(req, user, "company.claimed", company.slug); res.json({ verificationStatus: "claimed" });
  });
  router.post("/companies/:id/verification-request", async (req, res) => {
    const user = await requireEmployer(req, res); if (!user) return;
    const company = await req.app.locals.jobCompanyCollection.findOne({ slug: req.params.id, ownerId: userId(user) }); if (!company) return res.status(404).json({ error: "not_found" });
    const evidence = { registrationNumber: String(req.body?.registrationNumber || "").trim().slice(0, 120), businessEmail: String(req.body?.businessEmail || "").trim().slice(0, 200), representativeRole: String(req.body?.representativeRole || "").trim().slice(0, 120), notes: String(req.body?.notes || "").trim().slice(0, 1000) };
    if (!evidence.businessEmail || !evidence.representativeRole) return res.status(400).json({ error: "evidence_required" });
    await req.app.locals.jobCompanyCollection.updateOne({ slug: company.slug }, { $set: { verificationStatus: "pending", verificationEvidence: evidence, verificationRequestedAt: new Date().toISOString() } });
    await audit(req, user, "company.verification_requested", company.slug); res.json({ verificationStatus: "pending" });
  });
  router.post("/jobs", async (req, res) => {
    const user = await requireEmployer(req, res);
    if (!user) return;
    const job = cleanJobInput(req.body);
    const company = await req.app.locals.jobCompanyCollection.findOne({
      slug: job.companyId,
    });
    if (!company || (!isAdmin(user) && company.ownerId !== userId(user)))
      return res.status(403).json({
        error: "company_forbidden",
        message: "You may only post for a company you own.",
      });
    if (
      !job.title ||
      !job.location ||
      !job.salary ||
      !Number.isFinite(job.compensationMinUsdt) ||
      job.compensationMinUsdt <= 0 ||
      job.compensationMaxUsdt < job.compensationMinUsdt ||
      job.summary.length < 30
    )
      return res.status(400).json({
        error: "invalid_job",
        message:
          "Title, location, compensation, and a detailed description are required.",
      });
    const slug = `${job.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80)}-${Date.now().toString(36)}`;
    const now = new Date().toISOString();
    const document = {
      ...job,
      slug,
      company: company.name,
      employerId: userId(user),
      status: "active",
      moderationStatus: "pending",
      featured: false,
      postedAt: now,
      createdAt: now,
      updatedAt: now,
    };
    await req.app.locals.jobCollection.insertOne(document);
    await audit(req, user, "job.created", slug, { companyId: company.slug });
    res.status(201).json({ job: serializeJobDocument(document) });
  });
  router.get("/companies", async (req, res) => {
    await ensureSeedData(req);
    const search = String(req.query.search || "").trim();
    const field = String(req.query.field || "").trim();
    const country = String(req.query.country || "").trim();
    const query: Record<string, any> = {
      moderationStatus: "approved",
      $and: [{ $or: [{ slug: { $in: seedCompanies.map(company => company.slug) } }, { ownerId: { $exists: true } }] }],
    };
    if (search) query.$and.push({ $or: ["name", "field", "description", "location", "country"].map(key => ({ [key]: { $regex: safeRegex(search), $options: "i" } })) });
    if (field) query.$and.push({ field: { $regex: safeRegex(field), $options: "i" } });
    if (country) query.$and.push({ country: { $regex: safeRegex(country), $options: "i" } });
    if (req.query.verified === "true") query.$and.push({ verificationStatus: { $in: ["verified", "pi_kyb"] } });
    const companies = await req.app.locals.jobCompanyCollection.find(query).sort({ directoryPriority: 1, name: 1 }).toArray();
    const results = await Promise.all(
      companies.map(async (company: any) => ({
        ...serializeJobDocument(company),
        openings: await req.app.locals.jobCollection.countDocuments({
          companyId: company.slug,
          ...ACTIVE,
        }),
      })),
    );
    res.json({ companies: results });
  });
  router.get("/companies/:id", async (req, res) => {
    await ensureSeedData(req);
    const company = await req.app.locals.jobCompanyCollection.findOne({ slug: req.params.id });
    if (!company)
      return res
        .status(404)
        .json({ error: "not_found", message: "Company not found." });
    if (company.moderationStatus !== "approved") {
      const currentUser = await resolveCurrentUser(req);
      if (!currentUser || (!isAdmin(currentUser) && company.ownerId !== userId(currentUser)))
        return res.status(404).json({ error: "not_found", message: "Company not found." });
    }
    const openings = await req.app.locals.jobCollection
      .find({ companyId: company.slug, ...ACTIVE })
      .toArray();
    res.json({
      company: serializeJobDocument(company),
      jobs: openings.map(serializeJobDocument),
    });
  });
  router.get("/profile", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    const profile = await req.app.locals.jobProfileCollection.findOne({
      userId: userId(user),
    });
    res.json({ profile: serializeJobDocument(profile) });
  });
  router.patch("/profile/avatar-confirmation", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    const status = req.body?.status === "confirmed" ? "confirmed" : "deferred";
    const avatar = String(req.body?.avatar || "").trim().slice(0, 1000);
    await req.app.locals.jobProfileCollection.updateOne(
      { userId: userId(user) },
      {
        $set: {
          avatarConfirmationStatus: status,
          avatarConfirmationValue: avatar,
          avatarConfirmationUpdatedAt: new Date().toISOString(),
        },
        $setOnInsert: { userId: userId(user), createdAt: new Date().toISOString() },
      },
      { upsert: true },
    );
    await audit(req, user, `profile.avatar_${status}`, userId(user));
    res.json({ status, avatar });
  });
  router.put("/profile/cv", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    const url = String(req.body?.url || "").trim().slice(0, 1200);
    const name = String(req.body?.name || "CV.pdf").replace(/[\\/]/g, "-").slice(0, 120);
    const size = Math.max(0, Math.min(5_000_000, Number(req.body?.size) || 0));
    const visibility = ["applications", "verified_employers", "private"].includes(req.body?.visibility)
      ? req.body.visibility
      : "applications";
    if (!/^https:\/\/res\.cloudinary\.com\//i.test(url) || !name.toLowerCase().endsWith(".pdf") || !size)
      return res.status(400).json({ error: "invalid_cv", message: "Upload a valid PDF CV." });
    const cv = { url, name, size, visibility, updatedAt: new Date().toISOString() };
    await req.app.locals.jobProfileCollection.updateOne(
      { userId: userId(user) },
      { $set: { cv }, $setOnInsert: { userId: userId(user), createdAt: new Date().toISOString() } },
      { upsert: true },
    );
    await audit(req, user, "profile.cv_updated", userId(user), { visibility, size });
    res.json({ cv });
  });
  router.delete("/profile/cv", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    await req.app.locals.jobProfileCollection.updateOne({ userId: userId(user) }, { $unset: { cv: "" } });
    await audit(req, user, "profile.cv_deleted", userId(user));
    res.status(204).send();
  });
  router.patch("/profile/section", async (req, res) => {
    const user = await requireUser(req, res); if (!user) return;
    const section = String(req.body?.section || ""); let values: Record<string, unknown> = {};
    if (section === "headline") values = { title: String(req.body?.title || "").trim().slice(0, 80) };
    else if (section === "skills") values = { skills: Array.isArray(req.body?.skills) ? req.body.skills.map((item: unknown) => String(item).trim().slice(0, 60)).filter(Boolean).slice(0, 30) : [] };
    else if (section === "basic") values = { location: String(req.body?.location || "").trim().slice(0, 120), availability: String(req.body?.availability || "Open to offers").slice(0, 40), portfolio: String(req.body?.portfolio || "").trim().slice(0, 500), summary: String(req.body?.summary || "").trim().slice(0, 3000) };
    else if (section === "employment") values = { employment: Array.isArray(req.body?.employment) ? req.body.employment.slice(0, 20).map((item: any) => ({ id: String(item.id || Date.now()), position: String(item.position || "").trim().slice(0, 120), employer: String(item.employer || "").trim().slice(0, 120), current: Boolean(item.current), location: String(item.location || "").trim().slice(0, 120), country: String(item.country || "").trim().slice(0, 120), startMonth: String(item.startMonth || "").slice(0, 20), startYear: String(item.startYear || "").slice(0, 4), endMonth: item.current ? "Present" : String(item.endMonth || "").slice(0, 20), endYear: item.current ? "Present" : String(item.endYear || "").slice(0, 4), description: String(item.description || "").trim().slice(0, 1000) })) : [] };
    else return res.status(400).json({ error: "invalid_section" });
    await req.app.locals.jobProfileCollection.updateOne({ userId: userId(user) }, { $set: { ...values, updatedAt: new Date().toISOString() }, $setOnInsert: { userId: userId(user), createdAt: new Date().toISOString() } }, { upsert: true });
    await audit(req, user, `profile.${section}_updated`, userId(user)); res.json({ section, values });
  });
  router.put("/profile/blocked-employers/:companyId", async (req, res) => {
    const user = await requireUser(req, res); if (!user) return;
    const companyId = String(req.params.companyId || "").trim().slice(0, 120);
    if (!companyId) return res.status(400).json({ error: "invalid_company" });
    const profile = await req.app.locals.jobProfileCollection.findOne({ userId: userId(user) });
    const current: string[] = Array.isArray(profile?.blockedEmployerIds) ? profile.blockedEmployerIds : [];
    const blocked = !current.includes(companyId);
    const blockedEmployerIds = blocked ? [...current, companyId] : current.filter((id) => id !== companyId);
    await req.app.locals.jobProfileCollection.updateOne(
      { userId: userId(user) },
      { $set: { blockedEmployerIds, updatedAt: new Date().toISOString() }, $setOnInsert: { userId: userId(user), createdAt: new Date().toISOString() } },
      { upsert: true },
    );
    await audit(req, user, blocked ? "profile.employer_blocked" : "profile.employer_unblocked", companyId);
    res.json({ blocked, blockedEmployerIds });
  });
  router.patch("/preferences", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    const jobsMode = ["candidate", "employer", "both"].includes(req.body?.jobsMode) ? req.body.jobsMode : "candidate";
    const preferences = {
      jobsMode,
      minimumPayUsdt: Math.max(0, Number(req.body?.minimumPayUsdt) || 0),
      payPeriod: ["hour", "day", "week", "month", "year"].includes(req.body?.payPeriod) ? req.body.payPeriod : "hour",
      preferredLocations: Array.isArray(req.body?.preferredLocations) ? req.body.preferredLocations.map((value: unknown) => String(value).trim().slice(0, 120)).filter(Boolean).slice(0, 5) : [],
      remotePreference: ["all", "remote", "onsite"].includes(req.body?.remotePreference) ? req.body.remotePreference : "all",
      openToAnywhere: Boolean(req.body?.openToAnywhere),
      preferredTitles: Array.isArray(req.body?.preferredTitles) ? req.body.preferredTitles.map((value: unknown) => String(value).trim().slice(0, 120)).filter(Boolean).slice(0, 10) : [],
      preferredCategories: Array.isArray(req.body?.preferredCategories) ? req.body.preferredCategories.map((value: unknown) => String(value).trim().slice(0, 80)).filter(Boolean).slice(0, 10) : [],
      updatedAt: new Date().toISOString(),
    };
    await req.app.locals.jobProfileCollection.updateOne({ userId: userId(user) }, { $set: preferences, $setOnInsert: { userId: userId(user), createdAt: new Date().toISOString() } }, { upsert: true });
    if (jobsMode === "employer" || jobsMode === "both") await req.app.locals.userCollection.updateOne({ _id: user._id }, { $set: { jobsRole: "employer" } });
    await audit(req, user, "preferences.updated", userId(user), { jobsMode });
    res.json({ preferences });
  });
  router.post("/profile/verification-request", async (req, res) => {
    const user = await requireUser(req, res); if (!user) return;
    const profile = await req.app.locals.jobProfileCollection.findOne({ userId: userId(user) });
    if (!profile?.title || !profile?.summary) return res.status(400).json({ error: "profile_incomplete", message: "Complete your professional profile first." });
    const evidence = { portfolio: String(req.body?.portfolio || profile.portfolio || "").trim().slice(0, 500), credential: String(req.body?.credential || "").trim().slice(0, 500), notes: String(req.body?.notes || "").trim().slice(0, 1000) };
    await req.app.locals.jobProfileCollection.updateOne({ userId: userId(user) }, { $set: { verificationStatus: "pending", verificationEvidence: evidence, verificationRequestedAt: new Date().toISOString() } });
    await audit(req, user, "candidate.verification_requested", userId(user)); res.json({ verificationStatus: "pending" });
  });
  router.get("/billing/plans", (_req, res) => res.json({ plans: employerPlans }));
  router.post("/billing/intents", async (req, res) => {
    const user = await requireEmployer(req, res); if (!user) return;
    const plan = employerPlans.find(item => item.id === req.body?.planId); if (!plan) return res.status(400).json({ error: "invalid_plan" });
    const jobId = String(req.body?.jobId || "").trim();
    if (jobId) {
      const job = await req.app.locals.jobCollection.findOne({ slug: jobId, employerId: userId(user) });
      if (!job) return res.status(403).json({ error: "job_forbidden", message: "You may only sponsor a job you posted." });
    }
    const paymentEnabled = Boolean(env.pi_api_key);
    const intent = {
      billingId: `job-billing-${Date.now().toString(36)}`,
      employerId: userId(user),
      ...(jobId ? { jobId } : {}),
      ...plan,
      status: "pending_payment",
      createdAt: new Date().toISOString(),
    };
    await req.app.locals.jobBillingCollection.insertOne(intent);
    await audit(req, user, "billing.intent_created", intent.billingId, { planId: plan.id, jobId: jobId || undefined });
    res.status(201).json({
      intent,
      paymentEnabled,
      message: paymentEnabled ? undefined : "Pi payment activation is pending platform payment configuration.",
    });
  });
  router.post("/billing/approve", async (req, res) => {
    const user = await requireEmployer(req, res); if (!user) return;
    const { billingId, paymentId } = req.body || {};
    if (!billingId || !paymentId)
      return res.status(400).json({ error: "bad_request", message: "Missing billingId or paymentId." });
    const intent = await req.app.locals.jobBillingCollection.findOne({ billingId, employerId: userId(user) });
    if (!intent) return res.status(404).json({ error: "not_found", message: "Billing request not found." });
    if (intent.status !== "pending_payment")
      return res.status(400).json({ error: "bad_request", message: "Only pending billing requests can be approved." });
    if (!env.pi_api_key)
      return res.status(503).json({ error: "payments_unavailable", message: "Pi payment activation is pending platform payment configuration." });
    await platformAPIKeyClient.post(`/v2/payments/${paymentId}/approve`);
    await req.app.locals.jobBillingCollection.updateOne(
      { billingId },
      { $set: { paymentId, status: "processing", updatedAt: new Date().toISOString() } }
    );
    await audit(req, user, "billing.payment_approved", billingId, { paymentId });
    res.json({ message: "Payment approved.", paymentId });
  });
  router.post("/billing/complete", async (req, res) => {
    const user = await requireEmployer(req, res); if (!user) return;
    const { billingId, paymentId, txid } = req.body || {};
    if (!billingId || !paymentId || !txid)
      return res.status(400).json({ error: "bad_request", message: "Missing billingId, paymentId, or txid." });
    const intent = await req.app.locals.jobBillingCollection.findOne({ billingId, employerId: userId(user) });
    if (!intent) return res.status(404).json({ error: "not_found", message: "Billing request not found." });
    if (intent.status !== "processing" && intent.status !== "pending_payment")
      return res.status(400).json({ error: "bad_request", message: "Only pending billing requests can be completed." });
    if (!env.pi_api_key)
      return res.status(503).json({ error: "payments_unavailable", message: "Pi payment activation is pending platform payment configuration." });
    await platformAPIKeyClient.post(`/v2/payments/${paymentId}/complete`, { txid });
    const paidAt = new Date().toISOString();
    await req.app.locals.jobBillingCollection.updateOne(
      { billingId },
      { $set: { status: "paid", paymentId, paymentTxid: txid, paidAt, updatedAt: paidAt } }
    );
    let job: any = null;
    if (intent.jobId) {
      const perk =
        intent.id === "featured"
          ? { featured: true }
          : intent.id === "monthly"
            ? { featured: true, sponsoredUntil: new Date(Date.now() + 30 * 86_400_000).toISOString() }
            : {};
      if (Object.keys(perk).length)
        await req.app.locals.jobCollection.updateOne(
          { slug: intent.jobId, employerId: userId(user) },
          { $set: { ...perk, updatedAt: paidAt } }
        );
      job = await req.app.locals.jobCollection.findOne({ slug: intent.jobId });
    } else if (intent.id === "monthly") {
      await req.app.locals.userCollection.updateOne(
        { _id: user._id },
        {
          $set: {
            jobsEmployerPlan: "monthly",
            jobsEmployerPlanExpiresAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
          },
        }
      );
    }
    await audit(req, user, "billing.payment_completed", billingId, { paymentId, txid, planId: intent.id });
    await createNotification(req.app, {
      userId: userId(user),
      type: "jobs_billing_paid",
      title: "Employer plan activated",
      message: `${intent.name} is now active${job ? ` for ${job.title}` : ""}.`,
      relatedId: billingId,
    });
    res.json({ message: "Payment completed.", paymentId, txid, job: job ? serializeJobDocument(job) : undefined });
  });
  router.post("/billing/cancelled_payment", async (req, res) => {
    const user = await requireEmployer(req, res); if (!user) return;
    const { billingId, paymentId } = req.body || {};
    if (!billingId) return res.status(400).json({ error: "bad_request", message: "Missing billingId." });
    const intent = await req.app.locals.jobBillingCollection.findOne({ billingId, employerId: userId(user) });
    if (!intent) return res.status(404).json({ error: "not_found", message: "Billing request not found." });
    await req.app.locals.jobBillingCollection.updateOne(
      { billingId },
      { $set: { status: "cancelled", paymentId, updatedAt: new Date().toISOString() } }
    );
    await audit(req, user, "billing.payment_cancelled", billingId, { paymentId });
    res.json({ message: "Payment cancelled." });
  });
  router.put("/profile", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    const profile = {
      title: String(req.body?.title || "")
        .trim()
        .slice(0, 120),
      skills: String(req.body?.skills || "")
        .split(",")
        .map((x: string) => x.trim())
        .filter(Boolean)
        .slice(0, 30),
      location: String(req.body?.location || "")
        .trim()
        .slice(0, 120),
      availability: String(req.body?.availability || "Open to offers").slice(
        0,
        40,
      ),
      portfolio: String(req.body?.portfolio || "")
        .trim()
        .slice(0, 500),
      summary: String(req.body?.summary || "")
        .trim()
        .slice(0, 3000),
      updatedAt: new Date().toISOString(),
    };
    if (!profile.title || profile.summary.length < 30)
      return res.status(400).json({
        error: "invalid_profile",
        message: "A title and professional summary are required.",
      });
    await req.app.locals.jobProfileCollection.updateOne(
      { userId: userId(user) },
      {
        $set: profile,
        $setOnInsert: {
          userId: userId(user),
          createdAt: new Date().toISOString(),
        },
      },
      { upsert: true },
    );
    await audit(req, user, "profile.updated", userId(user));
    res.json({ profile: { ...profile, id: userId(user) } });
  });
  router.get("/saved", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    const records = await req.app.locals.jobSavedCollection
      .find({ userId: userId(user) })
      .toArray();
    const slugs = records.map((r: any) => r.jobId);
    const jobs = slugs.length
      ? await req.app.locals.jobCollection
          .find({ slug: { $in: slugs }, ...ACTIVE })
          .toArray()
      : [];
    res.json({ jobs: jobs.map(serializeJobDocument) });
  });
  router.put("/saved/:jobId", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    const key = { userId: userId(user), jobId: req.params.jobId };
    const existing = await req.app.locals.jobSavedCollection.findOne(key);
    if (existing) {
      await req.app.locals.jobSavedCollection.deleteOne(key);
      return res.json({ saved: false });
    }
    await req.app.locals.jobSavedCollection.insertOne({
      ...key,
      createdAt: new Date().toISOString(),
    });
    res.json({ saved: true });
  });
  router.get("/applications", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    const applications = await req.app.locals.jobApplicationCollection
      .find({ candidateId: userId(user) })
      .sort({ createdAt: -1 })
      .toArray();
    res.json({
      applications: applications.map((application: any) => serializeJobDocument({ ...application, notes: undefined })),
    });
  });
  router.get("/activity", async (req, res) => {
    const user = await requireUser(req, res); if (!user) return;
    const days = [7, 30, 90].includes(Number(req.query.days)) ? Number(req.query.days) : 7;
    const since = new Date(Date.now() - days * 86_400_000);
    const applications = await req.app.locals.jobApplicationCollection.find({ candidateId: userId(user) }).toArray();
    const employerActions = applications.flatMap((application: any) => (application.statusHistory || []).filter((entry: any) => !["submitted", "withdrawn"].includes(entry.status) && new Date(entry.at) >= since).map((entry: any) => ({ status: entry.status, at: entry.at, jobTitle: application.jobTitle, company: application.company })));
    const appearances = Array.from({ length: days }, (_, index) => ({ date: new Date(Date.now() - (days - index - 1) * 86_400_000).toISOString().slice(0, 10), count: 0 }));
    res.json({ days, appearances, totalAppearances: 0, employerActions: employerActions.sort((a: any, b: any) => b.at.localeCompare(a.at)) });
  });
  router.post("/jobs/:jobId/apply", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    const job = await req.app.locals.jobCollection.findOne({
      slug: req.params.jobId,
      ...ACTIVE,
    });
    if (!job)
      return res
        .status(404)
        .json({ error: "not_found", message: "Job not found." });
    const key = { candidateId: userId(user), jobId: req.params.jobId };
    if (await req.app.locals.jobApplicationCollection.findOne(key))
      return res
        .status(409)
        .json({ error: "already_applied", message: "You already applied." });
    const profile = await req.app.locals.jobProfileCollection.findOne({
      userId: userId(user),
    });
    if (!profile)
      return res.status(400).json({
        error: "profile_required",
        message: "Complete your professional profile before applying.",
      });
    const now = new Date().toISOString();
    const applicationCompany = await req.app.locals.jobCompanyCollection.findOne({ slug: job.companyId });
    const shareCv =
      profile.cv?.visibility === "applications" ||
      (profile.cv?.visibility === "verified_employers" && applicationCompany?.verified === true);
    const application = {
      ...key,
      employerId: job.employerId,
      jobTitle: job.title,
      company: job.company,
      coverNote: String(req.body?.coverNote || "")
        .trim()
        .slice(0, 2000),
      profileSnapshot: {
        title: profile.title,
        skills: profile.skills,
        location: profile.location,
        portfolio: profile.portfolio,
        summary: profile.summary,
        avatar: user.avatar || profile.avatarConfirmationValue || "",
        avatarConfirmationValue: profile.avatarConfirmationValue || user.avatar || "",
        ...(shareCv ? { cv: profile.cv } : {}),
      },
      status: "submitted",
      statusHistory: [{ status: "submitted", at: now, actorId: userId(user) }],
      createdAt: now,
      updatedAt: now,
    };
    const result =
      await req.app.locals.jobApplicationCollection.insertOne(application);
    await audit(req, user, "application.created", req.params.jobId);
    const employer = ObjectId.isValid(job.employerId) && req.app.locals.userCollection
      ? await req.app.locals.userCollection.findOne({ _id: new ObjectId(job.employerId) })
      : null;
    if (employer) {
      await createNotification(req.app, {
        userId: employer.uid,
        type: "jobs_new_application",
        title: "New application received",
        message: `${profile.title || user.displayName || user.username || "A candidate"} applied for ${job.title}.`,
        relatedId: result.insertedId.toString(),
      });
    }
    res.status(201).json({
      application: serializeJobDocument({
        ...application,
        _id: result.insertedId,
      }),
    });
  });
  router.patch("/applications/:id/withdraw", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    const application = await req.app.locals.jobApplicationCollection.findOne({
      _id: documentId(req.params.id),
      candidateId: userId(user),
    });
    if (!application) return res.status(404).json({ error: "not_found" });
    const now = new Date().toISOString();
    await req.app.locals.jobApplicationCollection.updateOne(
      { _id: application._id },
      {
        $set: { status: "withdrawn", updatedAt: now },
        $push: {
          statusHistory: {
            status: "withdrawn",
            at: now,
            actorId: userId(user),
          },
        },
      },
    );
    await audit(req, user, "application.withdrawn", req.params.id);
    res.json({ status: "withdrawn" });
  });
  router.patch("/applications/:id/archive", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    const application = await req.app.locals.jobApplicationCollection.findOne({
      _id: documentId(req.params.id),
      candidateId: userId(user),
    });
    if (!application) return res.status(404).json({ error: "not_found" });
    const candidateArchivedAt = new Date().toISOString();
    await req.app.locals.jobApplicationCollection.updateOne(
      { _id: application._id },
      { $set: { candidateArchivedAt } },
    );
    await audit(req, user, "application.archived", req.params.id);
    res.json({ candidateArchivedAt });
  });
  router.post("/employer/applications/:id/conversation", async (req, res) => {
    const user = await requireEmployer(req, res);
    if (!user) return;
    const application = await req.app.locals.jobApplicationCollection.findOne({
      _id: documentId(req.params.id),
    });
    if (!application || (!isAdmin(user) && application.employerId !== userId(user)))
      return res.status(404).json({ error: "not_found" });
    if (!isAdmin(user) && (await isCandidateBlockingEmployer(req, userId(user), application.candidateId)))
      return res.status(403).json({ error: "candidate_blocked", message: "This candidate has restricted employer access." });
    const candidate = req.app.locals.userCollection && ObjectId.isValid(application.candidateId)
      ? await req.app.locals.userCollection.findOne({ _id: new ObjectId(application.candidateId) })
      : null;
    if (!candidate) return res.status(404).json({ error: "candidate_not_found" });
    const employerId = user.uid;
    const candidateId = candidate.uid;
    const pair = [candidateId, employerId].sort().join(":");
    const pairKey = `jobs:${application._id.toString()}:${pair}`;
    let conversation = await req.app.locals.conversationCollection.findOne({ pairKey });
    if (!conversation) {
      const now = new Date();
      const document = {
        pairKey,
        contextType: "jobs",
        applicationId: application._id.toString(),
        jobId: application.jobId,
        jobTitle: application.jobTitle,
        buyerId: candidateId,
        buyerName: candidate?.displayName || candidate?.username || application.profileSnapshot?.title || "Candidate",
        sellerId: employerId,
        sellerName: user.displayName || user.username || application.company,
        participants: [candidateId, employerId],
        lastMessage: "",
        unreadBy: [],
        createdAt: now,
        updatedAt: now,
      };
      const result = await req.app.locals.conversationCollection.insertOne(document);
      conversation = { ...document, _id: result.insertedId };
    }
    res.status(200).json({ conversation: { ...conversation, _id: conversation._id.toString() } });
  });
  router.get("/employer/dashboard", async (req, res) => {
    const user = await requireEmployer(req, res);
    if (!user) return;
    const owner = userId(user);
    const jobs = await req.app.locals.jobCollection
      .find(isAdmin(user) ? {} : { employerId: owner })
      .sort({ createdAt: -1 })
      .toArray();
    let applications = await req.app.locals.jobApplicationCollection
      .find(isAdmin(user) ? {} : { employerId: owner })
      .sort({ createdAt: -1 })
      .toArray();
    if (!isAdmin(user)) {
      const ownCompany = await req.app.locals.jobCompanyCollection.findOne({ ownerId: owner });
      if (ownCompany) {
        const blockedByProfiles = await req.app.locals.jobProfileCollection
          .find({ blockedEmployerIds: ownCompany.slug })
          .toArray();
        const blockedCandidateIds = new Set(blockedByProfiles.map((profile: any) => profile.userId));
        applications = applications.filter((application: any) => !blockedCandidateIds.has(application.candidateId));
      }
    }
    const enrichedApplications = await enrichApplicationsWithCandidateProfiles(req, applications);
    const companies = await req.app.locals.jobCompanyCollection
      .find(isAdmin(user) ? {} : { ownerId: owner })
      .toArray();
    res.json({
      jobs: jobs.map(serializeJobDocument),
      applications: enrichedApplications.map(serializeJobDocument),
      companies: companies.map(serializeJobDocument),
    });
  });
  router.patch("/employer/applications/:id", async (req, res) => {
    const user = await requireEmployer(req, res);
    if (!user) return;
    const status = String(req.body?.status || "");
    if (!APPLICATION_STATUSES.includes(status) || status === "withdrawn")
      return res.status(400).json({ error: "invalid_status" });
    const application = await req.app.locals.jobApplicationCollection.findOne({
      _id: documentId(req.params.id),
    });
    if (
      !application ||
      (!isAdmin(user) && application.employerId !== userId(user))
    )
      return res.status(404).json({ error: "not_found" });
    if (!isAdmin(user) && (await isCandidateBlockingEmployer(req, userId(user), application.candidateId)))
      return res.status(403).json({ error: "candidate_blocked", message: "This candidate has restricted employer access." });
    const now = new Date().toISOString();
    await req.app.locals.jobApplicationCollection.updateOne(
      { _id: application._id },
      {
        $set: { status, updatedAt: now },
        $push: { statusHistory: { status, at: now, actorId: userId(user) } },
      },
    );
    await audit(req, user, "application.status_changed", req.params.id, {
      status,
    });
    const candidate = ObjectId.isValid(application.candidateId) && req.app.locals.userCollection
      ? await req.app.locals.userCollection.findOne({ _id: new ObjectId(application.candidateId) })
      : null;
    if (candidate) {
      await createNotification(req.app, {
        userId: candidate.uid,
        type: "jobs_application_status",
        title: "Application update",
        message: `Your application for ${application.jobTitle} is now "${status}".`,
        relatedId: application._id.toString(),
      });
    }
    res.json({ status });
  });
  router.patch("/employer/applications/:id/notes", async (req, res) => {
    const user = await requireEmployer(req, res);
    if (!user) return;
    const application = await req.app.locals.jobApplicationCollection.findOne({
      _id: documentId(req.params.id),
    });
    if (!application || (!isAdmin(user) && application.employerId !== userId(user)))
      return res.status(404).json({ error: "not_found" });
    const notes = String(req.body?.notes || "").slice(0, 4000);
    await req.app.locals.jobApplicationCollection.updateOne(
      { _id: application._id },
      { $set: { notes, notesUpdatedAt: new Date().toISOString() } },
    );
    await audit(req, user, "application.notes_updated", req.params.id);
    res.json({ notes });
  });
  router.post("/employer/applications/:id/interviews", async (req, res) => {
    const user = await requireEmployer(req, res);
    if (!user) return;
    const application = await req.app.locals.jobApplicationCollection.findOne({
      _id: documentId(req.params.id),
    });
    if (!application || (!isAdmin(user) && application.employerId !== userId(user)))
      return res.status(404).json({ error: "not_found" });
    if (!isAdmin(user) && (await isCandidateBlockingEmployer(req, userId(user), application.candidateId)))
      return res.status(403).json({ error: "candidate_blocked", message: "This candidate has restricted employer access." });
    const scheduledAt = new Date(String(req.body?.scheduledAt || ""));
    if (Number.isNaN(scheduledAt.getTime()) || scheduledAt.getTime() < Date.now() - 60_000)
      return res.status(400).json({ error: "invalid_schedule", message: "A valid, upcoming interview date and time is required." });
    const interview = {
      id: `interview-${Date.now().toString(36)}`,
      scheduledAt: scheduledAt.toISOString(),
      note: String(req.body?.note || "").trim().slice(0, 1000),
      createdAt: new Date().toISOString(),
      createdBy: userId(user),
    };
    await req.app.locals.jobApplicationCollection.updateOne(
      { _id: application._id },
      { $push: { interviews: interview } },
    );
    await audit(req, user, "application.interview_scheduled", req.params.id, { scheduledAt: interview.scheduledAt });
    const candidate = ObjectId.isValid(application.candidateId) && req.app.locals.userCollection
      ? await req.app.locals.userCollection.findOne({ _id: new ObjectId(application.candidateId) })
      : null;
    if (candidate) {
      await createNotification(req.app, {
        userId: candidate.uid,
        type: "jobs_interview_scheduled",
        title: "Interview scheduled",
        message: `${application.company} scheduled an interview for ${application.jobTitle}.`,
        relatedId: application._id.toString(),
      });
    }
    res.status(201).json({ interview });
  });
  router.delete("/employer/applications/:id/interviews/:interviewId", async (req, res) => {
    const user = await requireEmployer(req, res);
    if (!user) return;
    const application = await req.app.locals.jobApplicationCollection.findOne({
      _id: documentId(req.params.id),
    });
    if (!application || (!isAdmin(user) && application.employerId !== userId(user)))
      return res.status(404).json({ error: "not_found" });
    await req.app.locals.jobApplicationCollection.updateOne(
      { _id: application._id },
      { $pull: { interviews: { id: req.params.interviewId } } },
    );
    await audit(req, user, "application.interview_cancelled", req.params.id, { interviewId: req.params.interviewId });
    res.status(204).send();
  });
  router.get("/admin/review", async (req, res) => {
    const user = await requireEmployer(req, res);
    if (!user || !isAdmin(user))
      return user
        ? res.status(403).json({ error: "admin_required" })
        : undefined;
    const [jobs, companies, profiles] = await Promise.all([
      req.app.locals.jobCollection
        .find({ moderationStatus: "pending" })
        .sort({ createdAt: -1 })
        .toArray(),
      req.app.locals.jobCompanyCollection
        .find({ $or: [{ moderationStatus: "pending" }, { verificationStatus: "pending" }] })
        .sort({ verificationRequestedAt: -1 })
        .toArray(),
      req.app.locals.jobProfileCollection
        .find({ verificationStatus: "pending" })
        .sort({ verificationRequestedAt: -1 })
        .toArray(),
    ]);
    const profileUserIds = validObjectIds(profiles.map((profile: any) => profile.userId).filter(Boolean));
    const profileUsers = profileUserIds.length && req.app.locals.userCollection
      ? await req.app.locals.userCollection.find({ _id: { $in: profileUserIds } }).toArray()
      : [];
    const userById = new Map(profileUsers.map((candidate: any) => [candidate._id.toString(), candidate]));
    res.json({
      jobs: jobs.map(serializeJobDocument),
      companies: companies.map(serializeJobDocument),
      profiles: profiles.map((profile: any) => {
        const candidate: any = userById.get(profile.userId);
        return serializeJobDocument({
          ...profile,
          candidateName: candidate?.displayName || candidate?.username || profile.title || "Candidate",
          candidateAvatar: candidate?.avatar || profile.avatarConfirmationValue || "",
        });
      }),
    });
  });
  router.patch("/admin/jobs/:id/moderate", async (req, res) => {
    const user = await requireEmployer(req, res);
    if (!user || !isAdmin(user))
      return user
        ? res.status(403).json({ error: "admin_required" })
        : undefined;
    const moderationStatus = ["approved", "rejected"].includes(req.body?.status)
      ? req.body.status
      : "pending";
    const status = moderationStatus === "approved" ? "active" : "draft";
    await req.app.locals.jobCollection.updateOne(
      { slug: req.params.id },
      {
        $set: {
          moderationStatus,
          status,
          moderatedAt: new Date().toISOString(),
          moderatorId: userId(user),
        },
      },
    );
    await audit(req, user, "job.moderated", req.params.id, {
      moderationStatus,
    });
    res.json({ moderationStatus, status });
  });
  router.patch("/admin/companies/:id/moderate", async (req, res) => {
    const user = await requireEmployer(req, res);
    if (!user || !isAdmin(user))
      return user
        ? res.status(403).json({ error: "admin_required" })
        : undefined;
    const moderationStatus = ["approved", "rejected"].includes(req.body?.status)
      ? req.body.status
      : "pending";
    await req.app.locals.jobCompanyCollection.updateOne(
      { slug: req.params.id },
      {
        $set: {
          moderationStatus,
          moderatedAt: new Date().toISOString(),
          moderatorId: userId(user),
        },
      },
    );
    await audit(req, user, "company.moderated", req.params.id, {
      moderationStatus,
    });
    res.json({ moderationStatus });
  });
  router.patch("/admin/companies/:id/verify", async (req, res) => {
    const user = await requireEmployer(req, res);
    if (!user || !isAdmin(user))
      return user ? res.status(403).json({ error: "admin_required" }) : undefined;
    const verificationStatus = ["verified", "pi_kyb", "rejected"].includes(req.body?.status)
      ? req.body.status
      : "pending";
    await req.app.locals.jobCompanyCollection.updateOne(
      { slug: req.params.id },
      { $set: { verificationStatus, verified: ["verified", "pi_kyb"].includes(verificationStatus), verifiedAt: new Date().toISOString(), verifierId: userId(user) } },
    );
    await audit(req, user, "company.verification_reviewed", req.params.id, { verificationStatus });
    res.json({ verificationStatus });
  });
  router.patch("/admin/profiles/:userId/verify", async (req, res) => {
    const user = await requireEmployer(req, res);
    if (!user || !isAdmin(user))
      return user ? res.status(403).json({ error: "admin_required" }) : undefined;
    const verificationStatus = ["verified", "rejected"].includes(req.body?.status) ? req.body.status : "pending";
    await req.app.locals.jobProfileCollection.updateOne(
      { userId: req.params.userId },
      { $set: { verificationStatus, verifiedAt: new Date().toISOString(), verifierId: userId(user) } },
    );
    await audit(req, user, "candidate.verification_reviewed", req.params.userId, { verificationStatus });
    res.json({ verificationStatus });
  });
  router.get("/employer/candidates/search", async (req, res) => {
    const user = await requireEmployer(req, res);
    if (!user) return;
    const owner = userId(user);
    const query = String(req.query.q || "").trim();
    const location = String(req.query.location || "").trim();
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize) || 20));
    const skip = (page - 1) * pageSize;

    const company = await req.app.locals.jobCompanyCollection.findOne({ ownerId: owner });
    const blockedSlugs = company ? [company.slug] : [];
    const blockedByProfiles = await req.app.locals.jobProfileCollection
      .find({ blockedEmployerIds: { $in: blockedSlugs } })
      .toArray();
    const blockedCandidateIds = new Set(blockedByProfiles.map((profile: any) => profile.userId));

    const match: any = {};
    if (blockedCandidateIds.size) {
      match.userId = { $nin: Array.from(blockedCandidateIds) };
    }

    if (query) {
      match.$or = [
        { title: { $regex: query, $options: "i" } },
        { skills: { $regex: query, $options: "i" } },
        { summary: { $regex: query, $options: "i" } },
      ];
    }
    if (location) {
      match.location = { $regex: location, $options: "i" };
    }

    const total = await req.app.locals.jobProfileCollection.countDocuments(match);
    const profiles = await req.app.locals.jobProfileCollection
      .find(match)
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(pageSize)
      .toArray();

    const userIds = Array.from(new Set(profiles.map((p: any) => p.userId).filter(Boolean)));
    const users = userIds.length && req.app.locals.userCollection
      ? await req.app.locals.userCollection.find({ uid: { $in: userIds } }).toArray()
      : [];
    const userByUid = new Map(users.map((u: any) => [u.uid, u]));

    const results = profiles.map((profile: any) => {
      const candidate = userByUid.get(profile.userId) as any;
      return {
        userId: profile.userId,
        title: profile.title,
        skills: Array.isArray(profile.skills) ? profile.skills : profile.skills ? [profile.skills] : [],
        location: profile.location,
        availability: profile.availability,
        summary: profile.summary,
        portfolio: profile.portfolio,
        avatar: candidate?.avatar || profile.avatar || profile.avatarConfirmationValue || "",
        displayName: candidate?.displayName || candidate?.username || profile.title || "Candidate",
        verificationStatus: profile.verificationStatus,
        cv: profile.cv,
        employment: profile.employment || [],
        updatedAt: profile.updatedAt,
      };
    });

    res.json({
      candidates: results,
      pagination: { page, pageSize, total, pages: Math.max(1, Math.ceil(total / pageSize)) },
    });
  });
  router.get("/employer/candidates/:userId", async (req, res) => {
    const user = await requireEmployer(req, res);
    if (!user) return;
    const owner = userId(user);
    const candidateUserId = req.params.userId;

    const company = await req.app.locals.jobCompanyCollection.findOne({ ownerId: owner });
    const blockedSlugs = company ? [company.slug] : [];
    const profile = await req.app.locals.jobProfileCollection.findOne({
      userId: candidateUserId,
      blockedEmployerIds: { $nin: blockedSlugs },
    });
    if (!profile) return res.status(404).json({ error: "not_found" });

    const candidate = req.app.locals.userCollection
      ? (await req.app.locals.userCollection.findOne({ uid: candidateUserId })) as any
      : null;

    res.json({
      candidate: {
        userId: profile.userId,
        title: profile.title,
        skills: Array.isArray(profile.skills) ? profile.skills : profile.skills ? [profile.skills] : [],
        location: profile.location,
        availability: profile.availability,
        portfolio: profile.portfolio,
        summary: profile.summary,
        avatar: candidate?.avatar || profile.avatar || profile.avatarConfirmationValue || "",
        displayName: candidate?.displayName || candidate?.username || profile.title || "Candidate",
        verificationStatus: profile.verificationStatus,
        cv: profile.cv,
        employment: profile.employment || [],
        updatedAt: profile.updatedAt,
      },
    });
  });

  router.post("/employer/applications/:id/offer", async (req, res) => {
    const user = await requireEmployer(req, res);
    if (!user) return;
    const application = await req.app.locals.jobApplicationCollection.findOne({
      _id: documentId(req.params.id),
    });
    if (!application || (!isAdmin(user) && application.employerId !== userId(user)))
      return res.status(404).json({ error: "not_found" });
    if (!["reviewing", "shortlisted", "offer_sent"].includes(application.status))
      return res.status(409).json({ error: "invalid_transition", message: "Review or shortlist the candidate before sending an offer." });
    const amountPi = Number(req.body?.amountPi);
    if (!Number.isFinite(amountPi) || amountPi <= 0 || amountPi > 10_000_000)
      return res.status(400).json({ error: "invalid_amount", message: "Enter a valid compensation amount in Pi." });
    const period = ["hour", "day", "week", "month", "year", "project"].includes(req.body?.period)
      ? req.body.period : "project";
    const startDate = String(req.body?.startDate || "").trim();
    if (startDate && Number.isNaN(new Date(startDate).getTime()))
      return res.status(400).json({ error: "invalid_start_date" });
    const now = new Date().toISOString();
    const offer = {
      offerId: `job-offer-${Date.now().toString(36)}`,
      amountPi,
      period,
      startDate: startDate || undefined,
      terms: String(req.body?.terms || "").trim().slice(0, 4000),
      status: "sent",
      sentAt: now,
      sentBy: userId(user),
    };
    await req.app.locals.jobApplicationCollection.updateOne(
      { _id: application._id },
      { $set: { offer, status: "offer_sent", updatedAt: now }, $push: { statusHistory: { status: "offer_sent", at: now, actorId: userId(user) } } },
    );
    await audit(req, user, "application.offer_sent", req.params.id, { amountPi, period });
    const candidate = ObjectId.isValid(application.candidateId) && req.app.locals.userCollection
      ? await req.app.locals.userCollection.findOne({ _id: new ObjectId(application.candidateId) })
      : await req.app.locals.userCollection?.findOne({ uid: application.candidateId });
    if (candidate) await createNotification(req.app, {
      userId: candidate.uid,
      type: "jobs_offer_received",
      title: "Job offer received",
      message: `${application.company} sent you an offer for ${application.jobTitle}.`,
      relatedId: application._id.toString(),
    });
    res.status(201).json({ offer, status: "offer_sent" });
  });

  router.patch("/applications/:id/offer", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    const decision = String(req.body?.decision || "");
    if (!["accepted", "declined"].includes(decision))
      return res.status(400).json({ error: "invalid_decision" });
    const application = await req.app.locals.jobApplicationCollection.findOne({
      _id: documentId(req.params.id), candidateId: userId(user),
    });
    if (!application?.offer || application.offer.status !== "sent")
      return res.status(409).json({ error: "offer_unavailable", message: "This offer is no longer available." });
    const now = new Date().toISOString();
    const status = decision === "accepted" ? "hired" : "rejected";
    await req.app.locals.jobApplicationCollection.updateOne(
      { _id: application._id, "offer.status": "sent" },
      { $set: { "offer.status": decision, "offer.respondedAt": now, status, updatedAt: now }, $push: { statusHistory: { status, at: now, actorId: userId(user) } } },
    );
    await audit(req, user, `application.offer_${decision}`, req.params.id);
    const employer = ObjectId.isValid(application.employerId) && req.app.locals.userCollection
      ? await req.app.locals.userCollection.findOne({ _id: new ObjectId(application.employerId) })
      : null;
    if (employer) await createNotification(req.app, {
      userId: employer.uid,
      type: "jobs_offer_response",
      title: `Offer ${decision}`,
      message: `The candidate ${decision} your offer for ${application.jobTitle}.`,
      relatedId: application._id.toString(),
    });
    res.json({ status, offerStatus: decision });
  });

  router.post("/employer/applications/:id/payments", async (req, res) => {
    const user = await requireEmployer(req, res);
    if (!user) return;
    const application = await req.app.locals.jobApplicationCollection.findOne({ _id: documentId(req.params.id) });
    if (!application || (!isAdmin(user) && application.employerId !== userId(user)))
      return res.status(404).json({ error: "not_found" });
    if (application.status !== "hired" || application.offer?.status !== "accepted")
      return res.status(409).json({ error: "not_hired", message: "An accepted offer is required before recording salary." });
    const amountPi = Number(req.body?.amountPi);
    const txid = String(req.body?.txid || "").trim().slice(0, 200);
    if (!Number.isFinite(amountPi) || amountPi <= 0 || !txid)
      return res.status(400).json({ error: "invalid_payment", message: "Amount and Pi transaction ID are required." });
    if (await req.app.locals.jobPaymentCollection.findOne({ txid }))
      return res.status(409).json({ error: "duplicate_txid", message: "This transaction ID is already recorded." });
    const now = new Date().toISOString();
    const payment = {
      paymentRecordId: `job-pay-${Date.now().toString(36)}`,
      applicationId: application._id.toString(),
      jobId: application.jobId,
      employerId: application.employerId,
      candidateId: application.candidateId,
      amountPi,
      txid,
      note: String(req.body?.note || "").trim().slice(0, 1000),
      status: "awaiting_candidate_confirmation",
      createdAt: now,
      updatedAt: now,
    };
    await req.app.locals.jobPaymentCollection.insertOne(payment);
    await audit(req, user, "salary.recorded", payment.paymentRecordId, { amountPi, txid });
    const candidate = ObjectId.isValid(application.candidateId) && req.app.locals.userCollection
      ? await req.app.locals.userCollection.findOne({ _id: new ObjectId(application.candidateId) })
      : await req.app.locals.userCollection?.findOne({ uid: application.candidateId });
    if (candidate) await createNotification(req.app, {
      userId: candidate.uid,
      type: "jobs_salary_recorded",
      title: "Salary payment recorded",
      message: `${application.company} recorded a payment of ${amountPi} Pi. Confirm it after checking your wallet.`,
      relatedId: payment.paymentRecordId,
    });
    res.status(201).json({ payment });
  });

  router.get("/applications/:id/payments", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    const application = await req.app.locals.jobApplicationCollection.findOne({ _id: documentId(req.params.id) });
    if (!application || (!isAdmin(user) && application.candidateId !== userId(user) && application.employerId !== userId(user)))
      return res.status(404).json({ error: "not_found" });
    const payments = await req.app.locals.jobPaymentCollection.find({ applicationId: application._id.toString() }).sort({ createdAt: -1 }).toArray();
    res.json({ payments: payments.map(serializeJobDocument) });
  });

  router.patch("/applications/:applicationId/payments/:paymentId", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    const application = await req.app.locals.jobApplicationCollection.findOne({
      _id: documentId(req.params.applicationId), candidateId: userId(user),
    });
    if (!application) return res.status(404).json({ error: "not_found" });
    const payment = await req.app.locals.jobPaymentCollection.findOne({
      paymentRecordId: req.params.paymentId, applicationId: application._id.toString(),
    });
    if (!payment || payment.status !== "awaiting_candidate_confirmation")
      return res.status(409).json({ error: "payment_unavailable" });
    const action = String(req.body?.action || "");
    if (!["confirm", "dispute"].includes(action))
      return res.status(400).json({ error: "invalid_action" });
    const now = new Date().toISOString();
    if (action === "confirm") {
      await req.app.locals.jobPaymentCollection.updateOne(
        { paymentRecordId: payment.paymentRecordId },
        { $set: { status: "completed", confirmedAt: now, updatedAt: now } },
      );
      await audit(req, user, "salary.confirmed", payment.paymentRecordId);
      const employer = ObjectId.isValid(application.employerId) && req.app.locals.userCollection
        ? await req.app.locals.userCollection.findOne({ _id: new ObjectId(application.employerId) })
        : null;
      if (employer) await createNotification(req.app, {
        userId: employer.uid,
        type: "jobs_salary_confirmed",
        title: "Salary payment confirmed",
        message: `The candidate confirmed receipt of ${payment.amountPi} Pi.`,
        relatedId: payment.paymentRecordId,
      });
      return res.json({ status: "completed" });
    }
    const reason = String(req.body?.reason || "").trim().slice(0, 2000);
    if (reason.length < 10)
      return res.status(400).json({ error: "reason_required", message: "Explain the payment problem in at least 10 characters." });
    const dispute = {
      disputeId: `job-dispute-${Date.now().toString(36)}`,
      paymentRecordId: payment.paymentRecordId,
      applicationId: application._id.toString(),
      candidateId: application.candidateId,
      employerId: application.employerId,
      reason,
      status: "open",
      createdAt: now,
      updatedAt: now,
    };
    await req.app.locals.jobDisputeCollection.insertOne(dispute);
    await req.app.locals.jobPaymentCollection.updateOne(
      { paymentRecordId: payment.paymentRecordId },
      { $set: { status: "disputed", disputeId: dispute.disputeId, updatedAt: now } },
    );
    await audit(req, user, "salary.disputed", payment.paymentRecordId, { disputeId: dispute.disputeId });
    const employer = ObjectId.isValid(application.employerId) && req.app.locals.userCollection
      ? await req.app.locals.userCollection.findOne({ _id: new ObjectId(application.employerId) })
      : null;
    if (employer) await createNotification(req.app, {
      userId: employer.uid,
      type: "jobs_salary_disputed",
      title: "Salary payment disputed",
      message: "A candidate disputed a recorded salary transaction. The case is awaiting admin review.",
      relatedId: dispute.disputeId,
    });
    res.status(201).json({ status: "disputed", dispute });
  });

  router.get("/admin/disputes", async (req, res) => {
    const user = await requireEmployer(req, res);
    if (!user || !isAdmin(user)) return user ? res.status(403).json({ error: "admin_required" }) : undefined;
    const disputes = await req.app.locals.jobDisputeCollection.find({}).sort({ createdAt: -1 }).toArray();
    res.json({ disputes: disputes.map(serializeJobDocument) });
  });

  router.patch("/admin/disputes/:id", async (req, res) => {
    const user = await requireEmployer(req, res);
    if (!user || !isAdmin(user)) return user ? res.status(403).json({ error: "admin_required" }) : undefined;
    const status = String(req.body?.status || "");
    const outcome = String(req.body?.outcome || "");
    if (!["resolved", "closed"].includes(status)) return res.status(400).json({ error: "invalid_status" });
    if (status === "resolved" && !["payment_confirmed", "payment_voided"].includes(outcome))
      return res.status(400).json({ error: "invalid_outcome", message: "Choose whether the payment was confirmed or voided." });
    const dispute = await req.app.locals.jobDisputeCollection.findOne({ disputeId: req.params.id });
    if (!dispute) return res.status(404).json({ error: "not_found" });
    const now = new Date().toISOString();
    await req.app.locals.jobDisputeCollection.updateOne(
      { disputeId: dispute.disputeId },
      { $set: { status, resolution: String(req.body?.resolution || "").trim().slice(0, 2000), resolvedAt: now, resolvedBy: userId(user), updatedAt: now } },
    );
    const paymentStatus = status === "resolved"
      ? (outcome === "payment_confirmed" ? "completed" : "voided")
      : "disputed";
    await req.app.locals.jobPaymentCollection.updateOne(
      { paymentRecordId: dispute.paymentRecordId },
      { $set: { status: paymentStatus, resolution: String(req.body?.resolution || "").trim().slice(0, 2000), updatedAt: now } },
    );
    await audit(req, user, "salary.dispute_resolved", dispute.paymentRecordId, { disputeId: dispute.disputeId, status, outcome });
    const participantIds = [dispute.candidateId, dispute.employerId].filter((id: string) => ObjectId.isValid(id));
    if (participantIds.length && req.app.locals.userCollection) {
      const participants = await req.app.locals.userCollection.find({ _id: { $in: participantIds.map((id: string) => new ObjectId(id)) } }).toArray();
      await Promise.all(participants.map((participant: any) => createNotification(req.app, {
        userId: participant.uid,
        type: "jobs_salary_dispute_resolved",
        title: "Salary dispute reviewed",
        message: outcome === "payment_confirmed" ? "The salary transaction was confirmed." : "The salary transaction record was voided.",
        relatedId: dispute.disputeId,
      })));
    }
    res.json({ status, outcome, paymentStatus });
  });
  router.get("/earnings", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    const owner = userId(user);
    const applications = await req.app.locals.jobApplicationCollection
      .find({ candidateId: owner })
      .sort({ createdAt: -1 })
      .toArray();
    const jobSlugs = Array.from(new Set(applications.map((a: any) => a.jobId).filter(Boolean)));
    const jobs = jobSlugs.length
      ? await req.app.locals.jobCollection.find({ slug: { $in: jobSlugs } }).toArray()
      : [];
    const jobBySlug = new Map<string, any>(jobs.map((job: any) => [job.slug, job]));
    const payments = await req.app.locals.jobPaymentCollection
      .find({ candidateId: owner })
      .sort({ createdAt: -1 })
      .toArray();
    const paymentsByApplication = new Map<string, any[]>();
    for (const payment of payments) {
      const list = paymentsByApplication.get(payment.applicationId) || [];
      list.push(payment);
      paymentsByApplication.set(payment.applicationId, list);
    }
    const items = applications.map((application: any) => {
      const job = jobBySlug.get(application.jobId);
      const minUsdt = Number(job?.compensationMinUsdt || 0);
      const maxUsdt = Number(job?.compensationMaxUsdt || minUsdt || 0);
      const period = String(job?.compensationPeriod || "project");
      const minPi = minUsdt > 0 ? minUsdt / PI_USDT_RATE : 0;
      const maxPi = maxUsdt > 0 ? maxUsdt / PI_USDT_RATE : 0;
      const agreedPi = maxPi >= minPi && maxPi > 0 ? maxPi : minPi;
      const status = application.status === "hired" ? "hired" : application.status;
      const salaryPayments = paymentsByApplication.get(application._id.toString()) || [];
      const completedPi = salaryPayments
        .filter((payment: any) => payment.status === "completed")
        .reduce((sum: number, payment: any) => sum + Number(payment.amountPi || 0), 0);
      const pendingPi = salaryPayments
        .filter((payment: any) => ["awaiting_candidate_confirmation", "disputed"].includes(payment.status))
        .reduce((sum: number, payment: any) => sum + Number(payment.amountPi || 0), 0);
      return {
        applicationId: application._id.toString(),
        jobId: application.jobId,
        jobTitle: application.jobTitle,
        company: application.company,
        status,
        agreedCompensationPi: agreedPi,
        compensationMinPi: minPi,
        compensationMaxPi: maxPi,
        period,
        piRateUsed: PI_USDT_RATE,
        completedPaymentsPi: completedPi,
        pendingPaymentsPi: pendingPi,
        payments: salaryPayments.map(serializeJobDocument),
        offer: application.offer,
        createdAt: application.createdAt,
        updatedAt: application.updatedAt,
      };
    });
    const hired = items.filter((item: any) => item.status === "hired");
    const completedPaymentsPi = items.reduce((sum: number, item: any) => sum + item.completedPaymentsPi, 0);
    const pendingEarningsPi = items.reduce((sum: number, item: any) => sum + item.pendingPaymentsPi, 0);
    const summary = {
      totalEarnedPi: completedPaymentsPi,
      pendingEarningsPi,
      completedPaymentsPi,
      hiredCount: hired.length,
      applicationsCount: items.length,
    };
    res.json({ items, summary, serverTime: new Date().toISOString() });
  });

  router.get("/employer/payments", async (req, res) => {
    const user = await requireEmployer(req, res);
    if (!user) return;
    const owner = userId(user);
    const intents = await req.app.locals.jobBillingCollection
      .find({ employerId: owner })
      .sort({ createdAt: -1 })
      .toArray();
    const payments = intents.map((intent: any) => ({
      billingId: intent.billingId,
      planId: intent.id,
      planName: intent.name,
      amountPi: Number(intent.pricePi) || 0,
      amountUsdt: Number(intent.priceUsdt) || 0,
      piRateUsed: Number(intent.piRateUsed) || PI_USDT_RATE,
      status: intent.status,
      paymentId: intent.paymentId || "",
      txid: intent.paymentTxid || "",
      jobId: intent.jobId || undefined,
      createdAt: intent.createdAt,
      paidAt: intent.paidAt || null,
      updatedAt: intent.updatedAt || intent.createdAt,
    }));
    const summary = payments.reduce((totals: { total: number; paid: number; pending: number; cancelled: number }, payment: any) => {
      totals.total += payment.amountPi;
      if (payment.status === "paid") totals.paid += payment.amountPi;
      else if (payment.status === "processing" || payment.status === "pending_payment") totals.pending += payment.amountPi;
      else if (payment.status === "cancelled") totals.cancelled += payment.amountPi;
      return totals;
    }, { total: 0, paid: 0, pending: 0, cancelled: 0 });
    res.json({ payments, summary, serverTime: new Date().toISOString() });
  });
}
