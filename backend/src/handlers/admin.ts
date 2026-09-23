import { Request, Response, Router } from "express";
import { ObjectId } from "mongodb";
import { createNotification } from "../services/notifications";
import { resolveCurrentUser, setSessionUser } from "../services/auth";
import env from "../environments";
import { canTransitionOrder, releaseOrderInventory, timelineEntry } from "../services/orderLifecycle";

const serialize = (document: Record<string, any>) => ({ ...document, _id: document._id.toString(), accessToken: undefined });
const verificationLabel = (level: string) => level === "trusted_seller" ? "Trusted Seller" : level === "seller_verified" ? "Seller Verified" : level === "pi_verified" || level === "verified" ? "Pi Verified" : "Basic";
const normalizePiUsername = (username = "") => username.trim().replace(/^@+/, "").toLowerCase();
const isConfiguredAdminUser = (user: Record<string, any>) => {
  const usernames = [user.piUsername, user.username].map((value) => normalizePiUsername(String(value || "")));
  return usernames.some((username) => env.admin_pi_usernames.includes(username));
};
const activityTime = (document: Record<string, any>, ...fields: string[]) => {
  for (const field of fields) {
    if (document[field]) return new Date(document[field]);
  }
  return new Date(0);
};
const serializeActivity = (item: { type: string; label: string; description: string; createdAt: Date; href?: string }) => ({
  ...item,
  createdAt: item.createdAt.toISOString(),
});

const defaultHeroBanners = [
  { sourceKey: "dashboard-welcome", placement: "dashboard", image: "/assets/smaj-mobile-hero-v2.png", title: "Welcome to SMAJ PI HUB", subtitle: "Everything you need. One place.", search: "", textColor: "#ffffff", order: 0 },
  { sourceKey: "dashboard-business", placement: "dashboard", image: "/assets/smaj-mobile-hero-business.jpg", title: "Build your business", subtitle: "Discover connected tools, sellers, and services.", search: "", textColor: "#ffffff", order: 1 },
  { sourceKey: "dashboard-work", placement: "dashboard", image: "/assets/smaj-mobile-hero-work.jpg", title: "Work and grow", subtitle: "Access opportunities across the SMAJ ecosystem.", search: "", textColor: "#ffffff", order: 2 },
  { sourceKey: "store-big-pi-deals", placement: "store", image: "https://images.unsplash.com/photo-1512436991641-6745cdb1723f?auto=format&fit=crop&w=1600&q=85", title: "Big Pi Deals", subtitle: "Shop trusted products across the SMAJ ecosystem with Pi-powered checkout.", search: "Deals", textColor: "#ffffff", order: 0 },
  { sourceKey: "store-electronics-week", placement: "store", image: "https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&w=1600&q=85", title: "Electronics Week", subtitle: "Phones, gaming, headphones, and laptops from verified SMAJ sellers.", search: "Electronics", textColor: "#ffffff", order: 1 },
  { sourceKey: "store-fashion-deals", placement: "store", image: "https://images.unsplash.com/photo-1445205170230-053b83016050?auto=format&fit=crop&w=1600&q=85", title: "Fashion Deals", subtitle: "Discover premium looks, everyday essentials, and Pi-exclusive savings.", search: "Fashion", textColor: "#ffffff", order: 2 },
  { sourceKey: "store-home-essentials", placement: "store", image: "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1600&q=85", title: "Home Essentials", subtitle: "Refresh your space with furniture, decor, kitchen picks, and appliances.", search: "Home", textColor: "#ffffff", order: 3 },
] as const;

const safeCount = async (collection: { countDocuments?: (query?: Record<string, any>) => Promise<number> } | undefined, query: Record<string, any> = {}): Promise<number> => {
  if (!collection || typeof collection.countDocuments !== "function") return 0;
  try {
    return await collection.countDocuments(query);
  } catch {
    return 0;
  }
};

const safeSessionSummary = (document: Record<string, any>) => {
  let payload: Record<string, any> = {};
  try {
    payload = typeof document.session === "string" ? JSON.parse(document.session) : document.session || {};
  } catch {
    payload = {};
  }

  const fieldBytes = Object.fromEntries(Object.entries(payload).map(([key, value]) => [key, Buffer.byteLength(JSON.stringify(value))]));
  return {
    documentBytes: Buffer.byteLength(JSON.stringify(document)),
    sessionKeys: Object.keys(payload),
    userKeys: payload.user && typeof payload.user === "object" ? Object.keys(payload.user) : [],
    cookie: payload.cookie ? {
      originalMaxAge: payload.cookie.originalMaxAge ?? null,
      expires: payload.cookie.expires ?? null,
      secure: payload.cookie.secure ?? null,
      sameSite: payload.cookie.sameSite ?? null,
      httpOnly: payload.cookie.httpOnly ?? null,
    } : null,
    fieldBytes,
  };
};

