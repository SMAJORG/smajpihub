import { assertInstitutionCourse, assertInstitutionPayment, canManageInstitution, isInstitutionPartner, assertPiPaymentBinding, grantInstitutionProgramCourses } from "../services/institutions";
import type { Request, Response, Router } from "express";
import axios from "axios";
import { ObjectId } from "mongodb";
import env from "../environments";
import { resolveCurrentUser } from "../services/auth";
import { PI_USDT_RATE, piFromUsdt } from "../services/piPricing";
import { platformAPIKeyClient } from "../services/platformAPIClient";
import { createNotification } from "../services/notifications";
import {
  CourseData,
  CourseModule,
  Lesson,
  CourseType,
  CourseLevel,
  CourseStatus,
  LessonType,
  EnrollmentData,
  EnrollmentStatus,
  CertificateData,
  CertificateStatus,
  CoursePaymentData,
  ProviderType,
  CompletionRules,
  CourseProvenance,
  QuizData,
  QuizSubmissionData,
  LessonProgress,
} from "../types/courses";

const serialize = (document: Record<string, any>) => {
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
const generateId = () => new ObjectId().toString();
const enrollmentIdentifierQuery = (enrollmentId: string) => {
  const publicEnrollmentId = safeString(enrollmentId);
  return ObjectId.isValid(publicEnrollmentId)
    ? {
        $or: [
          { _id: new ObjectId(publicEnrollmentId) },
          { enrollment_id: publicEnrollmentId },
        ],
      }
    : { enrollment_id: publicEnrollmentId };
};
const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const validCourseTypes: CourseType[] = ["free", "paid"];
const validCourseLevels: CourseLevel[] = [
  "beginner",
  "intermediate",
  "advanced",
  "all",
];
const validCourseStatuses: CourseStatus[] = [
  "draft",
  "submitted",
  "under_review",
  "changes_requested",
  "approved",
  "published",
  "rejected",
  "archived",
];
const validLessonTypes: LessonType[] = [
  "video",
  "text",
  "pdf",
  "document",
  "quiz",
  "assignment",
  "project",
  "external",
];
const validEnrollmentStatuses: EnrollmentStatus[] = [
  "pending_payment",
  "active",
  "completed",
  "cancelled",
  "refunded",
  "revoked",
];
const validCertificateStatuses: CertificateStatus[] = [
  "valid",
  "revoked",
  "replaced",
];
const validProviderTypes: ProviderType[] = [
  "smaj",
  "individual",
  "training_provider",
  "university_partner",
  "organization",
];

const defaultCompletionRules: CompletionRules = {
  required_lessons_percentage: 100,
  require_all_required_lessons: true,
  require_quizzes: false,
  minimum_quiz_score: 70,
  require_final_assessment: false,
  minimum_final_score: 70,
  require_project: false,
};

const defaultProvenance: CourseProvenance = {
  source_type: "creator",
  source_name: "Creator Entry",
  retrieved_at: new Date().toISOString(),
  last_verified_at: new Date().toISOString(),
  verification_status: "unverified",
  confidence: 0.7,
  is_official_source: true,
};

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

const isInstructor = (user: any) => {
  const roles = Array.isArray(user.roles) ? user.roles : [user.role];
  return roles.some((role: string) =>
    [
      "admin",
      "seller",
      "instructor",
      "verified_instructor",
      "training_provider",
    ].includes(role),
  );
};

const generateEnrollmentId = () =>
  `ENR-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
const generateCertificateId = () =>
  `CERT-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
const generatePaymentId = () =>
  `EDU-COURSE-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

export default function mountCourseEndpoints(router: Router) {
  router.use((_, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });

  const ensureSeedCourses = async (req: Request) => {
    const collection = req.app.locals.courseCollection;
    if (!collection) return;
    const count = await collection.countDocuments({});
    if (count > 0) return;
    const now = new Date();
    const demoCourses = [
      {
        slug: "demo-web-foundations",
        title: "Web Development Foundations",
        subtitle: "Learn HTML, CSS, and JavaScript from scratch",
        short_description: "Build modern websites with core web technologies.",
        description:
          "This comprehensive course takes you from zero to building real websites using HTML, CSS, and JavaScript.",
        category: "Technology",
        course_type: "paid",
        price_pi: piFromUsdt(15709),
        price_usdt: 15709,
        instructor_id: "demo-instructor",
        provider_id: "demo-instructor",
        provider_type: "individual",
        language: "en",
        level: "beginner",
        estimated_duration: "6 weeks",
        total_duration_minutes: 1260,
        thumbnail_url:
          "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=900&q=85",
        tags: ["html", "css", "javascript", "web"],
        certificate_enabled: true,
        completion_rules: defaultCompletionRules,
        modules: [
          {
            title: "Module 1 - HTML",
            description: "Learn HTML basics",
            order: 1,
            lessons: [
              {
                title: "Introduction",
                description: "Course intro",
                order: 1,
                type: "video",
                required: true,
                preview: true,
                duration: "5 min",
                video_url: "https://www.w3schools.com/html/mov_bbb.mp4",
              },
              {
                title: "HTML Structure",
                description: "Tags and elements",
                order: 2,
                type: "text",
                required: true,
                preview: false,
                content:
                  "<p>HTML structure uses tags like &lt;div&gt;, &lt;p&gt;, &lt;h1&gt;...</p>",
              },
              {
                title: "Forms",
                description: "HTML forms",
                order: 3,
                type: "video",
                required: true,
                preview: false,
                duration: "10 min",
                video_url: "https://www.w3schools.com/html/mov_bbb.mp4",
              },
            ],
          },
          {
            title: "Module 2 - CSS",
            description: "Learn CSS basics",
            order: 2,
            lessons: [
              {
                title: "CSS Basics",
                description: "Selectors and properties",
                order: 1,
                type: "video",
                required: true,
                preview: false,
                duration: "12 min",
                video_url: "https://www.w3schools.com/html/mov_bbb.mp4",
              },
              {
                title: "Flexbox",
                description: "Flexible box layout",
                order: 2,
                type: "text",
                required: true,
                preview: false,
                content: "<p>Flexbox makes layout easy.</p>",
              },
            ],
          },
        ],
        status: "published",
        published_at: now.toISOString(),
        enrollment_count: 1240,
        rating_average: 4.8,
        rating_count: 320,
        provenance: defaultProvenance,
        copyright_agreed: true,
        copyright_agreed_at: now.toISOString(),
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
        is_demo: true,
      },
      {
        slug: "demo-pi-business-growth",
        title: "Small Business Growth with Pi",
        subtitle: "Use digital tools to grow your business",
        short_description: "Practical business skills for the Pi economy.",
        description:
          "Learn how to leverage digital tools and the Pi ecosystem to grow a small business.",
        category: "Business",
        course_type: "free",
        price_pi: 0,
        price_usdt: 0,
        instructor_id: "demo-instructor-2",
        provider_id: "demo-instructor-2",
        provider_type: "individual",
        language: "en",
        level: "intermediate",
        estimated_duration: "4 weeks",
        total_duration_minutes: 480,
        thumbnail_url:
          "https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=900&q=85",
        tags: ["business", "pi", "growth"],
        certificate_enabled: true,
        completion_rules: defaultCompletionRules,
        modules: [
          {
            title: "Module 1 - Digital Tools",
            description: "Overview of tools",
            order: 1,
            lessons: [
              {
                title: "Getting Started",
                description: "Course intro",
                order: 1,
                type: "video",
                required: true,
                preview: true,
                duration: "8 min",
                video_url: "https://www.w3schools.com/html/mov_bbb.mp4",
              },
            ],
          },
        ],
        status: "published",
        published_at: now.toISOString(),
        enrollment_count: 856,
        rating_average: 4.6,
        rating_count: 210,
        provenance: defaultProvenance,
        copyright_agreed: true,
        copyright_agreed_at: now.toISOString(),
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
        is_demo: true,
      },
    ];

    await collection.insertMany(demoCourses);
  };

  router.get("/courses", async (req, res) => {
    try {
      const query = safeString((req.query.q as string) || "");
      const category = safeString((req.query.category as string) || "");
      const level = safeString((req.query.level as string) || "");
      const courseType = safeString((req.query.type as string) || "");
      const certificate = safeString((req.query.certificate as string) || "");
      const page = clamp(safeNumber(req.query.page, 1), 1, 1000);
      const pageSize = clamp(safeNumber(req.query.limit, 20), 1, 100);
      const sort = safeString((req.query.sort as string) || "newest");

      const collection = req.app.locals.courseCollection;
      if (!collection) {
        return res
          .status(200)
          .json({ courses: [], total: 0, page, pageSize, totalPages: 0 });
      }

      await ensureSeedCourses(req);

      const mongoQuery: Record<string, any> = {
        status: "published",
        is_demo: { $ne: true },
      };
      if (query) {
        mongoQuery.$or = [
          { title: { $regex: query, $options: "i" } },
          { subtitle: { $regex: query, $options: "i" } },
          { description: { $regex: query, $options: "i" } },
          { tags: { $in: [new RegExp(query, "i")] } },
          { search_keywords: { $in: [new RegExp(query, "i")] } },
        ];
      }
      if (category) mongoQuery.category = { $regex: category, $options: "i" };
      if (level && validCourseLevels.includes(level as CourseLevel))
        mongoQuery.level = level;
      if (courseType && validCourseTypes.includes(courseType as CourseType))
        mongoQuery.course_type = courseType;
      if (certificate === "available") mongoQuery.certificate_enabled = true;

      const sortOrder =
        sort === "popular"
          ? { enrollment_count: -1 }
          : sort === "rating"
            ? { rating_average: -1 }
            : sort === "price-low"
              ? { price_pi: 1 }
              : sort === "price-high"
                ? { price_pi: -1 }
                : { published_at: -1 };

      const [courses, total] = await Promise.all([
        collection
          .find(mongoQuery)
          .sort(sortOrder)
          .skip((page - 1) * pageSize)
          .limit(pageSize)
          .toArray(),
        collection.countDocuments(mongoQuery),
      ]);

      const publicCourses = await Promise.all(courses.map(async (course: any) => {
        if (!course.institutionId) return serialize(course);
        let institutionEnrollmentEnabled = true, institutionCertificateEnabled = true;
        try { await assertInstitutionCourse(req, course, "enroll"); if (course.course_type === "paid") await assertInstitutionCourse(req, course, "payment"); } catch { institutionEnrollmentEnabled = false; }
        try { await assertInstitutionCourse(req, course, "certificates"); } catch { institutionCertificateEnabled = false; }
        return serialize({ ...course, modules: [], institutionEnrollmentEnabled, institutionCertificateEnabled });
      }));
      return res.status(200).json({
        courses: publicCourses,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      });
    } catch (error: any) {
      return res.status(500).json({
        error: "server_error",
        message: error.message || "Failed to load courses",
      });
    }
  });

  router.get("/courses/:idOrSlug", async (req, res) => {
    try {
      const { idOrSlug } = req.params;
      const collection = req.app.locals.courseCollection;
      if (!collection) return res.status(200).json({ course: null });

      let course: CourseData | null = null;
      if (ObjectId.isValid(idOrSlug)) {
        course = (await collection.findOne({
          _id: new ObjectId(idOrSlug),
        })) as CourseData | null;
      }
      if (!course) {
        course = (await collection.findOne({
          slug: idOrSlug,
        })) as CourseData | null;
      }
      if (!course)
        return res
          .status(404)
          .json({ error: "not_found", message: "Course not found" });

      if (course.institutionId) {
        const viewer = await resolveCurrentUser(req);
        const manager = viewer && await canManageInstitution(req, viewer, course.institutionId);
        if (!manager && course.status !== "published") return res.status(404).json({ message: "Course not found." });
        const institution = await req.app.locals.institutionCollection.findOne({ _id: new ObjectId(course.institutionId) });
        const enrollment = viewer && await req.app.locals.enrollmentCollection.findOne({ user_id: String(viewer._id), course_id: String(course._id), status: { $in: ["active", "completed"] } });
        if (!manager && (!enrollment || !isInstitutionPartner(institution))) {
          course = { ...course, modules: course.modules.map(module => ({ ...module, lessons: module.lessons.map(lesson => lesson.preview ? lesson : { ...lesson, content: "", video_url: "", video_asset_id: "", video_playback_id: "", document_url: "", external_url: "", resources: [] }) })) };
        }
      }
      let institutionEnrollmentEnabled = true;
      if (course.institutionId) {
        try { await assertInstitutionCourse(req, course, "enroll"); if (course.course_type === "paid") await assertInstitutionCourse(req, course, "payment"); } catch { institutionEnrollmentEnabled = false; }
      }
      let institutionCertificateEnabled = true;
      try { await assertInstitutionCourse(req, course, "certificates"); } catch { institutionCertificateEnabled = false; }
      return res.status(200).json({ course: { ...serialize(course), institutionEnrollmentEnabled, institutionCertificateEnabled } });
    } catch (error: any) {
      return res.status(500).json({
        error: "server_error",
        message: error.message || "Failed to load course",
      });
    }
  });

  router.post("/course-video-uploads", async (req, res) => {
    const currentUser = await requireUser(req, res);
    if (!currentUser) return;
    const uploadInstitutionId = safeString(req.body?.institutionId);
    const institutionUploader = uploadInstitutionId && await canManageInstitution(req, currentUser, uploadInstitutionId);
    if (!isInstructor(currentUser) && !institutionUploader) {
      return res.status(403).json({ error: "forbidden", message: "An approved instructor or institution administrator account is required." });
    }

    const { fileSize, contentType, rightsConfirmed } = req.body || {};
    const size = safeNumber(fileSize);
    const allowedTypes = ["video/mp4", "video/webm", "video/quicktime"];
    if (rightsConfirmed !== true) {
      return res.status(400).json({ error: "rights_required", message: "Confirm that you own or are allowed to publish this video." });
    }
    if (!allowedTypes.includes(safeString(contentType)) || size <= 0 || size > 200 * 1024 * 1024) {
      return res.status(400).json({ error: "invalid_video", message: "Upload an MP4, WebM, or MOV video no larger than 200 MB." });
    }
    if (!env.cloudflare_stream_account_id || !env.cloudflare_stream_api_token) {
      return res.status(503).json({ error: "video_upload_not_configured", message: "Course video uploads are not configured yet." });
    }

    try {
      const response = await axios.post<{
        success: boolean;
        result?: { uid?: string; uploadURL?: string };
        errors?: Array<{ message?: string }>;
      }>(
        `https://api.cloudflare.com/client/v4/accounts/${env.cloudflare_stream_account_id}/stream/direct_upload`,
        { maxDurationSeconds: 14_400, requireSignedURLs: false },
        {
          headers: { Authorization: `Bearer ${env.cloudflare_stream_api_token}`, "Content-Type": "application/json" },
          timeout: 15_000,
        },
      );
      const uid = response.data.result?.uid;
      const uploadURL = response.data.result?.uploadURL;
      if (!response.data.success || !uid || !uploadURL) {
        throw new Error(response.data.errors?.[0]?.message || "Cloudflare did not create an upload session");
      }
      return res.status(201).json({ uid, uploadURL, playbackUrl: `https://iframe.videodelivery.net/${uid}` });
    } catch (error: any) {
      return res.status(502).json({
        error: "video_upload_session_failed",
        message: error?.response?.data?.errors?.[0]?.message || error.message || "Could not start the video upload",
      });
    }
  });
  router.post("/courses", async (req, res) => {
    const currentUser = await requireUser(req, res);
    if (!currentUser) return;

    try {
      const body = req.body || {};
      const institutionId = safeString(body.institutionId);
      const institution = institutionId && ObjectId.isValid(institutionId) ? await req.app.locals.institutionCollection.findOne({ _id: new ObjectId(institutionId) }) : null;
      const institutionManager = institution && isInstitutionPartner(institution) && await canManageInstitution(req, currentUser, institutionId);
      if (institutionId && !institutionManager) return res.status(403).json({ message: "An active partner institution and authorized institution administrator are required." });
      if (!isInstructor(currentUser) && !institutionManager) {
        return res.status(403).json({
          error: "forbidden",
          message: "Instructor or admin role required to create courses",
        });
      }

      const courseType = validCourseTypes.includes(body.course_type)
        ? body.course_type
        : "free";
      const priceUsdt = safeNumber(body.price_usdt, 0);
      const pricePi = courseType === "free" ? 0 : piFromUsdt(priceUsdt);

      if (courseType === "paid" && pricePi <= 0) {
        return res.status(400).json({
          error: "bad_request",
          message: "Paid courses require a valid price",
        });
      }

      const slug = slugify(safeString(body.title, `course-${generateId()}`));
      const course: CourseData = {
        _id: new ObjectId(),
        slug: `${slug}-${generateId().slice(0, 6)}`,
        title: safeString(body.title),
        subtitle: safeString(body.subtitle),
        short_description: safeString(body.short_description),
        description: safeString(body.description),
        category: safeString(body.category, "Other"),
        subcategory: safeString(body.subcategory),
        course_type: courseType,
        price_pi: pricePi,
        price_usdt: priceUsdt,
        discount_price_pi: body.discount_price_pi
          ? safeNumber(body.discount_price_pi)
          : undefined,
        discount_price_usdt: body.discount_price_usdt
          ? safeNumber(body.discount_price_usdt)
          : undefined,
        instructor_id: currentUser._id.toString(),
        ...(institutionId ? { institutionId, piPaymentsEnabled: currentUser.role === "admin" && body.piPaymentsEnabled === true } : {}),
        provider_id: institutionId || safeString(body.provider_id) || currentUser._id.toString(),
        provider_type: validProviderTypes.includes(body.provider_type)
          ? body.provider_type
          : "individual",
        language: safeString(body.language, "en"),
        level: validCourseLevels.includes(body.level) ? body.level : "all",
        estimated_duration: safeString(body.estimated_duration),
        total_duration_minutes: body.total_duration_minutes
          ? safeNumber(body.total_duration_minutes)
          : undefined,
        thumbnail_url: safeString(body.thumbnail_url),
        cover_url: safeString(body.cover_url),
        promotional_video: safeString(body.promotional_video),
        learning_objectives: Array.isArray(body.learning_objectives)
          ? body.learning_objectives
              .map((l: unknown) => safeString(l))
              .filter(Boolean)
          : [],
        requirements: Array.isArray(body.requirements)
          ? body.requirements.map((r: unknown) => safeString(r)).filter(Boolean)
          : [],
        target_audience: Array.isArray(body.target_audience)
          ? body.target_audience
              .map((t: unknown) => safeString(t))
              .filter(Boolean)
          : [],
        tags: Array.isArray(body.tags)
          ? body.tags.map((t: unknown) => safeString(t)).filter(Boolean)
          : [],
        search_keywords: Array.isArray(body.search_keywords)
          ? body.search_keywords
              .map((k: unknown) => safeString(k))
              .filter(Boolean)
          : [],
        certificate_enabled: Boolean(body.certificate_enabled),
        completion_rules: body.completion_rules || defaultCompletionRules,
        modules: Array.isArray(body.modules)
          ? body.modules.map((module: any, moduleIndex: number) => ({
              title: safeString(module.title, `Module ${moduleIndex + 1}`),
              description: safeString(module.description),
              order: safeNumber(module.order, moduleIndex),
              lessons: Array.isArray(module.lessons)
                ? module.lessons.map((lesson: any, lessonIndex: number) => ({
                    title: safeString(
                      lesson.title,
                      `Lesson ${lessonIndex + 1}`,
                    ),
                    description: safeString(lesson.description),
                    order: safeNumber(lesson.order, lessonIndex),
                    type: validLessonTypes.includes(lesson.type)
                      ? lesson.type
                      : "text",
                    duration: safeString(lesson.duration),
                    required: Boolean(lesson.required),
                    preview: Boolean(lesson.preview),
                    content: safeString(lesson.content),
                    video_url: safeString(lesson.video_url),
                    video_provider: safeString(lesson.video_provider),
                    video_asset_id: safeString(lesson.video_asset_id),
                    video_playback_id: safeString(lesson.video_playback_id),
                    document_url: safeString(lesson.document_url),
                    external_url: safeString(lesson.external_url),
                    resources: Array.isArray(lesson.resources)
                      ? lesson.resources
                          .map((r: unknown) => safeString(r))
                          .filter(Boolean)
                      : [],
                    completion_rules: lesson.completion_rules || {},
                  }))
                : [],
            }))
          : [],
        status: "draft",
        published_at: undefined,
        reviewed_by: undefined,
        reviewed_at: undefined,
        review_notes: undefined,
        enrollment_count: 0,
        rating_average: 0,
        rating_count: 0,
        provenance: defaultProvenance,
        copyright_agreed: Boolean(body.copyright_agreed),
        copyright_agreed_at: Boolean(body.copyright_agreed)
          ? new Date().toISOString()
          : undefined,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        is_demo: false,
      };

      if (!course.title || !course.description || !course.category) {
        return res.status(400).json({
          error: "bad_request",
          message: "Title, description, and category are required",
        });
      }

      const collection = req.app.locals.courseCollection;
      if (!collection) throw new Error("Course collection not available");
      const result = await collection.insertOne(course);
      const created = await collection.findOne({ _id: result.insertedId });
      return res.status(201).json({
        course: serialize(created),
        message: "Course created as draft",
      });
    } catch (error: any) {
      return res
        .status(400)
        .json({ error: "bad_request", message: error.message });
    }
  });

  router.patch("/courses/:idOrSlug", async (req, res) => {
    const currentUser = await requireUser(req, res);
    if (!currentUser) return;

    try {
      const body = req.body || {};
      const collection = req.app.locals.courseCollection;
      if (!collection) throw new Error("Course collection not available");

      let course: CourseData | null = null;
      if (ObjectId.isValid(req.params.idOrSlug)) {
        course = (await collection.findOne({
          _id: new ObjectId(req.params.idOrSlug),
        })) as CourseData | null;
      }
      if (!course) {
        course = (await collection.findOne({
          slug: req.params.idOrSlug,
        })) as CourseData | null;
      }
      if (!course)
        return res
          .status(404)
          .json({ error: "not_found", message: "Course not found" });

      const isOwner = course.institutionId ? await canManageInstitution(req, currentUser, course.institutionId) : course.instructor_id === currentUser._id.toString();
      const isAdmin = currentUser.role === "admin";
      if (!isOwner && !isAdmin) {
        return res.status(403).json({
          error: "forbidden",
          message: "You can only edit your own courses",
        });
      }


      if (body.piPaymentsEnabled !== undefined && course.institutionId && currentUser.role !== "admin") return res.status(403).json({ message: "Only SMAJ administrators can configure Pi payments." });
      const updates: Record<string, any> = {
        updated_at: new Date().toISOString(),
      };
      const updatable = [
        "title",
        "subtitle",
        "short_description",
        "description",
        "category",
        "subcategory",
        "course_type",
        "price_pi",
        "price_usdt",
        "discount_price_pi",
        "discount_price_usdt",
        "provider_id",
        "provider_type",
        "language",
        "level",
        "estimated_duration",
        "total_duration_minutes",
        "thumbnail_url",
        "cover_url",
        "promotional_video",
        "learning_objectives",
        "requirements",
        "target_audience",
        "tags",
        "search_keywords",
        "certificate_enabled",
        "piPaymentsEnabled",
        "completion_rules",
        "modules",
        "review_notes",
      ];

      for (const key of updatable) {
        if (body[key] !== undefined) {
          if (key === "course_type" && !validCourseTypes.includes(body[key]))
            continue;
          if (key === "level" && !validCourseLevels.includes(body[key]))
            continue;
          if (
            key === "provider_type" &&
            !validProviderTypes.includes(body[key])
          )
            continue;
          updates[key] = body[key];
        }
      }

      if (body.course_type && body.course_type === "free") {
        updates.price_pi = 0;
        updates.price_usdt = 0;
      }

      if (body.status && isAdmin && validCourseStatuses.includes(body.status)) {
        updates.status = body.status;
        if (body.status === "published")
          updates.published_at = new Date().toISOString();
        if (
          body.status === "published" ||
          body.status === "rejected" ||
          body.status === "changes_requested"
        ) {
          updates.reviewed_by = currentUser._id.toString();
          updates.reviewed_at = new Date().toISOString();
        }
      }

      if (course.institutionId) {
        updates.provider_id = course.institutionId;
        const priceUsdt = Number(updates.price_usdt ?? course.price_usdt);
        if (!Number.isFinite(priceUsdt) || priceUsdt < 0) throw new Error("Enter a valid nonnegative fee.");
        const type = updates.course_type ?? course.course_type;
        updates.price_usdt = type === "free" ? 0 : priceUsdt;
        updates.price_pi = type === "free" ? 0 : piFromUsdt(priceUsdt);
        if (type === "paid" && updates.price_pi <= 0) throw new Error("Paid courses require a valid price.");
        if (!isAdmin) { updates.status = "draft"; updates.piPaymentsEnabled = false; }
      }
      await collection.updateOne({ _id: course._id }, { $set: updates });
      if (course.institutionId) await req.app.locals.institutionAuditCollection.insertOne({ institutionId: course.institutionId, actorId: String(currentUser._id), action: "course.updated", details: { courseId: String(course._id), status: updates.status, piPaymentsEnabled: updates.piPaymentsEnabled }, at: new Date().toISOString() });
      const updated = await collection.findOne({ _id: course._id });
      return res
        .status(200)
        .json({ course: serialize(updated), message: "Course updated" });
    } catch (error: any) {
      return res
        .status(400)
        .json({ error: "bad_request", message: error.message });
    }
  });

  router.post("/courses/:idOrSlug/submit", async (req, res) => {
    const currentUser = await requireUser(req, res);
    if (!currentUser) return;

    try {
      const collection = req.app.locals.courseCollection;
      if (!collection) throw new Error("Course collection not available");

      let course: CourseData | null = null;
      if (ObjectId.isValid(req.params.idOrSlug)) {
        course = (await collection.findOne({
          _id: new ObjectId(req.params.idOrSlug),
        })) as CourseData | null;
      }
      if (!course) {
        course = (await collection.findOne({
          slug: req.params.idOrSlug,
        })) as CourseData | null;
      }
      if (!course)
        return res
          .status(404)
          .json({ error: "not_found", message: "Course not found" });
      if (
        !(course.institutionId ? await canManageInstitution(req, currentUser, course.institutionId) : course.instructor_id === currentUser._id.toString()) &&
        currentUser.role !== "admin"
      ) {
        return res.status(403).json({
          error: "forbidden",
          message: "You can only submit your own courses",
        });
      }

      await collection.updateOne(
        { _id: course._id },
        { $set: { status: "submitted", updated_at: new Date().toISOString() } },
      );
      return res.status(200).json({ message: "Course submitted for review" });
    } catch (error: any) {
      return res
        .status(400)
        .json({ error: "bad_request", message: error.message });
    }
  });

  router.get("/courses/:courseId/enrollments", async (req, res) => {
    const currentUser = await requireUser(req, res);
    if (!currentUser) return;

    try {
      const collection = req.app.locals.enrollmentCollection;
      if (!collection) return res.status(200).json({ enrollments: [] });

      const enrollments = await collection
        .find({
          user_id: currentUser._id.toString(),
          course_id: req.params.courseId,
        })
        .sort({ created_at: -1 })
        .toArray();
      return res.status(200).json({ enrollments: enrollments.map(serialize) });
    } catch (error: any) {
      return res
        .status(500)
        .json({ error: "server_error", message: error.message });
    }
  });

  router.post("/courses/:courseId/enroll", async (req, res) => {
    const currentUser = await requireUser(req, res);
    if (!currentUser) return;

    try {
      const body = req.body || {};
      const courseCollection = req.app.locals.courseCollection;
      const enrollmentCollection = req.app.locals.enrollmentCollection;
      if (!courseCollection || !enrollmentCollection)
        throw new Error("Collections not available");

      const course = (await courseCollection.findOne({
        _id: new ObjectId(req.params.courseId),
      })) as CourseData | null;
      if (!course)
        return res
          .status(404)
          .json({ error: "not_found", message: "Course not found" });
      if (course.status !== "published")
        return res.status(400).json({
          error: "bad_request",
          message: "Course is not available for enrollment",
        });

      await assertInstitutionCourse(req, course, "enroll");
      if (course.course_type === "paid") await assertInstitutionCourse(req, course, "payment");
      const existing = await enrollmentCollection.findOne({
        user_id: currentUser._id.toString(),
        course_id: course._id.toString(),
      });
      if (existing) {
        if (existing.status === "pending_payment" && existing.payment_id) {
          const paymentCollection = req.app.locals.coursePaymentCollection;
          const existingPayment = await paymentCollection?.findOne({
            payment_id: existing.payment_id,
            user_id: currentUser._id.toString(),
          });
          return res.status(200).json({
            enrollment: serialize(existing),
            payment: serialize(existingPayment),
            message: "Complete payment to access the course.",
          });
        }
        return res.status(200).json({
          enrollment: serialize(existing),
          message: "Already enrolled in this course",
        });
      }

      const enrollmentType = course.course_type === "free" ? "free" : "paid";
      const enrollment: EnrollmentData = {
        _id: new ObjectId(),
        enrollment_id: generateEnrollmentId(),
        ...(course.institutionId ? { institutionId: course.institutionId } : {}),
        user_id: currentUser._id.toString(),
        course_id: course._id.toString(),
        course_slug: course.slug,
        course_title: course.title,
        enrollment_type: enrollmentType,
        status: enrollmentType === "free" ? "active" : "pending_payment",
        progress_percentage: 0,
        completed_lesson_ids: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      if (enrollmentType === "paid") {
        const amountPi = course.price_pi;
        const amountUsdt = course.price_usdt;
        const paymentId = generatePaymentId();
        const payment: CoursePaymentData = {
          _id: new ObjectId(),
          payment_id: paymentId,
          ...(course.institutionId ? { institutionId: course.institutionId } : {}),
          user_id: currentUser._id.toString(),
          course_id: course._id.toString(),
          course_slug: course.slug,
          course_title: course.title,
          instructor_id: course.instructor_id,
          provider_id: course.provider_id,
          amount_pi: amountPi,
          amount_usdt: amountUsdt,
          status: "pending",
          audit_metadata: {
            ip: req.ip,
            user_agent: req.get("user-agent"),
            initiated_by: currentUser._id.toString(),
          },
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        const paymentCollection = req.app.locals.coursePaymentCollection;
        if (!paymentCollection)
          throw new Error("Course payment collection not available");
        await paymentCollection.insertOne(payment);
        enrollment.payment_id = paymentId;

        await enrollmentCollection.insertOne(enrollment);
        await courseCollection.updateOne(
          { _id: course._id },
          { $inc: { enrollment_count: 1 } },
        );

        return res.status(201).json({
          enrollment: serialize(enrollment),
          payment: serialize(payment),
          message: "Enrollment created. Complete payment to access the course.",
        });
      }

      await enrollmentCollection.insertOne(enrollment);
      await courseCollection.updateOne(
        { _id: course._id },
        { $inc: { enrollment_count: 1 } },
      );
      return res.status(201).json({
        enrollment: serialize(enrollment),
        message: "Enrolled successfully",
      });
    } catch (error: any) {
      return res
        .status(400)
        .json({ error: "bad_request", message: error.message });
    }
  });

  router.post("/courses/payments/:paymentId/approve", async (req, res) => {
    const currentUser = await requireUser(req, res);
    if (!currentUser) return;

    try {
      const paymentCollection = req.app.locals.coursePaymentCollection;
      if (!paymentCollection)
        throw new Error("Course payment collection not available");
      const payment = await paymentCollection.findOne({
        _id: new ObjectId(req.params.paymentId),
      });
      if (!payment)
        return res
          .status(404)
          .json({ error: "not_found", message: "Payment not found" });
      if (payment.user_id !== currentUser._id.toString())
        return res.status(403).json({ error: "forbidden" });
      if (payment.status !== "pending")
        return res
          .status(400)
          .json({ error: "bad_request", message: "Payment is not pending" });

      const piPaymentId = safeString(req.body?.pi_payment_identifier);
      if (!piPaymentId)
        return res
          .status(400)
          .json({ error: "bad_request", message: "Pi payment ID is required" });
      await assertInstitutionPayment(req, payment);
      if (payment.institutionId) {
        const { data: remote } = await platformAPIKeyClient.get(`/v2/payments/${encodeURIComponent(piPaymentId)}`);
        assertPiPaymentBinding(remote, payment, currentUser);
        const reused = await paymentCollection.findOne({ pi_payment_identifier: piPaymentId, _id: { $ne: payment._id } });
        if (reused) throw new Error("This Pi payment is already assigned to another enrollment.");
      }
      await platformAPIKeyClient.post(`/v2/payments/${encodeURIComponent(piPaymentId)}/approve`);
      await paymentCollection.updateOne(
        { _id: payment._id },
        {
          $set: {
            pi_payment_identifier: piPaymentId,
            status: "processing",
            approved_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        },
      );
      return res.status(200).json({ message: "Payment approved" });
    } catch (error: any) {
      return res.status(400).json({
        error: "bad_request",
        message: error.message || "Failed to approve payment",
      });
    }
  });
  router.post("/courses/payments/:paymentId/complete", async (req, res) => {
    const currentUser = await requireUser(req, res);
    if (!currentUser) return;

    try {
      const body = req.body || {};
      const paymentCollection = req.app.locals.coursePaymentCollection;
      const enrollmentCollection = req.app.locals.enrollmentCollection;
      if (!paymentCollection || !enrollmentCollection)
        throw new Error("Collections not available");

      const payment = await paymentCollection.findOne({
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

      await assertInstitutionPayment(req, payment);
      if (payment.institutionId) {
        if (!payment.pi_payment_identifier || !["processing", "paid"].includes(payment.status)) throw new Error("An approved Pi payment is required.");
        const payer = await req.app.locals.userCollection.findOne({ _id: new ObjectId(payment.user_id) });
        const { data: remote } = await platformAPIKeyClient.get(`/v2/payments/${encodeURIComponent(payment.pi_payment_identifier)}`);
        assertPiPaymentBinding(remote, payment, payer, txid);
      }
      await platformAPIKeyClient.post(
        `/v2/payments/${encodeURIComponent(payment.pi_payment_identifier || payment.payment_id)}/complete`,
        { txid },
      );

      await paymentCollection.updateOne(
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

      if (payment.course_id || payment.programId) {
        await enrollmentCollection.updateOne(
          {
            user_id: payment.user_id,
            ...(payment.programId ? { programId: payment.programId, institutionId: payment.institutionId } : { course_id: payment.course_id }),
            payment_id: payment.payment_id,
            status: "pending_payment",
          },
          { $set: { status: "active", updated_at: new Date().toISOString() } },
        );
      }

      if (payment.programId) {
        const enrollment = await enrollmentCollection.findOne({ institutionId: payment.institutionId, programId: payment.programId, user_id: payment.user_id });
        await grantInstitutionProgramCourses(req, enrollment);
      }
      if (payment.institutionId) await req.app.locals.institutionAuditCollection.insertOne({ institutionId: payment.institutionId, actorId: String(currentUser._id), action: "payment.confirmed", details: { paymentId: String(payment._id), txid }, at: new Date().toISOString() });
      return res.status(200).json({
        message: "Payment completed. Enrollment activated.",
        payment_id: payment.payment_id,
        txid,
      });
    } catch (error: any) {
      return res.status(400).json({
        error: "bad_request",
        message: error.message || "Failed to complete payment",
      });
    }
  });

  router.get("/my-learning", async (req, res) => {
    const currentUser = await requireUser(req, res);
    if (!currentUser) return;

    try {
      const collection = req.app.locals.enrollmentCollection;
      if (!collection) return res.status(200).json({ enrollments: [] });

      const enrollments = await collection
        .find({ user_id: currentUser._id.toString() })
        .sort({ updated_at: -1 })
        .toArray();
      return res.status(200).json({ enrollments: enrollments.map(serialize) });
    } catch (error: any) {
      return res
        .status(500)
        .json({ error: "server_error", message: error.message });
    }
  });

  router.get("/my-learning/:enrollmentId", async (req, res) => {
    const currentUser = await requireUser(req, res);
    if (!currentUser) return;

    try {
      const collection = req.app.locals.enrollmentCollection;
      if (!collection) return res.status(404).json({ error: "not_found" });

      const enrollment = await collection.findOne(
        enrollmentIdentifierQuery(req.params.enrollmentId),
      );
      if (!enrollment)
        return res
          .status(404)
          .json({ error: "not_found", message: "Enrollment not found" });
      if (
        enrollment.user_id !== currentUser._id.toString() &&
        currentUser.role !== "admin"
      ) {
        return res.status(403).json({ error: "forbidden" });
      }

      return res.status(200).json({ enrollment: serialize(enrollment) });
    } catch (error: any) {
      return res
        .status(500)
        .json({ error: "server_error", message: error.message });
    }
  });

  router.post(
    "/my-learning/:enrollmentId/lessons/:lessonId/complete",
    async (req, res) => {
      const currentUser = await requireUser(req, res);
      if (!currentUser) return;

      try {
        const enrollmentCollection = req.app.locals.enrollmentCollection;
        const lessonProgressCollection =
          req.app.locals.lessonProgressCollection;
        if (!enrollmentCollection)
          throw new Error("Enrollment collection not available");

        const enrollment = await enrollmentCollection.findOne(
          enrollmentIdentifierQuery(req.params.enrollmentId),
        );
        if (!enrollment)
          return res
            .status(404)
            .json({ error: "not_found", message: "Enrollment not found" });
        if (enrollment.user_id !== currentUser._id.toString())
          return res.status(403).json({ error: "forbidden" });

        const courseCollection = req.app.locals.courseCollection;
        const course = (await courseCollection?.findOne({
          _id: new ObjectId(enrollment.course_id),
        })) as CourseData | undefined;
        if (!course)
          return res
            .status(404)
            .json({ error: "not_found", message: "Course not found" });

        if (course.institutionId) {
          await assertInstitutionCourse(req, course, "enroll");
          if (!["active", "completed"].includes(enrollment.status)) throw new Error("Complete enrollment payment before recording learning progress.");
        }
        const lessonId = req.params.lessonId;
        const allLessons = course.modules.flatMap((m: CourseModule) =>
          m.lessons.map(
            (l: Lesson, lessonIndex: number) => `${m.order}-${l.order}`,
          ),
        );
        const actualLessonId = allLessons.includes(lessonId)
          ? lessonId
          : undefined;

        if (!actualLessonId) {
          return res.status(400).json({
            error: "invalid_lesson",
            message: "This lesson does not belong to the enrolled course.",
          });
        }
        const shouldAddLesson =
          !enrollment.completed_lesson_ids.includes(actualLessonId);

      const updates: Record<string, any> = {
          updated_at: new Date().toISOString(),
        };

        const totalLessons = allLessons.length;
        const completedCount =
          enrollment.completed_lesson_ids.length +
          (actualLessonId &&
          !enrollment.completed_lesson_ids.includes(actualLessonId)
            ? 1
            : 0);
        const progress =
          totalLessons > 0
            ? Math.round((completedCount / totalLessons) * 100)
            : 0;
        updates.progress_percentage = progress;

        const rules = course.completion_rules || defaultCompletionRules;
        if (rules.require_all_required_lessons) {
          const requiredLessons = course.modules.flatMap((m: CourseModule) =>
            m.lessons
              .filter((l: Lesson) => l.required)
              .map((l: Lesson, lessonIndex: number) => `${m.order}-${l.order}`),
          );
          const allRequiredCompleted = requiredLessons.every(
            (id: string) =>
              enrollment.completed_lesson_ids.includes(id) ||
              id === actualLessonId,
          );
          if (
            allRequiredCompleted &&
            progress >= rules.required_lessons_percentage
          ) {
            updates.status = "completed";
            updates.completed_at = new Date().toISOString();
          }
        } else if (progress >= rules.required_lessons_percentage) {
          updates.status = "completed";
          updates.completed_at = new Date().toISOString();
        }

        await enrollmentCollection.updateOne(
          { _id: enrollment._id },
          {
            $set: updates,
            ...(shouldAddLesson
              ? { $addToSet: { completed_lesson_ids: actualLessonId } }
              : {}),
          },
        );

        if (lessonProgressCollection) {
          await lessonProgressCollection.updateOne(
            {
              user_id: currentUser._id.toString(),
              lesson_id: actualLessonId || lessonId,
              module_id: "",
            },
            {
              $set: {
                completed_at: new Date().toISOString(),
                lesson_id: actualLessonId || lessonId,
              },
              $setOnInsert: {
                user_id: currentUser._id.toString(),
                module_id: "",
                started_at: new Date().toISOString(),
                quiz_attempts: 0,
                assignment_submitted: false,
              },
            },
            { upsert: true },
          );
        }

        const updated = await enrollmentCollection.findOne({
          _id: enrollment._id,
        });
        return res.status(200).json({ enrollment: serialize(updated) });
      } catch (error: any) {
        return res
          .status(400)
          .json({ error: "bad_request", message: error.message });
      }
    },
  );

  router.post("/courses/:courseId/quiz/submit", async (req, res) => {
    const currentUser = await requireUser(req, res);
    if (!currentUser) return;

    try {
      const body = req.body || {};
      const quizCollection = req.app.locals.quizCollection;
      const submissionCollection = req.app.locals.quizSubmissionCollection;
      if (!quizCollection || !submissionCollection)
        throw new Error("Quiz collections not available");

      const quiz = (await quizCollection.findOne({
        _id: new ObjectId(req.params.courseId),
      })) as QuizData | null;
      if (!quiz)
        return res
          .status(404)
          .json({ error: "not_found", message: "Quiz not found" });

      const existingSubmissions = await submissionCollection.countDocuments({
        quiz_id: quiz.quiz_id,
        user_id: currentUser._id.toString(),
      });
      if (
        quiz.attempts_allowed > 0 &&
        existingSubmissions >= quiz.attempts_allowed
      ) {
        return res
          .status(400)
          .json({ error: "bad_request", message: "Maximum attempts reached" });
      }

      let score = 0;
      const maxScore = quiz.questions.reduce((sum, q) => sum + q.points, 0);
      for (const question of quiz.questions) {
        const answer = body.answers?.[question.id];
        if (Array.isArray(question.correct_answers) && Array.isArray(answer)) {
          const sortedCorrect = [...question.correct_answers].sort();
          const sortedAnswer = [...answer].sort();
          if (JSON.stringify(sortedCorrect) === JSON.stringify(sortedAnswer))
            score += question.points;
        } else if (question.correct_answers.includes(answer)) {
          score += question.points;
        }
      }

      const passed = score >= quiz.passing_score;
      const submission: QuizSubmissionData = {
        _id: new ObjectId(),
        submission_id: `QUIZ-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
        quiz_id: quiz.quiz_id,
        user_id: currentUser._id.toString(),
        course_id: quiz.course_id,
        answers: body.answers || {},
        score,
        max_score: maxScore,
        passed,
        attempt_number: existingSubmissions + 1,
        submitted_at: new Date().toISOString(),
        graded_at: new Date().toISOString(),
      };

      await submissionCollection.insertOne(submission);
      return res
        .status(201)
        .json({ submission: serialize(submission), passed, score, maxScore });
    } catch (error: any) {
      return res
        .status(400)
        .json({ error: "bad_request", message: error.message });
    }
  });

  router.post("/courses/:courseId/enrollment-certificate", async (req, res) => {
    const currentUser = await requireUser(req, res);
    if (!currentUser) return;

    try {
      const enrollmentCollection = req.app.locals.enrollmentCollection;
      const certificateCollection = req.app.locals.certificateCollection;
      if (!enrollmentCollection || !certificateCollection)
        throw new Error("Collections not available");
      const enrollment = await enrollmentCollection.findOne({
        user_id: currentUser._id.toString(),
        course_id: req.params.courseId,
      });
      if (!enrollment)
        return res
          .status(404)
          .json({ error: "not_found", message: "Enrollment not found" });
      if (!["active", "completed"].includes(enrollment.status)) {
        return res.status(400).json({
          error: "bad_request",
          message:
            "Complete payment before requesting an enrollment certificate",
        });
      }

      const existing = await certificateCollection.findOne({
        enrollment_id: enrollment._id.toString(),
        certificate_type: "enrollment",
        status: "valid",
      });
      if (existing)
        return res.status(200).json({
          certificate: serialize(existing),
          message: "Enrollment certificate already issued",
        });
      const courseCollection = req.app.locals.courseCollection;
      const course = (await courseCollection?.findOne({
        _id: new ObjectId(enrollment.course_id),
      })) as CourseData | undefined;
      if (!course)
        return res
          .status(404)
          .json({ error: "not_found", message: "Course not found" });

      await assertInstitutionCourse(req, course, "certificates");
      if (course.institutionId && enrollment.status !== "completed") throw new Error("Institution certificates require confirmed completion.");
      const certificateId = generateCertificateId();
      const now = new Date().toISOString();
      const certificate: CertificateData = {
        _id: new ObjectId(),
        certificate_id: certificateId,
        ...(course.institutionId ? { institutionId: course.institutionId } : {}),
        enrollment_id: enrollment._id.toString(),
        user_id: currentUser._id.toString(),
        course_id: course._id.toString(),
        course_slug: course.slug,
        course_title: course.title,
        instructor_name: "",
        provider_name: course.provenance?.source_name || "SMAJ PI Education",
        learner_name:
          currentUser.displayName ||
          currentUser.piUsername ||
          currentUser.username,
        certificate_type: "enrollment",
        enrollment_date: enrollment.started_at || enrollment.created_at,
        issue_date: now,
        verification_url: `${req.protocol}://${req.get("host")}/verify/certificate/${certificateId}`,
        status: "valid",
        created_at: now,
        updated_at: now,
      };
      const result = await certificateCollection.insertOne(certificate);
      const created = await certificateCollection.findOne({
        _id: result.insertedId,
      });
      return res.status(201).json({
        certificate: serialize(created),
        message: "Enrollment certificate issued",
      });
    } catch (error: any) {
      return res.status(400).json({
        error: "bad_request",
        message: error.message || "Failed to issue enrollment certificate",
      });
    }
  });
  router.post("/courses/:courseId/certificate", async (req, res) => {
    const currentUser = await requireUser(req, res);
    if (!currentUser) return;

    try {
      const enrollmentCollection = req.app.locals.enrollmentCollection;
      const certificateCollection = req.app.locals.certificateCollection;
      if (!enrollmentCollection || !certificateCollection)
        throw new Error("Collections not available");

      const enrollment = await enrollmentCollection.findOne({
        user_id: currentUser._id.toString(),
        course_id: req.params.courseId,
      });
      if (!enrollment)
        return res
          .status(404)
          .json({ error: "not_found", message: "Enrollment not found" });
      if (enrollment.status !== "completed")
        return res
          .status(400)
          .json({ error: "bad_request", message: "Course not yet completed" });
      if (enrollment.certificate_id)
        return res.status(400).json({
          error: "bad_request",
          message: "Certificate already issued",
        });

      const courseCollection = req.app.locals.courseCollection;
      const course = (await courseCollection?.findOne({
        _id: new ObjectId(enrollment.course_id),
      })) as CourseData | undefined;
      if (!course || !course.certificate_enabled)
        return res.status(400).json({
          error: "bad_request",
          message: "Certificate not available for this course",
        });

      await assertInstitutionCourse(req, course, "certificates");
      const certificateId = generateCertificateId();
      const verificationUrl = `${req.protocol}://${req.get("host")}/verify/certificate/${certificateId}`;
      const certificate: CertificateData = {
        _id: new ObjectId(),
        certificate_id: certificateId,
        ...(course.institutionId ? { institutionId: course.institutionId } : {}),
        enrollment_id: enrollment._id.toString(),
        user_id: currentUser._id.toString(),
        course_id: course._id.toString(),
        course_slug: course.slug,
        course_title: course.title,
        instructor_name: "",
        provider_name: "",
        learner_name:
          currentUser.displayName ||
          currentUser.piUsername ||
          currentUser.username,
        certificate_type: "completion",
        enrollment_date: enrollment.started_at || enrollment.created_at,
        completion_date: enrollment.completed_at || new Date().toISOString(),
        issue_date: new Date().toISOString(),
        final_score: undefined,
        certificate_url: "",
        qr_code_url: "",
        verification_url: verificationUrl,
        status: "valid",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const result = await certificateCollection.insertOne(certificate);
      await enrollmentCollection.updateOne(
        { _id: enrollment._id },
        {
          $set: {
            certificate_id: certificateId,
        ...(course.institutionId ? { institutionId: course.institutionId } : {}),
            updated_at: new Date().toISOString(),
          },
        },
      );

      const created = await certificateCollection.findOne({
        _id: result.insertedId,
      });
      return res.status(201).json({
        certificate: serialize(created),
        message: "Certificate issued",
      });
    } catch (error: any) {
      return res
        .status(400)
        .json({ error: "bad_request", message: error.message });
    }
  });

  router.get("/my-certificates", async (req, res) => {
    const currentUser = await requireUser(req, res);
    if (!currentUser) return;

    try {
      const collection = req.app.locals.certificateCollection;
      if (!collection) return res.status(200).json({ certificates: [] });
      const certificates = await collection
        .find({ user_id: currentUser._id.toString() })
        .sort({ issue_date: -1 })
        .toArray();
      return res
        .status(200)
        .json({ certificates: certificates.map(serialize) });
    } catch (error: any) {
      return res
        .status(500)
        .json({
          error: "server_error",
          message: error.message || "Failed to load certificates",
        });
    }
  });
  router.get("/certificates/:certificateId", async (req, res) => {
    try {
      const collection = req.app.locals.certificateCollection;
      if (!collection) return res.status(404).json({ error: "not_found" });

      const certificate = await collection.findOne({
        certificate_id: req.params.certificateId,
      });
      if (!certificate)
        return res
          .status(404)
          .json({ error: "not_found", message: "Certificate not found" });

      const publicData = {
        certificate_id: certificate.certificate_id,
        course_title: certificate.course_title,
        learner_name: certificate.learner_name,
        instructor_name: certificate.instructor_name,
        provider_name: certificate.provider_name,
        certificate_type: certificate.certificate_type || "completion",
        enrollment_date: certificate.enrollment_date,
        completion_date: certificate.completion_date,
        issue_date: certificate.issue_date,
        final_score: certificate.final_score,
        status: certificate.status,
        verification_url: certificate.verification_url,
      };

      return res.status(200).json({ certificate: publicData });
    } catch (error: any) {
      return res
        .status(500)
        .json({ error: "server_error", message: error.message });
    }
  });

  router.get("/admin/courses", async (req, res) => {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    try {
      const collection = req.app.locals.courseCollection;
      if (!collection) throw new Error("Course collection not available");
      const courses = await collection
        .find({})
        .sort({ updated_at: -1 })
        .toArray();
      return res.status(200).json({ courses: courses.map(serialize) });
    } catch (error: any) {
      return res
        .status(500)
        .json({ error: "server_error", message: error.message });
    }
  });

  router.get("/admin/courses/stats", async (req, res) => {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    try {
      const [
        totalCourses,
        publishedCourses,
        draftCourses,
        pendingReview,
        totalEnrollments,
        totalCertificates,
      ] = await Promise.all([
        req.app.locals.courseCollection?.countDocuments() || Promise.resolve(0),
        req.app.locals.courseCollection?.countDocuments({
          status: "published",
        }) || Promise.resolve(0),
        req.app.locals.courseCollection?.countDocuments({ status: "draft" }) ||
          Promise.resolve(0),
        req.app.locals.courseCollection?.countDocuments({
          status: { $in: ["submitted", "under_review"] },
        }) || Promise.resolve(0),
        req.app.locals.enrollmentCollection?.countDocuments() ||
          Promise.resolve(0),
        req.app.locals.certificateCollection?.countDocuments() ||
          Promise.resolve(0),
      ]);

      return res.status(200).json({
        stats: {
          totalCourses,
          publishedCourses,
          draftCourses,
          pendingReview,
          totalEnrollments,
          totalCertificates,
        },
      });
    } catch (error: any) {
      return res
        .status(500)
        .json({ error: "server_error", message: error.message });
    }
  });

  router.patch("/admin/courses/:idOrSlug", async (req, res) => {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    try {
      const body = req.body || {};
      const collection = req.app.locals.courseCollection;
      if (!collection) throw new Error("Course collection not available");

      let course: CourseData | null = null;
      if (ObjectId.isValid(req.params.idOrSlug)) {
        course = (await collection.findOne({
          _id: new ObjectId(req.params.idOrSlug),
        })) as CourseData | null;
      }
      if (!course) {
        course = (await collection.findOne({
          slug: req.params.idOrSlug,
        })) as CourseData | null;
      }
      if (!course)
        return res
          .status(404)
          .json({ error: "not_found", message: "Course not found" });


      const updates: Record<string, any> = {
        updated_at: new Date().toISOString(),
      };
      const updatable = [
        "status",
        "review_notes",
        "reviewed_by",
        "reviewed_at",
        "certificate_enabled",
        "piPaymentsEnabled",
        "featured",
      ];
      for (const key of updatable) {
        if (body[key] !== undefined) updates[key] = body[key];
      }
      if (body.status && validCourseStatuses.includes(body.status)) {
        updates.status = body.status;
        if (body.status === "published")
          updates.published_at = new Date().toISOString();
        updates.reviewed_by = admin._id.toString();
        updates.reviewed_at = new Date().toISOString();
      }

      await collection.updateOne({ _id: course._id }, { $set: updates });
      const updated = await collection.findOne({ _id: course._id });
      return res
        .status(200)
        .json({ course: serialize(updated), message: "Course updated" });
    } catch (error: any) {
      return res
        .status(400)
        .json({ error: "bad_request", message: error.message });
    }
  });
}
