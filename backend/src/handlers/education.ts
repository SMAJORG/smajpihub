import type { Request, Response, Router } from "express";
import { ObjectId } from "mongodb";
import { resolveCurrentUser } from "../services/auth";
import { PI_USDT_RATE, piFromUsdt } from "../services/piPricing";
import { platformAPIKeyClient } from "../services/platformAPIClient";
import { verifyAccountIncomingPayment, bindPayment } from "../services/financialIntegrity";
import { createNotification } from "../services/notifications";
import {
  UniversityData,
  UniversityProgramData,
  UniversityClaimData,
  UniversityApplicationData,
  UniversityPaymentData,
  UniversityRecognitionStatus,
  UniversityClaimStatus,
  UniversityApplicationStatus,
  UniversityPaymentStatus,
  UniversityPaymentPurpose,
  UniversityServiceAuthorization,
  UniversityInstitutionType,
} from "../types/education";
import {
  createDemoProvider,
  type UniversityDataProvider,
} from "../services/educationDataProvider";
import axios from "axios";

const serialize = (document: Record<string, any> | null) => {
  if (!document) return null;
  const { _id, ...rest } = document;
  return {
    ...rest,
    id: _id?.toString?.() || document.id || String(document._id),
  };
};

const safeString = (value: unknown, fallback = "") =>
  String(value || fallback).trim();
const safeNumber = (value: unknown, fallback = 0) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};
const safeDate = (value: unknown): string => {
  if (!value) return new Date().toISOString();
  return new Date(value as any).toISOString();
};
const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

let provider: UniversityDataProvider | null = null;
const getProvider = (): UniversityDataProvider => {
  if (!provider) {
    provider = createDemoProvider();
  }
  return provider;
};

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const requireUser = async (req: Request, res: Response) => {
  const currentUser = await resolveCurrentUser(req);
  if (!currentUser) {
    res
      .status(401)
      .json({ error: "unauthorized", message: "User needs to sign in first" });
    return null;
  }
  return currentUser;
};

const requireAdmin = async (req: Request, res: Response) => {
  const currentUser = await resolveCurrentUser(req);
  if (!currentUser) {
    res
      .status(401)
      .json({ error: "unauthorized", message: "User needs to sign in first" });
    return null;
  }
  if (currentUser.role !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return null;
  }
  return currentUser;
};

const isDemo = (university: UniversityData) => Boolean(university.is_demo);
const isPartner = (university: UniversityData) =>
  university.partnership_status === "smaj_verified_partner";
const isPiEnabled = (university: UniversityData) =>
  isPartner(university) && university.pi_payments_enabled;
const isApplicationsEnabled = (university: UniversityData) =>
  isPartner(university) && university.applications_enabled;

const ensureServiceAuthorization = (
  university: UniversityData,
): UniversityServiceAuthorization => ({
  applications_enabled:
    university.applications_enabled && isPartner(university),
  pi_payments_enabled: university.pi_payments_enabled && isPartner(university),
  payment_categories: isPiEnabled(university)
    ? ["application_fee", "registration_fee", "tuition_deposit", "other"]
    : [],
});

const validInstitutionTypes: UniversityInstitutionType[] = [
  "public",
  "private",
  "research",
  "polytechnic",
  "college",
  "institute",
  "academy",
  "other",
];
const validRecognitionStatuses: UniversityRecognitionStatus[] = [
  "directory",
  "recognition_verified",
  "partnership_pending",
  "smaj_verified_partner",
  "partnership_suspended",
];
const validClaimStatuses: UniversityClaimStatus[] = [
  "pending",
  "additional_information_required",
  "approved",
  "rejected",
];
const validApplicationStatuses: UniversityApplicationStatus[] = [
  "draft",
  "submitted",
  "payment_pending",
  "under_review",
  "additional_documents_required",
  "accepted",
  "rejected",
  "waitlisted",
  "withdrawn",
];
const validPaymentStatuses: UniversityPaymentStatus[] = [
  "pending",
  "processing",
  "paid",
  "cancelled",
  "failed",
  "refunded",
];
const validPaymentPurposes: UniversityPaymentPurpose[] = [
  "application_fee",
  "registration_fee",
  "admission_deposit",
  "course_fee",
  "tuition_deposit",
  "tuition",
  "other",
];

const generateId = () => new ObjectId().toString();
const generateApplicationId = () =>
  `APP-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
const generatePaymentId = () =>
  `EDU-PAY-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

const ensureSeedUniversities = async (req: Request) => {
  if (req.app.locals.commerceMode === "mainnet") return;
  const collection = req.app.locals.universityCollection;
  if (!collection) return;
  const count = await collection.countDocuments({});
  if (count > 0) return;
  const now = new Date();
  const demoUniversities = [
    {
      slug: "global-institute-of-technology",
      official_name: "Global Institute of Technology",
      short_name: "GIT",
      description:
        "A demo institution for platform development and UI verification.",
      institution_type: "research",
      country: "United States",
      country_code: "US",
      city: "San Francisco",
      state_region: "California",
      official_website: "https://example.edu",
      contact_email: "info@example.edu",
      languages: ["English"],
      recognition_status: "directory",
      recognition_authority: "Demo Authority",
      external_ids: [{ provider: "demo", id: "git-001" }],
      partnership_status: "directory",
      pi_payments_enabled: false,
      applications_enabled: false,
      profile_claimed: false,
      data_last_verified_at: now.toISOString(),
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
      is_demo: true,
    },
    {
      slug: "pioneer-academy-of-sciences",
      official_name: "Pioneer Academy of Sciences",
      short_name: "PAS",
      description: "Another demo institution for UI development.",
      institution_type: "public",
      country: "United Kingdom",
      country_code: "GB",
      city: "London",
      official_website: "https://example.ac.uk",
      contact_email: "info@example.ac.uk",
      languages: ["English"],
      recognition_status: "recognition_verified",
      recognition_authority: "Demo UK Authority",
      external_ids: [{ provider: "demo", id: "pas-002" }],
      partnership_status: "directory",
      pi_payments_enabled: false,
      applications_enabled: false,
      profile_claimed: false,
      data_last_verified_at: now.toISOString(),
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
      is_demo: true,
    },
    {
      slug: "african-leadership-university",
      official_name: "African Leadership University",
      short_name: "ALU",
      description: "Demo African university for development testing.",
      institution_type: "private",
      country: "Rwanda",
      country_code: "RW",
      city: "Kigali",
      official_website: "https://example.aluedu.org",
      contact_email: "info@example.aluedu.org",
      languages: ["English", "French"],
      recognition_status: "recognition_verified",
      recognition_authority: "Demo Rwanda Authority",
      external_ids: [{ provider: "demo", id: "alu-003" }],
      partnership_status: "partnership_pending",
      partner_since: now.toISOString(),
      pi_payments_enabled: false,
      applications_enabled: false,
      profile_claimed: true,
      claimed_by_user_id: "demo-user",
      data_last_verified_at: now.toISOString(),
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
      is_demo: true,
    },
  ];
  await collection.insertMany(demoUniversities);
};

