import fs from "fs";
import path from "path";
import crypto from "crypto";
import cors from "cors";
import express from "express";
import cookieParser from "cookie-parser";
import session from "express-session";
import logger from "morgan";
import MongoStore from "connect-mongo";
import { MongoClient } from "mongodb";
import env from "./environments";
import mountPaymentsEndpoints from "./handlers/payments";
import mountUserEndpoints, { handleSignIn } from "./handlers/users";

// We must import typedefs for ts-node-dev to pick them up when they change (even though tsc would supposedly
// have no problem here)
// https://stackoverflow.com/questions/65108033/property-user-does-not-exist-on-type-session-partialsessiondata#comment125163548_65381085
import "./types/session";
import mountNotificationEndpoints from "./handlers/notifications";
import mountMarketplaceEndpoints from "./handlers/marketplace";
import mountAdminEndpoints from "./handlers/admin";
import mountMessageEndpoints from "./handlers/messages";
import mountOnboardingEndpoints from "./handlers/onboarding";
import mountSupportEndpoints from "./handlers/support";
import mountUploadEndpoints from "./handlers/uploads";
import mountStreamEndpoints from "./handlers/stream";
import mountSportsEndpoints from "./handlers/sports";
import mountJobsEndpoints from "./handlers/jobs";
import mountTransportEndpoints from "./handlers/transport";
import mountTranslationEndpoints from "./handlers/translations";
import mountHeroBannerEndpoints from "./handlers/heroBanners";
import mountAmbassadorEndpoints from "./handlers/ambassadors";
import mountEducationEndpoints from "./handlers/education";
import mountCourseEndpoints from "./handlers/courses";
import { createMemoryCollections } from "./services/memoryDatabase";
import { validateAndTouchDeviceSession } from "./services/deviceSessions";

const dbName = env.mongo_db_name;
const buildLegacyMongoUri = () => {
  if (env.mongo_user && env.mongo_password) {
    const username = encodeURIComponent(env.mongo_user);
    const password = encodeURIComponent(env.mongo_password);
    return `mongodb://${username}:${password}@${env.mongo_host}/${dbName}?authSource=admin`;
  }

  return `mongodb://${env.mongo_host}/${dbName}`;
};
const mongoUri = env.mongodb_uri || buildLegacyMongoUri();
const baseMongoClientOptions = {
  serverSelectionTimeoutMS: 15000,
  maxPoolSize: 20,
  minPoolSize: 0,
  maxIdleTimeMS: 60000,
};
const mongoClientOptions = baseMongoClientOptions;
let mongoClientPromise: Promise<MongoClient> | null = null;
const getMongoClient = () => {
  if (!mongoClientPromise)
    mongoClientPromise = MongoClient.connect(mongoUri, mongoClientOptions);
  return mongoClientPromise;
};
const maskMongoUri = (uri: string) =>
  uri.replace(/\/\/([^:/?#]+):([^@/?#]+)@/, "//$1:****@");

//
// I. Initialize and set up the express app and various middlewares and packages:
//

const app: express.Application = express();
const serviceStartedAt = new Date();
const isProduction = env.is_production;
const crossSiteSession = isProduction;
const sessionTtlSeconds = 60 * 60 * 24 * 7;
const sessionCookieOptions = {
  httpOnly: true,
  sameSite: crossSiteSession ? ("none" as const) : ("lax" as const),
  secure: crossSiteSession,
  maxAge: 1000 * sessionTtlSeconds,
};

if (isProduction) {
  app.set("trust proxy", 1);
}

console.info("[session-config]", {
  nodeEnv: env.node_env,
  renderDetected: env.is_render,
  production: isProduction,
  secure: sessionCookieOptions.secure,
  sameSite: sessionCookieOptions.sameSite,
  maxAge: sessionCookieOptions.maxAge,
  httpOnly: sessionCookieOptions.httpOnly,
  trustProxy: app.get("trust proxy"),
  sessionCollection: "user_sessions",
  ttlSeconds: sessionTtlSeconds,
});

// Log requests to the console in a compact format:
app.use(logger("dev"));

// Full log of all requests to /log/access.log:
app.use(
  logger("common", {
    stream: fs.createWriteStream(
      path.join(__dirname, "..", "log", "access.log"),
      { flags: "a" },
    ),
  }),
);

// Enable response bodies to be sent as JSON:
app.use(express.json({ limit: "8mb" }));

// Handle CORS:
const configuredFrontendOrigins = (env.frontend_url || "")
  .split(",")
  .map((origin) => origin.trim().replace(/\/+$/, ""))
  .filter(Boolean);

const corsAllowlist = [
  "https://smaj.org",
  "https://www.smaj.org",
  "https://smajpihub.com",
  "https://www.smajpihub.com",
  "https://sandbox.minepi.com",
  "https://smajpihub.onrender.com",
  "http://localhost:3000",
  "http://localhost:3314",
  "http://localhost:5173",
  ...configuredFrontendOrigins,
];

const allowedOrigins = new Set(corsAllowlist);

console.info("[cors-config]", {
  credentials: true,
  allowedOrigins: [...allowedOrigins],
});

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow non-browser or same-origin server requests.
      if (!origin) {
        callback(null, true);
        return;
      }

      // Primary configured frontend origin(s).
      const normalizedOrigin = origin.replace(/\/+$/, "");

      if (allowedOrigins.has(normalizedOrigin)) {
        callback(null, true);
        return;
      }

      // Allow Codespaces preview hosts for development previews.
      if (origin.endsWith(".app.github.dev")) {
        callback(null, true);
        return;
      }

      callback(new Error(`CORS blocked origin: ${origin}`));
    },
    credentials: true,
  }),
);