const requireAdmin = async (req: Request, res: Response) => {
  const currentUser = await resolveCurrentUser(req);
  if (!currentUser) {
    res.status(401).json({ error: "unauthorized", message: "User needs to sign in first" });
    return null;
  }
  const configuredAdmin = isConfiguredAdminUser(currentUser);
  if (currentUser.role !== "admin" && !configuredAdmin) {
    res.status(403).json({ error: "Admin access required" });
    return null;
  }
  if (configuredAdmin && currentUser.role !== "admin") {
    await req.app.locals.userCollection.updateOne(
      { uid: currentUser.uid },
      { $set: { role: "admin", roles: ["admin"], updatedAt: new Date() } },
    );
    if (req.session.user?.userId) setSessionUser(req, { ...currentUser, role: "admin", roles: ["admin"] });
  }
  return currentUser;
};

export default function mountAdminEndpoints(router: Router) {
  router.use((_, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  router.use(async (req, res, next) => { if (await requireAdmin(req, res)) next(); });

  const heroUpdates = (body: Record<string, any>, partial = false) => {
    const updates: Record<string, any> = {};
    if (!partial || body.placement !== undefined) {
      if (!["dashboard", "store"].includes(body.placement)) throw new Error("Choose dashboard or store.");
      updates.placement = body.placement;
    }
    if (!partial || body.image !== undefined) {
      const image = String(body.image || "").trim();
      if (!image) throw new Error("Banner image is required.");
      updates.image = image.slice(0, 2048);
    }
    if (body.title !== undefined) updates.title = String(body.title || "").trim().slice(0, 120);
    if (body.subtitle !== undefined) updates.subtitle = String(body.subtitle || "").trim().slice(0, 300);
    if (body.search !== undefined) updates.search = String(body.search || "").trim().slice(0, 120);
    if (body.textColor !== undefined) {
      const textColor = String(body.textColor || "").trim();
      if (!/^#[0-9a-fA-F]{6}$/.test(textColor)) throw new Error("Choose a valid text color.");
      updates.textColor = textColor.toLowerCase();
    }
    if (body.active !== undefined) updates.active = Boolean(body.active);
    if (body.order !== undefined) updates.order = Math.max(0, Math.min(999, Number(body.order) || 0));
    return updates;
  };

  router.get("/hero-banners", async (req, res) => {
    const collection = req.app.locals.heroBannerCollection;
    if (!collection) return res.status(503).json({ error: "service_unavailable", message: "Hero banner storage is still starting." });
    const banners = await collection.find({}).sort({ order: 1 }).toArray();
    return res.status(200).json({ banners: banners.map(serialize) });
  });

  router.post("/hero-banners/import-defaults", async (req, res) => {
    const collection = req.app.locals.heroBannerCollection;
    if (!collection) return res.status(503).json({ error: "service_unavailable", message: "Hero banner storage is still starting." });
    const now = new Date();
    const results = await Promise.all(defaultHeroBanners.map((banner) => collection.updateOne(
      { sourceKey: banner.sourceKey },
      { $setOnInsert: { ...banner, active: true, createdAt: now, updatedAt: now } },
      { upsert: true },
    )));
    const imported = results.filter((result: Record<string, any>) => result.upsertedId).length;
    const banners = await collection.find({}).sort({ order: 1 }).toArray();
    return res.status(200).json({ message: imported ? `Imported ${imported} existing banner${imported === 1 ? "" : "s"}.` : "Existing banners are already imported.", imported, banners: banners.map(serialize) });
  });

  router.post("/hero-banners", async (req, res) => {
    try {
      const now = new Date();
      const banner = { ...heroUpdates(req.body || {}), active: req.body?.active !== false, order: Number(req.body?.order) || 0, createdAt: now, updatedAt: now };
      const result = await req.app.locals.heroBannerCollection.insertOne(banner);
      return res.status(201).json({ message: "Hero banner created.", banner: serialize({ ...banner, _id: result.insertedId }) });
    } catch (error: any) {
      return res.status(400).json({ error: "bad_request", message: error.message });
    }
  });

  router.patch("/hero-banners/:id", async (req, res) => {
    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: "bad_request", message: "Invalid banner id." });
    try {
      await req.app.locals.heroBannerCollection.updateOne({ _id: new ObjectId(req.params.id) }, { $set: { ...heroUpdates(req.body || {}, true), updatedAt: new Date() } });
      const banner = await req.app.locals.heroBannerCollection.findOne({ _id: new ObjectId(req.params.id) });
      if (!banner) return res.status(404).json({ error: "not_found", message: "Banner not found." });
      return res.status(200).json({ message: "Hero banner updated.", banner: serialize(banner) });
    } catch (error: any) {
      return res.status(400).json({ error: "bad_request", message: error.message });
    }
  });

  router.delete("/hero-banners/:id", async (req, res) => {
    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: "bad_request", message: "Invalid banner id." });
    const result = await req.app.locals.heroBannerCollection.deleteOne({ _id: new ObjectId(req.params.id) });
    if (!result.deletedCount) return res.status(404).json({ error: "not_found", message: "Banner not found." });
    return res.status(200).json({ message: "Hero banner deleted." });
  });

  router.get("/stats", async (req, res) => {
    try {
      const { userCollection, productCollection, marketplaceOrderCollection, reportCollection, supportCollection, onboardingCollection, ambassadorCollection, notificationCollection, jobCollection, jobCompanyCollection, jobProfileCollection } = req.app.locals;
      const sellerQuery = { $or: [{ role: "seller" }, { sellerActive: true }] };
      const activeProductQuery = { active: true, hidden: { $ne: true }, approved: true, reviewStatus: "approved" };
      const pendingProductQuery = { hidden: { $ne: true }, $or: [{ reviewStatus: "pending" }, { approved: false, reviewStatus: { $ne: "rejected" } }] };
      const rejectedProductQuery = { $or: [{ reviewStatus: "rejected" }, { approved: false, rejectionReason: { $exists: true, $ne: "" } }] };
      const failedCancelledPaymentQuery = { $or: [{ paymentStatus: { $in: ["failed", "cancelled"] } }, { status: "cancelled" }] };
      const unreadReportQuery = { resolved: { $ne: true } };
      const [
        totalUsers,
        activeUsers,
        piVerifiedUsers,
        sellers,
        sellerVerifiedUsers,
        trustedSellers,
        totalProducts,
        activeProducts,
        pendingProducts,
        rejectedProducts,
        totalOrders,
        pendingOrders,
        paidOrders,
        completedOrders,
        failedCancelledPayments,
        marketplaceReports,
        unreadMarketplaceReports,
        supportRequests,
        unreadSupportRequests,
        onboardingApplications,
        pendingOnboarding,
        ambassadorApplications,
        pendingAmbassadors,
        notifications,
        unreadNotifications,
        pendingJobs,
        pendingJobCompanies,
        pendingJobProfiles,
      ] = await Promise.all([
        safeCount(userCollection),
        safeCount(userCollection, { blocked: { $ne: true } }),
        safeCount(userCollection, { verificationStatus: "approved", verificationLevel: { $in: ["pi_verified", "seller_verified", "trusted_seller", "verified"] } }),
        safeCount(userCollection, sellerQuery),
        safeCount(userCollection, { verificationStatus: "approved", verificationLevel: { $in: ["seller_verified", "trusted_seller"] } }),
        safeCount(userCollection, { verificationStatus: "approved", verificationLevel: "trusted_seller" }),
        safeCount(productCollection),
        safeCount(productCollection, activeProductQuery),
        safeCount(productCollection, pendingProductQuery),
        safeCount(productCollection, rejectedProductQuery),
        safeCount(marketplaceOrderCollection),
        safeCount(marketplaceOrderCollection, { status: "pending" }),
        safeCount(marketplaceOrderCollection, { status: { $in: ["paid", "completed", "delivered"] } }),
        safeCount(marketplaceOrderCollection, { status: "completed" }),
        safeCount(marketplaceOrderCollection, failedCancelledPaymentQuery),
        safeCount(reportCollection),
        safeCount(reportCollection, unreadReportQuery),
        safeCount(supportCollection),
        safeCount(supportCollection, unreadReportQuery),
        safeCount(onboardingCollection),
        safeCount(onboardingCollection, { status: "pending" }),
        safeCount(ambassadorCollection),
        safeCount(ambassadorCollection, { status: "pending" }),
        safeCount(notificationCollection),
        safeCount(notificationCollection, { read: false }),
        safeCount(jobCollection, { moderationStatus: "pending" }),
        safeCount(jobCompanyCollection, { verificationStatus: "pending" }),
        safeCount(jobProfileCollection, { verificationStatus: "pending" }),
      ]);
      const reports = marketplaceReports + supportRequests;
      const pendingJobsModeration = pendingJobs + pendingJobCompanies + pendingJobProfiles;
    const unreadReports = unreadMarketplaceReports + unreadSupportRequests;
    return res.status(200).json({
      stats: {
        totalUsers,
        activeUsers,
        piVerifiedUsers,
        sellers,
        sellerVerifiedUsers,
        trustedSellers,
        totalProducts,
        activeProducts,
        pendingProducts,
        rejectedProducts,
        totalOrders,
        pendingOrders,
        paidOrders,
        completedOrders,
        failedCancelledPayments,
        reports,
        unreadReports,
        marketplaceReports,
        unreadMarketplaceReports,
        supportRequests,
        unreadSupportRequests,
        onboardingApplications,
        pendingOnboarding,
        ambassadorApplications,
        pendingAmbassadors,
        notifications,
        unreadNotifications,
        reportedProducts: unreadMarketplaceReports,
        pendingJobs,
        pendingJobCompanies,
        pendingJobProfiles,
        pendingJobsModeration,
      },
      updatedAt: new Date().toISOString(),
    });
    } catch (error) {
      console.error("Failed to load admin stats:", error);
      return res.status(500).json({ error: "Failed to load admin stats" });
    }
  });

  router.get("/session-diagnostics", async (req, res) => {
    const sessionCollection = req.app.locals.sessionCollection;
    if (!sessionCollection) return res.status(503).json({ error: "service_unavailable", message: "Session collection is not available" });

    const now = new Date();
    const [activeSessions, expiredSessions, indexes, sampleSessions] = await Promise.all([
      sessionCollection.countDocuments({ expires: { $gt: now } }),
      sessionCollection.countDocuments({ expires: { $lte: now } }),
      sessionCollection.indexes(),
      sessionCollection.find({}, { projection: { _id: 0, session: 1, expires: 1 } }).limit(25).toArray(),
    ]);
    const sizes = sampleSessions.map((item: Record<string, unknown>) => Buffer.byteLength(JSON.stringify(item)));
    const averageDocumentBytes = sizes.length ? Math.round(sizes.reduce((sum: number, size: number) => sum + size, 0) / sizes.length) : 0;
    const expiryIndex = indexes.find((index: Record<string, any>) => index.key?.expires === 1);
    const sessionSamples = sampleSessions.slice(0, 5).map(safeSessionSummary);

    return res.status(200).json({
      collectionName: "user_sessions",
      activeSessions,
      expiredSessions,
      averageDocumentBytes,
      expiryIndex: expiryIndex ? {
        name: expiryIndex.name,
        key: expiryIndex.key,
        expireAfterSeconds: expiryIndex.expireAfterSeconds,
      } : null,
      sessionSamples,
      expectedSessionKeys: ["cookie", "user"],
      expectedUserKeys: ["userId", "piUsername", "role"],
      ttlSeconds: 60 * 60 * 24 * 7,
    });
  });

  router.get("/activity", async (req, res) => {
    const [users, applications, ambassadors, products, orders, reports, supportRequests] = await Promise.all([
      req.app.locals.userCollection.find({}).sort({ createdAt: -1 }).limit(8).toArray(),
      req.app.locals.onboardingCollection.find({}).sort({ createdAt: -1 }).limit(8).toArray(),
      req.app.locals.ambassadorCollection.find({}).sort({ createdAt: -1 }).limit(8).toArray(),
      req.app.locals.productCollection.find({}).sort({ updatedAt: -1, reviewedAt: -1, createdAt: -1 }).limit(12).toArray(),
      req.app.locals.marketplaceOrderCollection.find({}).sort({ updatedAt: -1, createdAt: -1 }).limit(12).toArray(),
      req.app.locals.reportCollection.find({}).sort({ createdAt: -1 }).limit(8).toArray(),
      req.app.locals.supportCollection.find({}).sort({ createdAt: -1 }).limit(8).toArray(),
    ]);
    const activity = [
      ...users.map((user: Record<string, any>) => ({
        type: "user_joined",
        label: "New user joined",
        description: user.displayName || user.piUsername || user.username || "Pi user",
        createdAt: activityTime(user, "createdAt"),
        href: "/admin/users",
      })),
      ...applications.map((application: Record<string, any>) => ({
        type: "seller_applied",
        label: "Seller applied",
        description: `${application.fullName || "Applicant"} - ${application.status || "pending"}`,
        createdAt: activityTime(application, "createdAt"),
        href: "/admin/onboarding",
      })),
      ...ambassadors.map((application: Record<string, any>) => ({
        type: "ambassador_applied",
        label: "Ambassador applied",
        description: `${application.displayName || "Applicant"} - ${application.status || "pending"}`,
        createdAt: activityTime(application, "updatedAt", "createdAt"),
        href: "/admin/ambassadors",
      })),
      ...products.map((product: Record<string, any>) => {
        const status = product.reviewStatus === "approved" ? "Product approved" : product.reviewStatus === "rejected" ? "Product rejected" : "Product submitted";
        return {
          type: product.reviewStatus === "approved" ? "product_approved" : product.reviewStatus === "rejected" ? "product_rejected" : "product_submitted",
          label: status,
          description: `${product.title || "Product"}${product.sellerName ? ` by ${product.sellerName}` : ""}`,
          createdAt: activityTime(product, "reviewedAt", "updatedAt", "createdAt"),
          href: "/admin/products",
        };
      }),
      ...orders.map((order: Record<string, any>) => {
        const failed = ["failed", "cancelled"].includes(order.paymentStatus) || order.status === "cancelled";
        const completed = ["paid", "completed", "delivered"].includes(order.status) || order.paymentStatus === "paid";
        return {
          type: failed ? "payment_failed" : completed ? "payment_completed" : "order_created",
          label: failed ? "Payment failed/cancelled" : completed ? "Payment completed" : "Order created",
          description: order.productTitle || order.paymentId || order._id.toString(),
          createdAt: activityTime(order, "updatedAt", "paidAt", "createdAt"),
          href: "/admin/orders",
        };
      }),
      ...reports.map((report: Record<string, any>) => ({
        type: "report_submitted",
        label: "Report submitted",
        description: report.reason || report.targetName || report.targetType || "Marketplace report",
        createdAt: activityTime(report, "createdAt"),
        href: "/admin/reports",
      })),
      ...supportRequests.map((request: Record<string, any>) => ({
        type: "report_submitted",
        label: "Support report submitted",
        description: request.topic || request.message || request.email || "Support request",
        createdAt: activityTime(request, "createdAt"),
        href: "/admin/reports",
      })),
    ].filter((item) => item.createdAt.getTime() > 0)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 20)
      .map(serializeActivity);
    return res.status(200).json({ activity, updatedAt: new Date().toISOString() });
  });

  router.get("/users", async (req, res) => {
    const users = await req.app.locals.userCollection.find({}).sort({ createdAt: -1 }).toArray();
    return res.status(200).json({ users: users.map(serialize) });
  });

  router.patch("/users/:id", async (req, res) => {
    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: "bad_request", message: "Invalid user id" });
    const updates: Record<string, unknown> = {};
    if (typeof req.body?.blocked === "boolean") updates.blocked = req.body.blocked;
    if (["buyer", "seller", "admin"].includes(req.body?.role)) {
      updates.role = req.body.role;
      updates.roles = [req.body.role];
    }
    if (["basic", "pi_verified", "seller_verified", "trusted_seller", "verified"].includes(req.body?.verificationLevel)) {
      updates.verificationLevel = req.body.verificationLevel === "verified" ? "pi_verified" : req.body.verificationLevel;
      updates.verificationStatus = req.body.verificationLevel === "basic" ? "none" : "approved";
      updates.verificationRequested = false;
      updates.verificationRequestType = "";
    }
    if (["none", "pending", "approved", "rejected"].includes(req.body?.verificationStatus)) {
      updates.verificationStatus = req.body.verificationStatus;
      updates.verificationRequested = req.body.verificationStatus === "pending";
      if (req.body.verificationStatus !== "approved" && req.body.verificationStatus !== "pending") updates.verificationLevel = "basic";
    }
    if (!Object.keys(updates).length) return res.status(400).json({ error: "bad_request", message: "No valid user update supplied" });
    const before = await req.app.locals.userCollection.findOne({ _id: new ObjectId(req.params.id) });
    await req.app.locals.userCollection.updateOne({ _id: new ObjectId(req.params.id) }, { $set: updates });
    const after = await req.app.locals.userCollection.findOne({ _id: new ObjectId(req.params.id) });
    if (after?.uid && (updates.verificationLevel || updates.verificationStatus)) {
      await req.app.locals.productCollection.updateMany(
        { sellerId: after.uid },
        { $set: { verificationLevel: after.verificationStatus === "approved" ? after.verificationLevel || "basic" : "basic", verificationStatus: after.verificationStatus || "none" } },
      );
      const status = String(after.verificationStatus || "none");
      const level = String(after.verificationLevel || "basic");
      const title = status === "approved" ? "Verification approved" : status === "rejected" ? "Verification rejected" : status === "pending" ? "Verification pending" : "Verification updated";
      const message = status === "approved"
        ? `Your account is now ${verificationLabel(level)}.`
        : status === "rejected"
          ? "Your verification request was not approved. You can update your profile and request again."
          : status === "pending"
            ? "Your verification request is still under team review."
            : "Your verification badge was removed or reset by admin.";
      if (before?.verificationLevel !== after.verificationLevel || before?.verificationStatus !== after.verificationStatus) {
        await createNotification(req.app, { userId: after.uid, type: "verification_update", title, message, relatedId: "settings" });
      }
    }
    return res.status(200).json({ message: "User updated", user: serialize(after) });
  });

  router.get("/verification-requests", async (req, res) => {
    const users = await req.app.locals.userCollection.find({ verificationRequested: true }).sort({ verificationRequestedAt: -1 }).toArray();
    return res.status(200).json({ users: users.map(serialize) });
  });

  router.get("/products", async (req, res) => {
    const products = await req.app.locals.productCollection.find({}).sort({ createdAt: -1 }).toArray();
    return res.status(200).json({ products: products.map(serialize) });
  });

  router.patch("/products/:id", async (req, res) => {
    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: "bad_request", message: "Invalid product id" });
    const updates: Record<string, unknown> = {};
    if (typeof req.body?.approved === "boolean") {
      updates.approved = req.body.approved;
      updates.reviewStatus = req.body.approved ? "approved" : "rejected";
      updates.rejectionReason = req.body.approved ? "" : String(req.body?.rejectionReason || "Product did not meet marketplace review requirements.").trim().slice(0, 500);
      updates.reviewedAt = new Date();
      updates.reviewedBy = req.session.user?.userId;
    }
    if (typeof req.body?.hidden === "boolean") updates.hidden = req.body.hidden;
    if (!Object.keys(updates).length) return res.status(400).json({ error: "bad_request", message: "No valid product update supplied" });
    const product = await req.app.locals.productCollection.findOne({ _id: new ObjectId(req.params.id) });
    await req.app.locals.productCollection.updateOne({ _id: new ObjectId(req.params.id) }, { $set: updates });
    if (product && typeof req.body?.approved === "boolean") await createNotification(req.app, {
      userId: product.sellerId,
      type: req.body.approved ? "product_approved" : "product_rejected",
      title: req.body.approved ? "Product approved" : "Product needs changes",
      message: req.body.approved ? `${product.title} is approved for the Store` : `${product.title} was rejected: ${updates.rejectionReason}`,
      relatedId: req.params.id,
      image: product.image,
    });
    if (product && typeof req.body?.hidden === "boolean") await createNotification(req.app, { userId: product.sellerId, type: "product_hidden", title: req.body.hidden ? "Product hidden" : "Product visible", message: `${product.title} visibility was updated`, relatedId: req.params.id, image: product.image });
    return res.status(200).json({ message: "Product updated" });
  });

  router.get("/onboarding", async (req, res) => {
    const applications = await req.app.locals.onboardingCollection.find({}).sort({ createdAt: -1 }).toArray();
    return res.status(200).json({ applications: applications.map(serialize) });
  });

  router.patch("/onboarding/:id", async (req, res) => {
    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: "bad_request", message: "Invalid application id" });
    const status = req.body?.status;
    if (!["pending", "approved", "rejected", "contacted"].includes(status)) {
      return res.status(400).json({ error: "bad_request", message: "Invalid application status" });
    }
    await req.app.locals.onboardingCollection.updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { status, reviewedAt: new Date(), reviewedBy: req.session.user?.userId, updatedAt: new Date() } },
    );
    return res.status(200).json({ message: "Application updated" });
  });

  router.get("/ambassadors", async (req, res) => {
    const applications = await req.app.locals.ambassadorCollection.find({}).sort({ createdAt: -1, updatedAt: -1 }).toArray();
    return res.status(200).json({ applications: applications.map(serialize) });
  });

  router.patch("/ambassadors/:id", async (req, res) => {
    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: "bad_request", message: "Invalid ambassador application id" });
    const status = req.body?.status;
    if (!["pending", "approved", "rejected"].includes(status)) {
      return res.status(400).json({ error: "bad_request", message: "Invalid ambassador application status" });
    }
    const application = await req.app.locals.ambassadorCollection.findOne({ _id: new ObjectId(req.params.id) });
    if (!application) return res.status(404).json({ error: "not_found", message: "Ambassador application not found" });
    const now = new Date();
    const updates: Record<string, any> = {
      status,
      reviewedAt: now,
      reviewedBy: req.session.user?.userId,
      updatedAt: now,
      approvedAt: status === "approved" ? now : null,
    };
    await req.app.locals.ambassadorCollection.updateOne({ _id: application._id }, { $set: updates });
    await createNotification(req.app, {
      userId: application.userId,
      type: "ambassador_application_status",
      title: status === "approved" ? "Ambassador application approved" : status === "rejected" ? "Ambassador application update" : "Ambassador application pending",
      message: status === "approved" ? "Your SMAJ Ambassador application was approved. You are now visible in the ambassador directory." : status === "rejected" ? "Your SMAJ Ambassador application was not approved. You can update and resubmit it from Services." : "Your SMAJ Ambassador application is under review.",
      relatedId: req.params.id,
    });
    const updated = await req.app.locals.ambassadorCollection.findOne({ _id: application._id });
    return res.status(200).json({ message: `Ambassador application ${status}.`, application: serialize(updated) });
  });

  router.delete("/products/:id", async (req, res) => {
    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: "bad_request", message: "Invalid product id" });
    await req.app.locals.productCollection.deleteOne({ _id: new ObjectId(req.params.id) });
    return res.status(200).json({ message: "Product deleted" });
  });

  router.get("/orders", async (req, res) => {
    const orders = await req.app.locals.marketplaceOrderCollection.find({}).sort({ createdAt: -1 }).toArray();
    return res.status(200).json({ orders: orders.map(serialize) });
  });

  router.patch("/orders/:id", async (req, res) => {
    if (!ObjectId.isValid(req.params.id) || !["processing", "shipped", "delivered", "completed", "cancelled"].includes(req.body?.status)) {
      return res.status(400).json({ error: "bad_request", message: "Invalid order update" });
    }
    const order = await req.app.locals.marketplaceOrderCollection.findOne({ _id: new ObjectId(req.params.id) });
    if (!order) return res.status(404).json({ error: "not_found", message: "Order not found" });
    if (!canTransitionOrder(order.status, req.body.status)) {
      return res.status(409).json({ error: "invalid_transition", message: `Order cannot move from ${order.status} to ${req.body.status}` });
    }
    const now = new Date();
    const result = await req.app.locals.marketplaceOrderCollection.updateOne(
      { _id: order._id, status: order.status },
      { $set: {
        status: req.body.status,
        updatedAt: now,
        timeline: [...(Array.isArray(order.timeline) ? order.timeline : []), timelineEntry(req.body.status, `Admin marked order ${req.body.status}`)],
      } },
    );
    if (!result.modifiedCount) return res.status(409).json({ error: "order_changed", message: "Order changed while it was being updated" });
    if (req.body.status === "cancelled") await releaseOrderInventory(req.app, order, "admin_cancelled");
    return res.status(200).json({ message: "Order updated" });
  });

  router.patch("/orders/:id/refund", async (req, res) => {
    if (!ObjectId.isValid(req.params.id) || !["approve", "reject", "complete"].includes(req.body?.action)) {
      return res.status(400).json({ error: "bad_request", message: "Invalid refund action" });
    }
    const order = await req.app.locals.marketplaceOrderCollection.findOne({ _id: new ObjectId(req.params.id) });
    if (!order) return res.status(404).json({ error: "not_found", message: "Order not found" });
    const action = req.body.action;
    if (action !== "complete" && order.refundStatus !== "requested") {
      return res.status(409).json({ error: "invalid_refund_state", message: "Refund is not awaiting review" });
    }
    if (action === "complete" && !["approved", "manual_required"].includes(order.refundStatus)) {
      return res.status(409).json({ error: "invalid_refund_state", message: "Refund must be approved first" });
    }
    const reference = String(req.body?.reference || "").trim();
    if (action === "complete" && reference.length < 6) {
      return res.status(400).json({ error: "bad_request", message: "A manual Pi refund transaction reference is required" });
    }
    const note = String(req.body?.note || "").trim().slice(0, 500);
    const refundStatus = action === "approve" ? "manual_required" : action === "reject" ? "rejected" : "completed";
    const now = new Date();
    const refundUpdate = await req.app.locals.marketplaceOrderCollection.updateOne({
      _id: order._id,
      refundStatus: action === "complete" ? { $in: ["approved", "manual_required"] } : "requested",
    }, { $set: {
      refundStatus,
      refundReviewNote: note,
      refundReviewedBy: req.session.user?.userId,
      refundReviewedAt: now,
      refundReference: action === "complete" ? reference : order.refundReference || null,
      refundedAt: action === "complete" ? now : null,
      updatedAt: now,
    } });
    if (!refundUpdate.modifiedCount) return res.status(409).json({ error: "refund_changed", message: "Refund changed while it was being updated" });
    await createNotification(req.app, {
      userId: order.buyerId,
      type: "refund_update",
      title: action === "complete" ? "Refund recorded" : action === "reject" ? "Refund request declined" : "Refund approved",
      message: action === "approve" ? "Your refund was approved. A separate Pi return transaction must now be completed and recorded." : action === "complete" ? "The Pi return transaction was recorded for your order." : "Your refund request was reviewed and declined.",
      relatedId: req.params.id,
      image: order.productImage,
    });
    return res.status(200).json({ message: "Refund updated", refundStatus });
  });

  router.get("/disputes", async (req, res) => {
    const disputes = await req.app.locals.orderDisputeCollection.find({}).sort({ updatedAt: -1 }).toArray();
    return res.status(200).json({ disputes: disputes.map(serialize) });
  });

  router.patch("/disputes/:id", async (req, res) => {
    if (!ObjectId.isValid(req.params.id) || !["under_review", "resolved", "rejected"].includes(req.body?.status)) {
      return res.status(400).json({ error: "bad_request", message: "Invalid dispute update" });
    }
    const dispute = await req.app.locals.orderDisputeCollection.findOne({ _id: new ObjectId(req.params.id) });
    if (!dispute) return res.status(404).json({ error: "not_found", message: "Dispute not found" });
    const allowed = dispute.status === "open"
      ? ["under_review", "resolved", "rejected"]
      : dispute.status === "under_review" ? ["resolved", "rejected"] : [];
    if (!allowed.includes(req.body.status)) return res.status(409).json({ error: "invalid_transition", message: "Dispute status cannot move backwards" });
    const resolution = String(req.body?.resolution || "").trim().slice(0, 1000);
    if (["resolved", "rejected"].includes(req.body.status) && resolution.length < 5) {
      return res.status(400).json({ error: "bad_request", message: "A resolution note is required" });
    }
    const now = new Date();
    const disputeUpdate = await req.app.locals.orderDisputeCollection.updateOne(
      { _id: dispute._id, status: dispute.status },
      { $set: { status: req.body.status, active: !["resolved", "rejected"].includes(req.body.status), resolution, reviewedBy: req.session.user?.userId, resolvedAt: ["resolved", "rejected"].includes(req.body.status) ? now : null, updatedAt: now } },
    );
    if (!disputeUpdate.modifiedCount) return res.status(409).json({ error: "dispute_changed", message: "Dispute changed while it was being updated" });
    await Promise.all([
      req.app.locals.marketplaceOrderCollection.updateOne({ _id: new ObjectId(dispute.orderId) }, { $set: { disputeStatus: req.body.status, updatedAt: now } }),
      ...[dispute.buyerId, dispute.sellerId].filter(Boolean).map((userId: string) => createNotification(req.app, { userId, type: "dispute_update", title: "Order dispute updated", message: `The order dispute is now ${String(req.body.status).replace("_", " ")}.`, relatedId: dispute.orderId })),
    ]);
    return res.status(200).json({ message: "Dispute updated" });
  });

  router.get("/reports", async (req, res) => {
    const [productReports, supportRequests] = await Promise.all([
      req.app.locals.reportCollection.find({}).sort({ createdAt: -1 }).toArray(),
      req.app.locals.supportCollection.find({}).sort({ createdAt: -1 }).toArray(),
    ]);
    const reports = [
      ...productReports.map((report: Record<string, any>) => ({ ...serialize(report), source: "marketplace" })),
      ...supportRequests.map((request: Record<string, any>) => ({
        ...serialize(request),
        targetType: request.source || "support",
        targetId: request.userId || request.email || "public",
        reason: request.topic,
        details: request.message,
        reportedBy: request.userId,
        reporterName: request.name,
        source: "support",
      })),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return res.status(200).json({ reports });
  });

  router.patch("/reports/:id/resolve", async (req, res) => {
    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: "bad_request", message: "Invalid report id" });
    const report = await req.app.locals.reportCollection.findOne({ _id: new ObjectId(req.params.id) });
    await req.app.locals.reportCollection.updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { resolved: true, resolvedAt: new Date(), resolvedBy: req.session.user?.userId } },
    );
    if (report?.reportedBy) await createNotification(req.app, { userId: report.reportedBy, type: "report_update", title: "Report resolved", message: `Your report about ${report.targetName || report.targetType} was reviewed`, relatedId: req.params.id });
    return res.status(200).json({ message: "Report resolved" });
  });

  router.patch("/support/:id/resolve", async (req, res) => {
    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: "bad_request", message: "Invalid support request id" });
    await req.app.locals.supportCollection.updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { resolved: true, status: "resolved", resolvedAt: new Date(), resolvedBy: req.session.user?.userId, updatedAt: new Date() } },
    );
    return res.status(200).json({ message: "Support request resolved" });
  });
}