export default function mountEducationEndpoints(router: Router) {
  router.use((_, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });

  router.get("/universities", async (req, res) => {
    try {
      const query = safeString((req.query.q as string) || "");
      const country = safeString((req.query.country as string) || "");
      const city = safeString((req.query.city as string) || "");
      const institutionType = safeString(
        (req.query.institution_type as string) || "",
      );
      const partnership = safeString((req.query.partnership as string) || "");
      const page = clamp(safeNumber(req.query.page, 1), 1, 1000);
      const pageSize = clamp(safeNumber(req.query.limit, 20), 1, 100);

      if (partnership !== "smaj_verified_partner") {
        const countryCode = /^[a-z]{2}$/i.test(country)
          ? country.toUpperCase()
          : "";
        const directoryType =
          institutionType === "other" ? "other" : "education";
        const providerSearch = [query, city, countryCode ? "" : country]
          .filter(Boolean)
          .join(" ");
        const filters = [
          `type:${directoryType}`,
          ...(countryCode ? [`country_code:${countryCode}`] : []),
        ];
        const live = await axios.get("https://api.openalex.org/institutions", {
          params: {
            api_key: process.env.OPENALEX_API_KEY || undefined,
            search: providerSearch || undefined,
            filter: filters.join(","),
            page,
            per_page: pageSize,
          },
          timeout: 10000,
        });
        const universities = (live.data.results || []).map((item: any) => ({
          id: String(item.id).split("/").pop(),
          slug: `openalex-${(String(item.id).split("/").pop() || "unknown").toLowerCase()}`,
          official_name: item.display_name,
          short_name: item.display_name_acronyms?.[0],
          logo_url: item.image_url,
          institution_type: item.type || "education",
          country: item.geo?.country || "",
          country_code: item.country_code || "",
          city: item.geo?.city || "",
          state_region: item.geo?.region || "",
          latitude: item.geo?.latitude,
          longitude: item.geo?.longitude,
          official_website: item.homepage_url,
          recognition_status: "directory",
          external_ids: [
            { provider: "openalex", id: item.id },
            ...(item.ror ? [{ provider: "ror", id: item.ror }] : []),
          ],
          partnership_status: "directory",
          pi_payments_enabled: false,
          applications_enabled: false,
          profile_claimed: false,
          data_last_verified_at: item.updated_date,
          created_at: item.created_date,
          updated_at: item.updated_date,
          is_demo: false,
        }));
        return res.json({
          universities,
          total: live.data.meta?.count || universities.length,
          page,
          pageSize,
          totalPages: Math.ceil(
            (live.data.meta?.count || universities.length) / pageSize,
          ),
          source: "openalex",
        });
      }

      const collection = req.app.locals.universityCollection;
      if (!collection) {
        const providerResults = await getProvider().searchInstitutions(
          query,
          country || undefined,
          100,
        );
        return res.status(200).json({
          universities: providerResults.map(serialize),
          source: "demo_provider",
          total: providerResults.length,
        });
      }

      await ensureSeedUniversities(req);

      const mongoQuery: Record<string, any> = {};
      if (query) {
        mongoQuery.$or = [
          { official_name: { $regex: query, $options: "i" } },
          { short_name: { $regex: query, $options: "i" } },
          { city: { $regex: query, $options: "i" } },
          { country: { $regex: query, $options: "i" } },
        ];
      }
      if (country) mongoQuery.country = { $regex: country, $options: "i" };
      if (city) mongoQuery.city = { $regex: city, $options: "i" };
      if (
        institutionType &&
        validInstitutionTypes.includes(
          institutionType as UniversityInstitutionType,
        )
      ) {
        mongoQuery.institution_type = institutionType;
      }
      if (partnership === "smaj_verified_partner") {
        mongoQuery.partnership_status = "smaj_verified_partner";
      } else if (partnership === "directory") {
        mongoQuery.partnership_status = "directory";
      }

      const [universities, total] = await Promise.all([
        collection
          .find(mongoQuery)
          .sort({ updated_at: -1 })
          .skip((page - 1) * pageSize)
          .limit(pageSize)
          .toArray(),
        collection.countDocuments(mongoQuery),
      ]);

      return res.status(200).json({
        universities: universities.map(serialize),
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      });
    } catch (error: any) {
      return res.status(500).json({
        error: "server_error",
        message: error.message || "Failed to load universities",
      });
    }
  });

  router.get("/universities/:idOrSlug", async (req, res) => {
    try {
      const { idOrSlug } = req.params;
      const collection = req.app.locals.universityCollection;
      if (idOrSlug.startsWith("openalex-")) {
        const openAlexId = idOrSlug.slice(9).toUpperCase();
        const { data: item } = await axios.get(
          `https://api.openalex.org/institutions/${openAlexId}`,
          {
            params: { api_key: process.env.OPENALEX_API_KEY || undefined },
            timeout: 10000,
          },
        );
        return res.json({
          university: {
            id: openAlexId,
            slug: idOrSlug,
            official_name: item.display_name,
            short_name: item.display_name_acronyms?.[0],
            logo_url: item.image_url,
            institution_type: "other",
            country: item.geo?.country || "",
            country_code: item.country_code || "",
            city: item.geo?.city || "",
            state_region: item.geo?.region || "",
            official_website: item.homepage_url,
            recognition_status: "directory",
            external_ids: [{ provider: "openalex", id: item.id }],
            partnership_status: "directory",
            pi_payments_enabled: false,
            applications_enabled: false,
            profile_claimed: false,
            data_last_verified_at: item.updated_date,
            created_at: item.created_date,
            updated_at: item.updated_date,
            is_demo: false,
          },
          programs: [],
          authorization: {
            applications_enabled: false,
            pi_payments_enabled: false,
            payment_categories: [],
          },
          source: "openalex",
        });
      }
      if (!collection) {
        const providerResult = await getProvider().getInstitution(idOrSlug);
        return res.status(200).json({
          university: serialize(providerResult),
          source: "demo_provider",
        });
      }

      let university: UniversityData | null = null;
      if (ObjectId.isValid(idOrSlug)) {
        university = (await collection.findOne({
          _id: new ObjectId(idOrSlug),
        })) as UniversityData | null;
      }
      if (!university) {
        university = (await collection.findOne({
          slug: idOrSlug,
        })) as UniversityData | null;
      }
      if (!university) {
        return res
          .status(404)
          .json({ error: "not_found", message: "University not found" });
      }

      const programsCollection = req.app.locals.universityProgramCollection;
      const programs = programsCollection
        ? await programsCollection
            .find({ university_id: university._id.toString() })
            .sort({ created_at: -1 })
            .toArray()
        : [];

      return res.status(200).json({
        university: serialize(university),
        programs: programs.map(serialize),
        authorization: ensureServiceAuthorization(university),
      });
    } catch (error: any) {
      return res.status(500).json({
        error: "server_error",
        message: error.message || "Failed to load university",
      });
    }
  });

  router.post("/universities", async (req, res) => {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    try {
      const body = req.body || {};
      const slug = slugify(
        safeString(body.official_name || body.name, "unknown"),
      );
      const university: UniversityData = {
        _id: new ObjectId(),
        slug: slug || generateId(),
        official_name: safeString(body.official_name || body.name),
        short_name: safeString(body.short_name),
        local_name: safeString(body.local_name),
        logo_url: safeString(body.logo_url),
        cover_image_url: safeString(body.cover_image_url),
        brand_primary_color: /^#[0-9a-f]{6}$/i.test(safeString(body.brand_primary_color))
          ? safeString(body.brand_primary_color).toUpperCase()
          : undefined,
        description: safeString(body.description),
        institution_type: validInstitutionTypes.includes(body.institution_type)
          ? body.institution_type
          : "other",
        founded_year: body.founded_year
          ? safeNumber(body.founded_year)
          : undefined,
        country: safeString(body.country),
        country_code:
          safeString(body.country_code).toUpperCase().slice(0, 2) || "US",
        state_region: safeString(body.state_region),
        city: safeString(body.city),
        address: safeString(body.address),
        postal_code: safeString(body.postal_code),
        latitude: body.latitude ? safeNumber(body.latitude) : undefined,
        longitude: body.longitude ? safeNumber(body.longitude) : undefined,
        official_website: safeString(body.official_website),
        admissions_website: safeString(body.admissions_website),
        contact_email: safeString(body.contact_email),
        contact_phone: safeString(body.contact_phone),
        languages: Array.isArray(body.languages)
          ? body.languages.map((l: unknown) => safeString(l)).filter(Boolean)
          : [],
        recognition_status: validRecognitionStatuses.includes(
          body.recognition_status,
        )
          ? body.recognition_status
          : "directory",
        recognition_authority: safeString(body.recognition_authority),
        external_ids: Array.isArray(body.external_ids) ? body.external_ids : [],
        whed_id: safeString(body.whed_id),
        partnership_status: validRecognitionStatuses.includes(
          body.partnership_status,
        )
          ? body.partnership_status
          : "directory",
        partner_since: body.partner_since,
        pi_payments_enabled: Boolean(body.pi_payments_enabled),
        applications_enabled: Boolean(body.applications_enabled),
        profile_claimed: Boolean(body.profile_claimed),
        claimed_by_user_id: safeString(body.claimed_by_user_id),
        data_last_verified_at: safeDate(body.data_last_verified_at),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        is_demo: Boolean(body.is_demo),
      };

      const collection = req.app.locals.universityCollection;
      if (!collection) throw new Error("University collection not available");
      const result = await collection.insertOne(university);
      const created = await collection.findOne({ _id: result.insertedId });
      return res.status(201).json({
        university: serialize(created),
        message: "University created",
      });
    } catch (error: any) {
      return res
        .status(400)
        .json({ error: "bad_request", message: error.message });
    }
  });

  router.patch("/universities/:idOrSlug", async (req, res) => {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    try {
      const body = req.body || {};
      const collection = req.app.locals.universityCollection;
      if (!collection) throw new Error("University collection not available");

      let university: UniversityData | null = null;
      if (ObjectId.isValid(req.params.idOrSlug)) {
        university = (await collection.findOne({
          _id: new ObjectId(req.params.idOrSlug),
        })) as UniversityData | null;
      }
      if (!university) {
        university = (await collection.findOne({
          slug: req.params.idOrSlug,
        })) as UniversityData | null;
      }
      if (!university)
        return res
          .status(404)
          .json({ error: "not_found", message: "University not found" });

      const updates: Record<string, any> = {
        updated_at: new Date().toISOString(),
      };
      const updatable = [
        "official_name",
        "short_name",
        "local_name",
        "logo_url",
        "cover_image_url",
        "brand_primary_color",
        "description",
        "institution_type",
        "founded_year",
        "country",
        "country_code",
        "state_region",
        "city",
        "address",
        "postal_code",
        "latitude",
        "longitude",
        "official_website",
        "admissions_website",
        "contact_email",
        "contact_phone",
        "languages",
        "recognition_status",
        "recognition_authority",
        "external_ids",
        "whed_id",
        "partnership_status",
        "partner_since",
        "pi_payments_enabled",
        "applications_enabled",
        "profile_claimed",
        "claimed_by_user_id",
        "data_last_verified_at",
      ];

      for (const key of updatable) {
        if (body[key] !== undefined) {
          if (
            key === "institution_type" &&
            !validInstitutionTypes.includes(body[key])
          )
            continue;
          if (
            key === "recognition_status" &&
            !validRecognitionStatuses.includes(body[key])
          )
            continue;
          if (
            key === "partnership_status" &&
            !validRecognitionStatuses.includes(body[key])
          )
            continue;
          if (key === "languages" && !Array.isArray(body[key])) continue;
          if (key === "external_ids" && !Array.isArray(body[key])) continue;
          if (
            key === "brand_primary_color" &&
            !/^#[0-9a-f]{6}$/i.test(safeString(body[key]))
          )
            continue;
          if (key === "brand_primary_color") {
            updates[key] = safeString(body[key]).toUpperCase();
            continue;
          }
          updates[key] = body[key];
        }
      }

      await collection.updateOne({ _id: university._id }, { $set: updates });
      const updated = await collection.findOne({ _id: university._id });
      return res.status(200).json({
        university: serialize(updated),
        message: "University updated",
      });
    } catch (error: any) {
      return res
        .status(400)
        .json({ error: "bad_request", message: error.message });
    }
  });

  router.delete("/universities/:idOrSlug", async (req, res) => {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    try {
      const collection = req.app.locals.universityCollection;
      if (!collection) throw new Error("University collection not available");

      let university: UniversityData | null = null;
      if (ObjectId.isValid(req.params.idOrSlug)) {
        university = (await collection.findOne({
          _id: new ObjectId(req.params.idOrSlug),
        })) as UniversityData | null;
      }
      if (!university) {
        university = (await collection.findOne({
          slug: req.params.idOrSlug,
        })) as UniversityData | null;
      }
      if (!university)
        return res
          .status(404)
          .json({ error: "not_found", message: "University not found" });

      await collection.deleteOne({ _id: university._id });
      return res.status(200).json({ message: "University deleted" });
    } catch (error: any) {
      return res
        .status(400)
        .json({ error: "bad_request", message: error.message });
    }
  });

  router.get("/universities/:universityId/programs", async (req, res) => {
    try {
      const { universityId } = req.params;
      const collection = req.app.locals.universityProgramCollection;
      if (!collection) {
        const providerResults = await getProvider().getPrograms(universityId);
        return res.status(200).json({
          programs: providerResults.map(serialize),
          source: "demo_provider",
        });
      }

      const programs = await collection
        .find({ university_id: universityId })
        .sort({ created_at: -1 })
        .toArray();
      return res.status(200).json({ programs: programs.map(serialize) });
    } catch (error: any) {
      return res.status(500).json({
        error: "server_error",
        message: error.message || "Failed to load programs",
      });
    }
  });

  router.post("/universities/:universityId/programs", async (req, res) => {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    try {
      const body = req.body || {};
      const { universityId } = req.params;
      const program: UniversityProgramData = {
        _id: new ObjectId(),
        university_id: universityId,
        university_slug: safeString(body.university_slug),
        name: safeString(body.name),
        degree_level: body.degree_level || "bachelor",
        field: safeString(body.field),
        faculty: safeString(body.faculty),
        department: safeString(body.department),
        description: safeString(body.description),
        duration: safeString(body.duration),
        study_mode: body.study_mode || "on_campus",
        campus: safeString(body.campus),
        teaching_language: safeString(body.teaching_language),
        tuition: body.tuition ? safeNumber(body.tuition) : undefined,
        tuition_currency: safeString(body.tuition_currency),
        application_fee: body.application_fee
          ? safeNumber(body.application_fee)
          : undefined,
        application_fee_currency: safeString(body.application_fee_currency),
        admission_requirements: safeString(body.admission_requirements),
        intake: Array.isArray(body.intake)
          ? body.intake.map((i: unknown) => safeString(i)).filter(Boolean)
          : [],
        application_opening_date: safeString(body.application_opening_date),
        application_deadline: safeString(body.application_deadline),
        official_program_url: safeString(body.official_program_url),
        provenance: body.provenance || {
          source_type: "official_website",
          source_name: "Admin Entry",
          source_url: safeString(body.official_program_url),
          retrieved_at: new Date().toISOString(),
          last_verified_at: new Date().toISOString(),
          verification_status: "unverified",
          confidence: 0.7,
          is_official_source: true,
        },
        last_verified_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        is_demo: false,
      };

      const collection = req.app.locals.universityProgramCollection;
      if (!collection)
        throw new Error("University program collection not available");
      const result = await collection.insertOne(program);
      const created = await collection.findOne({ _id: result.insertedId });
      return res
        .status(201)
        .json({ program: serialize(created), message: "Program created" });
    } catch (error: any) {
      return res
        .status(400)
        .json({ error: "bad_request", message: error.message });
    }
  });

  router.patch("/universities/programs/:programId", async (req, res) => {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    try {
      const body = req.body || {};
      const collection = req.app.locals.universityProgramCollection;
      if (!collection)
        throw new Error("University program collection not available");
      if (!ObjectId.isValid(req.params.programId))
        return res
          .status(400)
          .json({ error: "bad_request", message: "Invalid program id" });

      const program = await collection.findOne({
        _id: new ObjectId(req.params.programId),
      });
      if (!program)
        return res
          .status(404)
          .json({ error: "not_found", message: "Program not found" });

      const updates: Record<string, any> = {
        updated_at: new Date().toISOString(),
      };
      const updatable = [
        "name",
        "degree_level",
        "field",
        "faculty",
        "department",
        "description",
        "duration",
        "study_mode",
        "campus",
        "teaching_language",
        "tuition",
        "tuition_currency",
        "application_fee",
        "application_fee_currency",
        "admission_requirements",
        "intake",
        "application_opening_date",
        "application_deadline",
        "official_program_url",
        "last_verified_at",
      ];
      for (const key of updatable) {
        if (body[key] !== undefined) updates[key] = body[key];
      }

      await collection.updateOne({ _id: program._id }, { $set: updates });
      const updated = await collection.findOne({ _id: program._id });
      return res
        .status(200)
        .json({ program: serialize(updated), message: "Program updated" });
    } catch (error: any) {
      return res
        .status(400)
        .json({ error: "bad_request", message: error.message });
    }
  });

  router.delete("/universities/programs/:programId", async (req, res) => {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    try {
      const collection = req.app.locals.universityProgramCollection;
      if (!collection)
        throw new Error("University program collection not available");
      if (!ObjectId.isValid(req.params.programId))
        return res
          .status(400)
          .json({ error: "bad_request", message: "Invalid program id" });

      const result = await collection.deleteOne({
        _id: new ObjectId(req.params.programId),
      });
      if (!result.deletedCount)
        return res
          .status(404)
          .json({ error: "not_found", message: "Program not found" });
      return res.status(200).json({ message: "Program deleted" });
    } catch (error: any) {
      return res
        .status(400)
        .json({ error: "bad_request", message: error.message });
    }
  });

  router.get("/universities/claims", async (req, res) => {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    try {
      const collection = req.app.locals.universityClaimCollection;
      if (!collection)
        throw new Error("University claim collection not available");
      const claims = await collection
        .find({})
        .sort({ submitted_at: -1 })
        .toArray();
      return res.status(200).json({ claims: claims.map(serialize) });
    } catch (error: any) {
      return res
        .status(500)
        .json({ error: "server_error", message: error.message });
    }
  });

  router.post("/universities/claims", async (req, res) => {
    const currentUser = await requireUser(req, res);
    if (!currentUser) return;

    try {
      const body = req.body || {};
      const claim: UniversityClaimData = {
        _id: new ObjectId(),
        university_id: safeString(body.university_id),
        university_slug: safeString(body.university_slug),
        university_name: safeString(body.university_name),
        representative_full_name: safeString(body.representative_full_name),
        job_title: safeString(body.job_title),
        institutional_email: safeString(body.institutional_email),
        department: safeString(body.department),
        phone: safeString(body.phone),
        university_website: safeString(body.university_website),
        proof_of_authority: safeString(body.proof_of_authority),
        supporting_documents: Array.isArray(body.supporting_documents)
          ? body.supporting_documents
          : [],
        message: safeString(body.message),
        submitted_at: new Date().toISOString(),
        review_status: "pending",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      if (
        !claim.university_id ||
        !claim.university_name ||
        !claim.representative_full_name ||
        !claim.institutional_email ||
        !claim.proof_of_authority
      ) {
        return res.status(400).json({
          error: "bad_request",
          message: "Missing required claim fields",
        });
      }

      const collection = req.app.locals.universityClaimCollection;
      if (!collection)
        throw new Error("University claim collection not available");
      const result = await collection.insertOne(claim);
      const created = await collection.findOne({ _id: result.insertedId });
      return res.status(201).json({
        claim: serialize(created),
        message: "Claim submitted for review",
      });
    } catch (error: any) {
      return res
        .status(400)
        .json({ error: "bad_request", message: error.message });
    }
  });

  router.patch("/universities/claims/:claimId", async (req, res) => {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    try {
      const body = req.body || {};
      const collection = req.app.locals.universityClaimCollection;
      if (!collection)
        throw new Error("University claim collection not available");
      if (!ObjectId.isValid(req.params.claimId))
        return res
          .status(400)
          .json({ error: "bad_request", message: "Invalid claim id" });

      const claim = await collection.findOne({
        _id: new ObjectId(req.params.claimId),
      });
      if (!claim)
        return res
          .status(404)
          .json({ error: "not_found", message: "Claim not found" });

      const status = body.review_status;
      if (status && !validClaimStatuses.includes(status)) {
        return res
          .status(400)
          .json({ error: "bad_request", message: "Invalid claim status" });
      }

      const updates: Record<string, any> = {
        updated_at: new Date().toISOString(),
      };
      if (status) updates.review_status = status;
      if (body.review_notes !== undefined)
        updates.review_notes = safeString(body.review_notes);
      updates.reviewed_by = admin._id.toString();
      updates.reviewed_at = new Date().toISOString();

      await collection.updateOne({ _id: claim._id }, { $set: updates });

      if (status === "approved") {
        const uniCollection = req.app.locals.universityCollection;
        if (uniCollection) {
          await uniCollection.updateOne(
            { _id: new ObjectId(claim.university_id) },
            {
              $set: {
                profile_claimed: true,
                claimed_by_user_id: admin._id.toString(),
                updated_at: new Date().toISOString(),
              },
            },
          );
        }
      }

      return res.status(200).json({ message: "Claim updated" });
    } catch (error: any) {
      return res
        .status(400)
        .json({ error: "bad_request", message: error.message });
    }
  });

  router.post("/universities/:universityId/applications", async (req, res) => {
    const currentUser = await requireUser(req, res);
    if (!currentUser) return;

    try {
      const body = req.body || {};
      const { universityId } = req.params;

      const uniCollection = req.app.locals.universityCollection;
      if (!uniCollection)
        throw new Error("University collection not available");
      const university = (await uniCollection.findOne({
        _id: new ObjectId(universityId),
      })) as UniversityData | null;
      if (!university)
        return res
          .status(404)
          .json({ error: "not_found", message: "University not found" });

      if (!isApplicationsEnabled(university)) {
        return res.status(403).json({
          error: "forbidden",
          message: "Applications are not enabled for this university",
        });
      }

      const application: UniversityApplicationData = {
        _id: new ObjectId(),
        application_id: generateApplicationId(),
        applicant_id: currentUser._id.toString(),
        university_id: university._id.toString(),
        university_slug: university.slug,
        program_id: safeString(body.program_id),
        program_name: safeString(body.program_name),
        intake: safeString(body.intake),
        personal_information: body.personal_information || {},
        education_history: Array.isArray(body.education_history)
          ? body.education_history
          : [],
        required_documents: Array.isArray(body.required_documents)
          ? body.required_documents
          : [],
        statement_essay: safeString(body.statement_essay),
        status: "submitted",
        payment_status: "pending",
        submitted_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const collection = req.app.locals.universityApplicationCollection;
      if (!collection)
        throw new Error("University application collection not available");
      const result = await collection.insertOne(application);
      const created = await collection.findOne({ _id: result.insertedId });
      return res.status(201).json({
        application: serialize(created),
        message: "Application submitted",
      });
    } catch (error: any) {
      return res
        .status(400)
        .json({ error: "bad_request", message: error.message });
    }
  });

  router.get("/applications", async (req, res) => {
    const currentUser = await requireUser(req, res);
    if (!currentUser) return;

    try {
      const collection = req.app.locals.universityApplicationCollection;
      if (!collection)
        throw new Error("University application collection not available");
      const applications = await collection
        .find({ applicant_id: currentUser._id.toString() })
        .sort({ created_at: -1 })
        .toArray();
      return res
        .status(200)
        .json({ applications: applications.map(serialize) });
    } catch (error: any) {
      return res
        .status(500)
        .json({ error: "server_error", message: error.message });
    }
  });

  router.patch("/applications/:applicationId", async (req, res) => {
    const currentUser = await requireUser(req, res);
    if (!currentUser) return;

    try {
      const body = req.body || {};
      const collection = req.app.locals.universityApplicationCollection;
      if (!collection)
        throw new Error("University application collection not available");
      if (!ObjectId.isValid(req.params.applicationId))
        return res
          .status(400)
          .json({ error: "bad_request", message: "Invalid application id" });

      const application = await collection.findOne({
        _id: new ObjectId(req.params.applicationId),
      });
      if (!application)
        return res
          .status(404)
          .json({ error: "not_found", message: "Application not found" });
      if (
        application.applicant_id !== currentUser._id.toString() &&
        currentUser.role !== "admin"
      ) {
        return res.status(403).json({
          error: "forbidden",
          message: "You can only update your own applications",
        });
      }

      const updates: Record<string, any> = {
        updated_at: new Date().toISOString(),
      };
      if (body.status === "withdrawn") updates.status = "withdrawn";
      if (
        body.payment_status &&
        validPaymentStatuses.includes(body.payment_status)
      )
        updates.payment_status = body.payment_status;
      if (body.payment_id !== undefined) updates.payment_id = body.payment_id;
      if (body.statement_essay !== undefined)
        updates.statement_essay = body.statement_essay;
      if (body.personal_information)
        updates.personal_information = body.personal_information;
      if (body.education_history)
        updates.education_history = body.education_history;
      if (body.required_documents)
        updates.required_documents = body.required_documents;

      await collection.updateOne({ _id: application._id }, { $set: updates });
      const updated = await collection.findOne({ _id: application._id });
      return res.status(200).json({ application: serialize(updated) });
    } catch (error: any) {
      return res
        .status(400)
        .json({ error: "bad_request", message: error.message });
    }
  });

  router.post(
    "/universities/:universityId/payments/approve",
    async (req, res) => {
      const currentUser = await requireUser(req, res);
      if (!currentUser) return;

      try {
        const body = req.body || {};
        const { universityId } = req.params;

        const uniCollection = req.app.locals.universityCollection;
        if (!uniCollection)
          throw new Error("University collection not available");
        const university = (await uniCollection.findOne({
          _id: new ObjectId(universityId),
        })) as UniversityData | null;
        if (!university)
          return res
            .status(404)
            .json({ error: "not_found", message: "University not found" });

        if (!isPiEnabled(university)) {
          return res.status(403).json({
            error: "forbidden",
            message: "Pi payments are not enabled for this university",
          });
        }

        const purpose = body.payment_purpose || "application_fee";
        if (!validPaymentPurposes.includes(purpose)) {
          return res
            .status(400)
            .json({ error: "bad_request", message: "Invalid payment purpose" });
        }
        if (
          !ensureServiceAuthorization(university).payment_categories.includes(
            purpose,
          )
        ) {
          return res.status(403).json({
            error: "forbidden",
            message: `Payment category ${purpose} is not authorized for this university`,
          });
        }

        const amountDisplay = safeNumber(body.amount_display, 0);
        const currencyDisplay = safeString(body.currency_display, "USD");
        if (amountDisplay <= 0)
          return res
            .status(400)
            .json({ error: "bad_request", message: "Invalid payment amount" });

        const amountPi = piFromUsdt(amountDisplay);
        if (amountPi <= 0)
          return res
            .status(400)
            .json({ error: "bad_request", message: "Invalid Pi amount" });

        const paymentId = generatePaymentId();
        const payment: UniversityPaymentData = {
          _id: new ObjectId(),
          payment_id: paymentId,
          user_id: currentUser._id.toString(),
          university_id: university._id.toString(),
          university_slug: university.slug,
          application_id: safeString(body.application_id),
          program_id: safeString(body.program_id),
          program_name: safeString(body.program_name),
          payment_purpose: purpose,
          amount_display: amountDisplay,
          currency_display: currencyDisplay,
          amount_pi: amountPi,
          status: "pending",
          audit_metadata: {
            ip: req.ip,
            user_agent: req.get("user-agent"),
            initiated_by: currentUser._id.toString(),
          },
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        const collection = req.app.locals.universityPaymentCollection;
        if (!collection)
          throw new Error("University payment collection not available");
        const result = await collection.insertOne(payment);

        return res.status(201).json({
          payment: serialize({ ...payment, _id: result.insertedId }),
          message: "Payment approved for processing",
        });
      } catch (error: any) {
        return res
          .status(400)
          .json({ error: "bad_request", message: error.message });
      }
    },
  );

  router.post(
    "/universities/payments/:paymentId/complete",
    async (req, res) => {
      const currentUser = await requireUser(req, res);
      if (!currentUser) return;

      try {
        const body = req.body || {};
        const collection = req.app.locals.universityPaymentCollection;
        if (!collection)
          throw new Error("University payment collection not available");
        if (!ObjectId.isValid(req.params.paymentId))
          return res
            .status(400)
            .json({ error: "bad_request", message: "Invalid payment id" });

        const payment = await collection.findOne({
          _id: new ObjectId(req.params.paymentId),
        });
        if (!payment)
          return res
            .status(404)
            .json({ error: "not_found", message: "Payment not found" });
        if (
          payment.user_id !== currentUser._id.toString() &&
          currentUser.role !== "admin"
        ) {
          return res.status(403).json({
            error: "forbidden",
            message: "You can only complete your own payments",
          });
        }

        const txid = safeString(body.txid);
        if (!txid)
          return res.status(400).json({
            error: "bad_request",
            message: "Transaction ID is required",
          });

        const payer = await req.app.locals.userCollection.findOne({ _id: new ObjectId(payment.user_id) });
        if (!payer || payer.blocked || !payment.pi_payment_identifier) throw new Error("A verified payment for this application is required.");
        const expected = { paymentId: payment.pi_payment_identifier, payer: payer.uid, amount: Number(payment.amount_pi), metadataKey: "universityPaymentId", intentId: String(payment._id) };
        const remote = (await platformAPIKeyClient.get(`/v2/payments/${encodeURIComponent(payment.pi_payment_identifier)}`)).data;
        await verifyAccountIncomingPayment(req.app.locals, remote, expected);
        await platformAPIKeyClient.post(
          `/v2/payments/${payment.pi_payment_identifier || payment.payment_id}/complete`,
          { txid },
        );
        const confirmed = (await platformAPIKeyClient.get(`/v2/payments/${encodeURIComponent(payment.pi_payment_identifier)}`)).data;
        await verifyAccountIncomingPayment(req.app.locals, confirmed, expected, true, txid);
        await bindPayment(req.app, confirmed, "university:" + String(payment._id));

        await collection.updateOne(
          { _id: payment._id },
          {
            $set: {
              status: "paid",
              transaction_identifier: txid,
              completed_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          },
        );

        if (payment.application_id) {
          const appCollection = req.app.locals.universityApplicationCollection;
          if (appCollection) {
            await appCollection.updateOne(
              { _id: new ObjectId(payment.application_id) },
              {
                $set: {
                  payment_status: "paid",
                  payment_id: payment.payment_id,
                  updated_at: new Date().toISOString(),
                },
              },
            );
          }
        }

        return res.status(200).json({
          message: "Payment completed",
          payment_id: payment.payment_id,
          txid,
        });
      } catch (error: any) {
        return res.status(400).json({
          error: "bad_request",
          message: error.message || "Failed to complete payment",
        });
      }
    },
  );

  router.post("/universities/payments/:paymentId/cancel", async (req, res) => {
    const currentUser = await requireUser(req, res);
    if (!currentUser) return;

    try {
      const collection = req.app.locals.universityPaymentCollection;
      if (!collection)
        throw new Error("University payment collection not available");
      if (!ObjectId.isValid(req.params.paymentId))
        return res
          .status(400)
          .json({ error: "bad_request", message: "Invalid payment id" });

      const payment = await collection.findOne({
        _id: new ObjectId(req.params.paymentId),
      });
      if (!payment)
        return res
          .status(404)
          .json({ error: "not_found", message: "Payment not found" });
      if (
        payment.user_id !== currentUser._id.toString() &&
        currentUser.role !== "admin"
      ) {
        return res.status(403).json({
          error: "forbidden",
          message: "You can only cancel your own payments",
        });
      }

      await collection.updateOne(
        { _id: payment._id },
        {
          $set: {
            status: "cancelled",
            cancelled_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        },
      );

      return res.status(200).json({ message: "Payment cancelled" });
    } catch (error: any) {
      return res
        .status(400)
        .json({ error: "bad_request", message: error.message });
    }
  });

  router.get("/tutors", async (req, res) => {
    const rows = await req.app.locals.teacherApplicationCollection?.find({ status: "approved", applicant_role: "tutor" }).sort({ reviewed_at: -1 }).toArray() || [];
    const tutors = rows.map((item: any) => ({ id: item._id.toString(), userId: item.user_id, name: item.full_name, avatar_url: item.avatar_url, headline: item.headline, biography: item.biography, subjects: item.subjects || [], languages: item.languages || [], location: item.country, experience_years: item.experience_years || 0, ratePi: item.proposed_price_pi || 0, verified: true }));
    return res.status(200).json({ tutors });
  });

  router.get("/tutors/:id", async (req, res) => {
    if (!ObjectId.isValid(req.params.id)) return res.status(404).json({ error: "Tutor not found" });
    const item = await req.app.locals.teacherApplicationCollection?.findOne({ _id: new ObjectId(req.params.id), status: "approved", applicant_role: "tutor" });
    if (!item) return res.status(404).json({ error: "Tutor not found" });
    return res.status(200).json({ tutor: { id: item._id.toString(), userId: item.user_id, name: item.full_name, avatar_url: item.avatar_url, headline: item.headline, biography: item.biography, subjects: item.subjects || [], languages: item.languages || [], location: item.country, experience_years: item.experience_years || 0, education: item.education, certifications: item.certifications, ratePi: item.proposed_price_pi || 0, verified: true } });
  });
  router.post("/tutors/:id/lesson-requests", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    if (!ObjectId.isValid(req.params.id)) return res.status(404).json({ error: "Tutor not found" });
    const tutor = await req.app.locals.teacherApplicationCollection?.findOne({ _id: new ObjectId(req.params.id), status: "approved", applicant_role: "tutor" });
    if (!tutor) return res.status(404).json({ error: "Tutor not found" });
    const body = req.body || {};
    const subject = safeString(body.subject);
    const preferred_date = safeString(body.preferred_date);
    const preferred_time = safeString(body.preferred_time);
    const delivery_mode = ["video", "audio", "chat", "in_person"].includes(body.delivery_mode) ? body.delivery_mode : "video";
    if (!subject || !preferred_date || !preferred_time) return res.status(400).json({ error: "Choose a subject, preferred date, and time." });
    const now = new Date().toISOString();
    const request = {
      tutor_id: tutor._id.toString(), tutor_user_id: tutor.user_id, tutor_name: tutor.full_name,
      student_id: user._id.toString(), student_name: user.displayName || user.piUsername || "Student",
      subject, preferred_date, preferred_time, timezone: safeString(body.timezone, "UTC"), delivery_mode,
      duration_minutes: Math.max(30, Math.min(180, Number(body.duration_minutes) || 60)),
      message: safeString(body.message), rate_pi: Number(tutor.proposed_price_pi) || 0,
      status: "pending", created_at: now, updated_at: now,
    };
    const result = await req.app.locals.tutorLessonRequestCollection.insertOne(request);
    if (tutor.user_id) await createNotification(req.app, { userId: tutor.user_id, type: "education_lesson_request", title: "New lesson request", message: `${request.student_name} requested a ${subject} lesson.`, relatedId: result.insertedId.toString() });
    return res.status(201).json({ request: { ...request, id: result.insertedId.toString() }, message: "Lesson request sent to the tutor." });
  });
  router.get("/teacher-applications/me", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    const application = await req.app.locals.teacherApplicationCollection?.findOne({ user_id: user._id.toString() });
    return res.status(200).json({ application: serialize(application) });
  });

  router.post("/teacher-applications", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    const collection = req.app.locals.teacherApplicationCollection;
    if (!collection) return res.status(503).json({ error: "Teacher applications are unavailable" });
    const body = req.body || {};
    const submit = body.action === "submit";
    const existing = await collection.findOne({ user_id: user._id.toString() });
    if (existing?.status === "approved") return res.status(409).json({ error: "Application is already approved" });
    const required = [body.full_name, body.email, body.country, body.headline, body.biography, body.proposed_course_title];
    if (submit && (required.some((value) => !safeString(value)) || !body.identity_confirmed || !body.quality_agreed || !body.terms_agreed)) {
      return res.status(400).json({ error: "Complete all required fields and confirmations before submitting." });
    }
    const now = new Date().toISOString();
    const application = {
      user_id: user._id.toString(),
      applicant_role: body.applicant_role === "education_provider" ? "education_provider" : "tutor",
      full_name: safeString(body.full_name || user.displayName || user.piUsername),
      email: safeString(body.email || user.contactEmail), phone: safeString(body.phone || user.contactPhone),
      country: safeString(body.country || user.country), avatar_url: safeString(body.avatar_url || user.avatar),
      headline: safeString(body.headline), biography: safeString(body.biography),
      subjects: Array.isArray(body.subjects) ? body.subjects.map((v: unknown) => safeString(v)).filter(Boolean).slice(0, 20) : [],
      experience_years: clamp(safeNumber(body.experience_years), 0, 80),
      languages: Array.isArray(body.languages) ? body.languages.map((v: unknown) => safeString(v)).filter(Boolean).slice(0, 15) : [],
      education: safeString(body.education), certifications: safeString(body.certifications),
      proposed_course_title: safeString(body.proposed_course_title), proposed_category: safeString(body.proposed_category),
      proposed_level: safeString(body.proposed_level), delivery_method: safeString(body.delivery_method),
      proposed_price_pi: Math.max(0, safeNumber(body.proposed_price_pi)),
      evidence_documents: Array.isArray(body.evidence_documents) ? body.evidence_documents.filter((v: any) => safeString(v?.url)).slice(0, 8).map((v: any) => ({ name: safeString(v.name), url: safeString(v.url) })) : [],
      sample_lesson_url: safeString(body.sample_lesson_url), pi_username: safeString(body.pi_username || user.piUsername),
      identity_confirmed: Boolean(body.identity_confirmed), quality_agreed: Boolean(body.quality_agreed), terms_agreed: Boolean(body.terms_agreed),
      status: submit ? "submitted" : "draft", submitted_at: submit ? now : existing?.submitted_at,
      reviewer_notes: existing?.reviewer_notes || "", created_at: existing?.created_at || now, updated_at: now,
    };
    await collection.updateOne({ user_id: application.user_id }, { $set: application }, { upsert: true });
    const saved = await collection.findOne({ user_id: application.user_id });
    return res.status(existing ? 200 : 201).json({ application: serialize(saved) });
  });

  router.get("/admin/teacher-applications", async (req, res) => {
    const admin = await requireAdmin(req, res); if (!admin) return;
    const applications = await req.app.locals.teacherApplicationCollection?.find({}).sort({ submitted_at: -1, updated_at: -1 }).toArray() || [];
    return res.status(200).json({ applications: applications.map(serialize) });
  });

  router.patch("/admin/teacher-applications/:id", async (req, res) => {
    const admin = await requireAdmin(req, res); if (!admin) return;
    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: "Invalid application" });
    const collection = req.app.locals.teacherApplicationCollection;
    const application = await collection?.findOne({ _id: new ObjectId(req.params.id) });
    if (!application) return res.status(404).json({ error: "Application not found" });
    const statuses = ["under_review", "changes_required", "approved", "rejected"];
    const status = safeString(req.body?.status);
    if (!statuses.includes(status)) return res.status(400).json({ error: "Invalid review status" });
    const now = new Date().toISOString();
    await collection.updateOne({ _id: application._id }, { $set: { status, reviewer_notes: safeString(req.body?.reviewer_notes), reviewed_at: now, reviewed_by: admin._id.toString(), updated_at: now } });
    if (status === "approved" && ObjectId.isValid(application.user_id)) {
      const role = application.applicant_role === "education_provider" ? "training_provider" : "verified_instructor";
      await req.app.locals.userCollection?.updateOne({ _id: new ObjectId(application.user_id) }, { $addToSet: { roles: role } });
    }
    if (application.user_id) await createNotification(req.app, { userId: application.user_id, type: "education_teacher_application", title: `Teaching application ${status.replace(/_/g, " ")}`, message: safeString(req.body?.reviewer_notes) || `Your Teach on SMAJ application is now ${status.replace(/_/g, " ")}.`, relatedId: "education-teacher-application" });
    return res.status(200).json({ application: serialize(await collection.findOne({ _id: application._id })) });
  });
  router.get("/admin/universities", async (req, res) => {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    try {
      const collection = req.app.locals.universityCollection;
      if (!collection) throw new Error("University collection not available");
      const universities = await collection
        .find({})
        .sort({ updated_at: -1 })
        .toArray();
      return res
        .status(200)
        .json({ universities: universities.map(serialize) });
    } catch (error: any) {
      return res
        .status(500)
        .json({ error: "server_error", message: error.message });
    }
  });

  router.get("/admin/universities/stats", async (req, res) => {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    try {
      const [universities, programs, claims, applications, payments] =
        await Promise.all([
          req.app.locals.universityCollection?.countDocuments() ||
            Promise.resolve(0),
          req.app.locals.universityProgramCollection?.countDocuments() ||
            Promise.resolve(0),
          req.app.locals.universityClaimCollection?.countDocuments({
            review_status: "pending",
          }) || Promise.resolve(0),
          req.app.locals.universityApplicationCollection?.countDocuments() ||
            Promise.resolve(0),
          req.app.locals.universityPaymentCollection?.countDocuments({
            status: "paid",
          }) || Promise.resolve(0),
        ]);

      return res.status(200).json({
        stats: {
          totalUniversities: universities,
          totalPrograms: programs,
          pendingClaims: claims,
          totalApplications: applications,
          completedPayments: payments,
        },
      });
    } catch (error: any) {
      return res
        .status(500)
        .json({ error: "server_error", message: error.message });
    }
  });
}