// Handle cookies
app.use(cookieParser());

// Use sessions:
app.use(
  session({
    secret: env.session_secret,
    resave: false,
    saveUninitialized: false,
    cookie: sessionCookieOptions,
    ...(env.use_memory_db
      ? {}
      : {
          store: MongoStore.create({
            clientPromise: getMongoClient(),
            dbName: dbName,
            collectionName: "user_sessions",
            ttl: sessionTtlSeconds,
            autoRemove: "native",
          }),
        }),
  }) as unknown as express.RequestHandler,
);

app.use(async (req, res, next) => {
  const uid = req.session.user?.uid;
  if (!uid || !req.session.deviceSessionId || !app.locals.deviceSessionCollection) return next();
  try {
    if (await validateAndTouchDeviceSession(req, uid)) return next();
    req.session.destroy(() => undefined);
    res.clearCookie("connect.sid", sessionCookieOptions);
    return res.status(401).json({ error: "session_revoked", message: "This device was signed out. Please sign in again." });
  } catch (error) {
    console.error("Device session validation failed:", error);
    return next();
  }
});
if (env.session_debug) {
  app.use((req, _, next) => {
    const cookieHeader = req.get("cookie") || "";
    const sessionFingerprint = req.sessionID
      ? crypto
          .createHash("sha256")
          .update(req.sessionID)
          .digest("hex")
          .slice(0, 12)
      : "none";
    console.info("[session-debug]", {
      method: req.method,
      path: req.path,
      sessionFingerprint,
      hasSessionCookie: cookieHeader.includes("connect.sid="),
      hasSessionUser: Boolean(req.session.user?.userId),
      hasBearerAuth: Boolean(
        req.get("authorization") || req.get("x-smaj-access-token"),
      ),
    });
    next();
  });
}

//
// II. Mount app endpoints:
//

// Payments endpoint under /payments:
const paymentsRouter = express.Router();
mountPaymentsEndpoints(paymentsRouter);
app.use("/payments", paymentsRouter);

// User endpoints (e.g signin, signout) under /user:
const userRouter = express.Router();
mountUserEndpoints(userRouter);
app.use("/user", userRouter);

const marketplaceRouter = express.Router();
mountMarketplaceEndpoints(marketplaceRouter);
app.use("/marketplace", marketplaceRouter);

const heroBannerRouter = express.Router();
mountHeroBannerEndpoints(heroBannerRouter);
app.use("/hero-banners", heroBannerRouter);

const adminRouter = express.Router();
mountAdminEndpoints(adminRouter);
app.use("/admin", adminRouter);

// Canonical auth endpoint matching FLOWS.md Authentication section.
app.post("/signin", handleSignIn);

// Notification endpoints under /notifications:
const notificationRouter = express.Router();
mountNotificationEndpoints(notificationRouter);
app.use("/notifications", notificationRouter);

const messageRouter = express.Router();
mountMessageEndpoints(messageRouter);
app.use("/messages", messageRouter);

const onboardingRouter = express.Router();
mountOnboardingEndpoints(onboardingRouter);
app.use("/onboarding", onboardingRouter);

const supportRouter = express.Router();
mountSupportEndpoints(supportRouter);
app.use("/support", supportRouter);

const uploadRouter = express.Router();
mountUploadEndpoints(uploadRouter);
app.use("/uploads", uploadRouter);

const streamRouter = express.Router();
mountStreamEndpoints(streamRouter);
app.use("/stream", streamRouter);
app.use("/api/stream", streamRouter);

const sportsRouter = express.Router();
mountSportsEndpoints(sportsRouter);
app.use("/sports", sportsRouter);

const jobsRouter = express.Router();
mountJobsEndpoints(jobsRouter);
app.use("/jobs", jobsRouter);

const transportRouter = express.Router();
mountTransportEndpoints(transportRouter);
app.use("/transport", transportRouter);

const translationRouter = express.Router();
mountTranslationEndpoints(translationRouter);
app.use("/translations", translationRouter);

const ambassadorRouter = express.Router();
mountAmbassadorEndpoints(ambassadorRouter);
app.use("/ambassadors", ambassadorRouter);

const educationRouter = express.Router();
mountEducationEndpoints(educationRouter);
app.use("/education", educationRouter);

const coursesRouter = express.Router();
mountCourseEndpoints(coursesRouter);
app.use(coursesRouter);

app.get("/health", async (_, res) => {
  const ready = Boolean(
    app.locals.userCollection &&
    app.locals.productCollection &&
    app.locals.marketplaceOrderCollection &&
    app.locals.notificationCollection &&
    app.locals.heroBannerCollection &&
    app.locals.transportBookingCollection &&
    app.locals.transportDriverCollection &&
    app.locals.universityCollection &&
    app.locals.universityProgramCollection &&
    app.locals.universityClaimCollection &&
    app.locals.universityApplicationCollection &&
    app.locals.universityPaymentCollection,
  );

  res.status(ready ? 200 : 503).json({
    status: ready ? "ok" : "starting",
    service: "smaj-pi-hub-backend",
    database: env.use_memory_db ? "memory" : "mongodb",
    uptimeSeconds: Math.round(process.uptime()),
    startedAt: serviceStartedAt.toISOString(),
    features: {
      heroBanners: Boolean(app.locals.heroBannerCollection),
      education: Boolean(app.locals.universityCollection),
    },
  });
});

// Hello World page to check everything works:
app.get("/", async (_, res) => {
  res.status(200).send({ message: "Hello, World!" });
});

// III. Boot up the app:

const start = async () => {
  try {
    if (env.use_memory_db) {
      Object.assign(app.locals, createMemoryCollections());
      console.warn(
        "Using in-memory development database. Data resets when the backend stops.",
      );
    } else {
      const client = await getMongoClient();
      const db = client.db(dbName);
      app.locals.paymentCollection = db.collection("pi_payments");
      app.locals.marketplaceOrderCollection = db.collection("orders");
      app.locals.orderDisputeCollection = db.collection("order_disputes");
      app.locals.productCollection = db.collection("products");
      app.locals.userCollection = db.collection("users");
      app.locals.reportCollection = db.collection("reports");
      app.locals.favoriteCollection = db.collection("favorites");
      app.locals.reviewCollection = db.collection("reviews");
      app.locals.conversationCollection = db.collection("conversations");
      app.locals.messageCollection = db.collection("messages");
      app.locals.notificationCollection = db.collection("notifications");
      app.locals.pushSubscriptionCollection =
        db.collection("push_subscriptions");
      app.locals.nativePushTokenCollection = db.collection("native_push_tokens");
      app.locals.deviceSessionCollection = db.collection("device_sessions");
      app.locals.onboardingCollection = db.collection(
        "onboarding_applications",
      );
      app.locals.supportCollection = db.collection("support_requests");
      app.locals.heroBannerCollection = db.collection("hero_banners");
      app.locals.ambassadorCollection = db.collection(
        "ambassador_applications",
      );
      app.locals.streamContentCollection = db.collection("stream_content");
      app.locals.streamPostCollection = db.collection("stream_posts");
      app.locals.streamReviewCollection = db.collection("stream_reviews");
      app.locals.streamSettingsCollection = db.collection("stream_settings");
      app.locals.jobCollection = db.collection("jobs");
      app.locals.jobCompanyCollection = db.collection("job_companies");
      app.locals.jobSavedCollection = db.collection("job_saved");
      app.locals.jobApplicationCollection = db.collection("job_applications");
      app.locals.jobProfileCollection = db.collection("job_profiles");
      app.locals.jobAuditCollection = db.collection("job_audit_log");
      app.locals.jobBillingCollection = db.collection("job_billing");
      app.locals.sessionCollection = db.collection("user_sessions");
      app.locals.transportBookingCollection =
        db.collection("transport_bookings");
      app.locals.transportDriverCollection = db.collection("transport_drivers");
      app.locals.transportVehicleCollection =
        db.collection("transport_vehicles");
      app.locals.transportTripCollection = db.collection("transport_trips");
      app.locals.transportReceiptCollection =
        db.collection("transport_receipts");
      app.locals.transportNotificationCollection = db.collection(
        "transport_notifications",
      );
      app.locals.teacherApplicationCollection = db.collection("teacher_applications");
      app.locals.tutorLessonRequestCollection = db.collection("tutor_lesson_requests");
      app.locals.universityCollection = db.collection("universities");
      app.locals.universityProgramCollection = db.collection(
        "university_programs",
      );
      app.locals.universityClaimCollection = db.collection("university_claims");
      app.locals.universityApplicationCollection = db.collection(
        "university_applications",
      );
      app.locals.universityPaymentCollection = db.collection(
        "university_payments",
      );
      app.locals.courseCollection = db.collection("courses");
      app.locals.coursePaymentCollection = db.collection("course_payments");
      app.locals.enrollmentCollection = db.collection("enrollments");
      app.locals.lessonProgressCollection = db.collection("lesson_progress");
      app.locals.quizCollection = db.collection("quizzes");
      app.locals.quizSubmissionCollection = db.collection("quiz_submissions");
      app.locals.certificateCollection = db.collection("certificates");
      await Promise.all([
        app.locals.userCollection.createIndex({ uid: 1 }, { unique: true }),
        app.locals.userCollection.createIndex({ piUsername: 1 }),
        app.locals.productCollection.createIndex({
          sellerId: 1,
          createdAt: -1,
        }),
        app.locals.productCollection.createIndex({
          active: 1,
          approved: 1,
          reviewStatus: 1,
          hidden: 1,
          createdAt: -1,
        }),
        app.locals.productCollection.createIndex({
          category: 1,
          active: 1,
          approved: 1,
          reviewStatus: 1,
        }),
        app.locals.marketplaceOrderCollection.createIndex({
          buyerId: 1,
          createdAt: -1,
        }),
        app.locals.marketplaceOrderCollection.createIndex({
          sellerId: 1,
          createdAt: -1,
        }),
        app.locals.orderDisputeCollection.createIndex({
          orderId: 1,
          createdAt: -1,
        }),
        app.locals.orderDisputeCollection.createIndex({
          status: 1,
          updatedAt: -1,
        }),
        app.locals.orderDisputeCollection.createIndex(
          { orderId: 1, active: 1 },
          { unique: true, partialFilterExpression: { active: true } },
        ),
        app.locals.conversationCollection.createIndex({
          participants: 1,
          updatedAt: -1,
        }),
        app.locals.conversationCollection.createIndex(
          { pairKey: 1 },
          {
            unique: true,
            partialFilterExpression: { pairKey: { $type: "string" } },
          },
        ),
        app.locals.messageCollection.createIndex({
          conversationId: 1,
          createdAt: 1,
        }),
        app.locals.notificationCollection.createIndex({
          userId: 1,
          createdAt: -1,
        }),
        app.locals.pushSubscriptionCollection.createIndex(
          { endpoint: 1 },
          { unique: true },
        ),
        app.locals.pushSubscriptionCollection.createIndex({ userId: 1 }),
        app.locals.nativePushTokenCollection.createIndex({ token: 1 }, { unique: true }),
        app.locals.nativePushTokenCollection.createIndex({ userId: 1 }),
        app.locals.deviceSessionCollection.createIndex({ sessionKey: 1 }, { unique: true }),
        app.locals.deviceSessionCollection.createIndex({ userId: 1, active: 1, lastActiveAt: -1 }),
        app.locals.deviceSessionCollection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
        app.locals.heroBannerCollection.createIndex({
          placement: 1,
          active: 1,
          order: 1,
        }),
        app.locals.heroBannerCollection.createIndex(
          { sourceKey: 1 },
          { unique: true, sparse: true },
        ),
        app.locals.ambassadorCollection.createIndex(
          { userId: 1 },
          { unique: true },
        ),
        app.locals.ambassadorCollection.createIndex({
          status: 1,
          countryCode: 1,
          services: 1,
        }),
        app.locals.streamContentCollection.createIndex({
          creatorId: 1,
          createdAt: -1,
        }),
        app.locals.streamPostCollection.createIndex({
          creatorId: 1,
          createdAt: -1,
        }),
        app.locals.streamPostCollection.createIndex({
          visibility: 1,
          createdAt: -1,
        }),
        app.locals.streamReviewCollection.createIndex(
          { userId: 1, mediaType: 1, tmdbId: 1 },
          { unique: true },
        ),
        app.locals.streamReviewCollection.createIndex({
          status: 1,
          popularityScore: -1,
          createdAt: -1,
        }),
        app.locals.jobCollection.createIndex({ slug: 1 }, { unique: true }),
        app.locals.jobCollection.createIndex({
          status: 1,
          category: 1,
          createdAt: -1,
        }),
        app.locals.jobCollection.createIndex({
          moderationStatus: 1,
          expiresAt: 1,
          mode: 1,
        }),
        app.locals.jobCollection.createIndex({ employerId: 1, createdAt: -1 }),
        app.locals.jobCompanyCollection.createIndex(
          { slug: 1 },
          { unique: true },
        ),
        app.locals.jobCompanyCollection.createIndex({
          directoryPriority: 1,
          name: 1,
        }),
        app.locals.jobCompanyCollection.createIndex(
          { ownerId: 1 },
          { unique: true, sparse: true },
        ),
        app.locals.jobSavedCollection.createIndex(
          { userId: 1, jobId: 1 },
          { unique: true },
        ),
        app.locals.jobApplicationCollection.createIndex(
          { candidateId: 1, jobId: 1 },
          { unique: true },
        ),
        app.locals.jobApplicationCollection.createIndex({
          employerId: 1,
          status: 1,
          createdAt: -1,
        }),
        app.locals.jobProfileCollection.createIndex(
          { userId: 1 },
          { unique: true },
        ),
        app.locals.jobAuditCollection.createIndex({
          targetId: 1,
          createdAt: -1,
        }),
        app.locals.jobBillingCollection.createIndex(
          { billingId: 1 },
          { unique: true },
        ),
        app.locals.jobBillingCollection.createIndex({
          employerId: 1,
          status: 1,
          createdAt: -1,
        }),
        app.locals.streamContentCollection.createIndex(
          { cloudflareUid: 1 },
          { unique: true },
        ),
        app.locals.streamContentCollection.createIndex({
          moderationStatus: 1,
          processingStatus: 1,
          createdAt: -1,
        }),
        app.locals.sessionCollection.createIndex(
          { expires: 1 },
          { expireAfterSeconds: 0 },
        ),
        app.locals.transportBookingCollection.createIndex({
          userId: 1,
          createdAt: -1,
        }),
        app.locals.transportBookingCollection.createIndex(
          { bookingId: 1 },
          { unique: true },
        ),
        app.locals.transportDriverCollection.createIndex({ userId: 1 }),
        app.locals.transportDriverCollection.createIndex(
          { driverId: 1 },
          { unique: true },
        ),
        app.locals.transportDriverCollection.createIndex({
          "currentLocation.lat": 1,
          "currentLocation.lng": 1,
        }),
        app.locals.transportVehicleCollection.createIndex({ userId: 1 }),
        app.locals.transportVehicleCollection.createIndex(
          { vehicleId: 1 },
          { unique: true },
        ),
        app.locals.transportTripCollection.createIndex({
          userId: 1,
          createdAt: -1,
        }),
        app.locals.transportTripCollection.createIndex(
          { tripId: 1 },
          { unique: true },
        ),
        app.locals.transportReceiptCollection.createIndex({
          userId: 1,
          createdAt: -1,
        }),
        app.locals.transportReceiptCollection.createIndex(
          { receiptId: 1 },
          { unique: true },
        ),
        app.locals.transportNotificationCollection.createIndex({
          userId: 1,
          createdAt: -1,
        }),
        app.locals.teacherApplicationCollection.createIndex({ user_id: 1 }, { unique: true }),
        app.locals.teacherApplicationCollection.createIndex({ status: 1, submitted_at: -1 }),
        app.locals.tutorLessonRequestCollection.createIndex({ student_id: 1, created_at: -1 }),
        app.locals.tutorLessonRequestCollection.createIndex({ tutor_id: 1, status: 1, created_at: -1 }),
        app.locals.universityCollection.createIndex(
          { slug: 1 },
          { unique: true },
        ),
        app.locals.universityCollection.createIndex({
          partnership_status: 1,
          country: 1,
          updated_at: -1,
        }),
        app.locals.universityProgramCollection.createIndex({
          university_id: 1,
          created_at: -1,
        }),
        app.locals.universityClaimCollection.createIndex({
          university_id: 1,
          review_status: 1,
          submitted_at: -1,
        }),
        app.locals.universityApplicationCollection.createIndex({
          applicant_id: 1,
          created_at: -1,
        }),
        app.locals.universityApplicationCollection.createIndex({
          university_id: 1,
          status: 1,
          created_at: -1,
        }),
        app.locals.universityPaymentCollection.createIndex({
          user_id: 1,
          created_at: -1,
        }),
        app.locals.universityPaymentCollection.createIndex({
          university_id: 1,
          status: 1,
          created_at: -1,
        }),
        app.locals.courseCollection.createIndex({ slug: 1 }, { unique: true }),
        app.locals.courseCollection.createIndex({
          status: 1,
          published_at: -1,
          enrollment_count: -1,
        }),
        app.locals.courseCollection.createIndex({
          category: 1,
          level: 1,
          course_type: 1,
          status: 1,
        }),
        app.locals.courseCollection.createIndex({
          instructor_id: 1,
          created_at: -1,
        }),
        app.locals.enrollmentCollection.createIndex({
          user_id: 1,
          created_at: -1,
        }),
        app.locals.enrollmentCollection.createIndex({
          course_id: 1,
          status: 1,
        }),
        app.locals.certificateCollection.createIndex(
          { certificate_id: 1 },
          { unique: true },
        ),
        app.locals.certificateCollection.createIndex({
          user_id: 1,
          created_at: -1,
        }),
      ]);
    }

    console.log(
      env.use_memory_db
        ? "Connected to in-memory development database"
        : `Connected to MongoDB on: ${maskMongoUri(mongoUri)}`,
    );

    app.listen(env.port, () => {
      console.log(`SMAJ PI HUB backend listening on port ${env.port}!`);
      console.log(
        `CORS config: configured to respond to a frontend hosted on ${env.frontend_url}`,
      );
    });
  } catch (err) {
    console.error("Connection to MongoDB failed: ", err);
    process.exit(1);
  }
};

start();
