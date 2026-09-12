import { Router, Request, Response } from "express";

import { ObjectId } from "mongodb";
import { getUserPlatformAPIClient } from "../services/platformAPIClient";
import env from "../environments";
import { minimalSessionUser, resolveCurrentUser } from "../services/auth";
import { createNotification } from "../services/notifications";
import { assertNoBase64Images, resolveImageValue } from "../services/imageStorage";
import { currentDeviceSessionKey, ensureDeviceSession, type DeviceMetadata } from "../services/deviceSessions";

type VerifiedPiUser = {
  uid?: string;
  username?: string;
};

const crossSiteSession = env.is_production;
const sessionCookieOptions = {
  httpOnly: true,
  sameSite: crossSiteSession ? "none" as const : "lax" as const,
  secure: crossSiteSession,
  maxAge: 1000 * 60 * 60 * 24 * 7,
};
const normalizePiUsername = (username: string) => username.trim().replace(/^@+/, "").toLowerCase();
const isConfiguredAdminUser = (user: any) => {
  const usernames = [user?.piUsername, user?.username].map((value) => normalizePiUsername(String(value || "")));
  return usernames.some((username) => env.admin_pi_usernames.includes(username));
};
const verificationStatus = (user: any) => ["none", "pending", "approved", "rejected"].includes(user?.verificationStatus) ? user.verificationStatus : user?.verificationRequested ? "pending" : "none";
const hasCompletePiProfile = (user: any) => Boolean(user?.displayName && user?.piUsername && user?.country && user?.contactPhone && user?.avatar && user?.bio);
const canShowPublicVerification = (user: any) => user?.role === "admin" || hasCompletePiProfile(user);
const normalizeVerificationLevel = (user: any) => {
  const level = user?.verificationLevel === "verified" ? "pi_verified" : user?.verificationLevel;
  if (level === "trusted_seller") return user?.sellerActive || user?.role === "seller" || user?.role === "admin" ? "trusted_seller" : "pi_verified";
  if (level === "seller_verified") return user?.sellerActive || user?.role === "seller" ? "seller_verified" : "pi_verified";
  if (level === "pi_verified") return "pi_verified";
  return "basic";
};
const publicVerificationLevel = (user: any) => verificationStatus(user) === "approved" && canShowPublicVerification(user) ? normalizeVerificationLevel(user) : "basic";
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const toClientUser = (user: any) => user ? ({
  uid: user.uid,
  username: user.username,
  piUsername: user.piUsername,
  displayName: user.displayName,
  country: user.country,
  contactPhone: user.contactPhone || "",
  avatar: user.avatar || "",
  coverImage: user.coverImage || "",
  bio: user.bio || "",
  language: user.language || user.settings?.language || "English",
  sellerActive: Boolean(user.sellerActive || user.role === "seller"),
  role: user.role,
  roles: user.roles,
  blocked: Boolean(user.blocked),
  verificationLevel: publicVerificationLevel(user),
  verificationStatus: verificationStatus(user),
  verificationRequested: Boolean(user.verificationRequested),
  verificationRequestType: user.verificationRequestType || "",
  settings: user.settings || { theme: "light", language: "English", notifications: true },
  createdAt: user.createdAt,
}) : null;

const saveSession = (req: Request) => new Promise<void>((resolve, reject) => {
  req.session.save((err) => (err ? reject(err) : resolve()));
});

const regenerateSession = (req: Request) => new Promise<void>((resolve, reject) => {
  req.session.regenerate((err) => (err ? reject(err) : resolve()));
});

const establishAuthSession = async (req: Request, currentUser: any, device: DeviceMetadata = {}) => {
  const nextUser = minimalSessionUser(currentUser);
  if (req.session.user?.userId !== nextUser.userId) {
    await regenerateSession(req);
  }
  delete (req.session as any).currentUser;
  delete (req.session as any).accessToken;
  delete (req.session as any).piUser;
  req.session.user = nextUser;
  await saveSession(req);
  await ensureDeviceSession(req, currentUser.uid, device);
  await saveSession(req);
  if (env.session_debug) {
    console.info("[session-signin]", {
      expectedCookie: {
        secure: sessionCookieOptions.secure,
        sameSite: sessionCookieOptions.sameSite,
        httpOnly: sessionCookieOptions.httpOnly,
        maxAge: sessionCookieOptions.maxAge,
      },
      resolvedCookie: {
        originalMaxAge: req.session.cookie.originalMaxAge,
        expires: req.session.cookie.expires,
        secure: req.session.cookie.secure,
        sameSite: req.session.cookie.sameSite,
        httpOnly: req.session.cookie.httpOnly,
      },
      sessionKeys: Object.keys(req.session).filter((key) => key !== "id"),
      userKeys: Object.keys(req.session.user || {}),
      sessionPayloadBytes: Buffer.byteLength(JSON.stringify({ user: req.session.user, cookie: req.session.cookie })),
    });
  }
};

const refreshExistingAuthSession = async (req: Request, currentUser: any) => {
  if (!currentUser || !req.session.user?.userId) return;
  delete (req.session as any).currentUser;
  delete (req.session as any).accessToken;
  delete (req.session as any).piUser;
  req.session.user = minimalSessionUser(currentUser);
  await saveSession(req);
};

const destroySession = async (req: Request, res: Response) => {
  const currentUser = await resolveCurrentUser(req).catch(() => null);
  if (currentUser) {
    const sessionKey = currentDeviceSessionKey(req);
    if (sessionKey && req.app.locals.deviceSessionCollection) {
      await req.app.locals.deviceSessionCollection.updateOne({ sessionKey, userId: currentUser.uid }, { $set: { active: false, revokedAt: new Date() } });
      await req.app.locals.nativePushTokenCollection?.deleteOne({ sessionKey, userId: currentUser.uid });
    }
    await createNotification(req.app, {
      userId: currentUser.uid,
      type: "security_logout",
      title: "Signed out",
      message: "Your SMAJ PI HUB account was signed out.",
      relatedId: "settings",
    });
  }

  req.session.destroy((err) => {
    if (err) {
      console.error("Error during signout:", err);
      return res.status(500).json({ error: "internal_error", message: "Failed to sign out" });
    }

    res.clearCookie("connect.sid", sessionCookieOptions);
    return res.status(200).json({ message: "User signed out" });
  });
};

export const handleSignIn = async (req: Request, res: Response) => {
  const auth = req.body?.authResult;
  const userCollection = req.app.locals.userCollection;

  if (!auth?.accessToken || !auth?.user?.uid || !auth?.user?.username) {
    return res.status(400).json({ error: "bad_request", message: "Pi login failed. Please login again through Pi Browser." });
  }

  if (!userCollection) {
    return res.status(503).json({ error: "service_unavailable", message: "Database not ready" });
  }

  let verifiedUser: VerifiedPiUser;

  try {
    const meResponse = await getUserPlatformAPIClient().get<VerifiedPiUser>("/v2/me", {
      headers: { Authorization: `Bearer ${auth.accessToken}` },
    });
    verifiedUser = meResponse.data ?? {};
  } catch (err) {
    console.error("Error verifying access token:", err);
    return res.status(401).json({ error: "invalid_token", message: "Pi login failed. Please login again through Pi Browser." });
  }

  if (verifiedUser.uid && verifiedUser.uid !== auth.user.uid) {
    return res.status(401).json({ error: "invalid_token", message: "Pi login failed. Please login again through Pi Browser." });
  }

  if (verifiedUser.username && verifiedUser.username !== auth.user.username) {
    return res.status(401).json({ error: "invalid_token", message: "Pi login failed. Please login again through Pi Browser." });
  }

  const normalizedUser = {
    uid: verifiedUser.uid || auth.user.uid,
    username: verifiedUser.username || auth.user.username,
    roles: Array.isArray(auth.user.roles) ? auth.user.roles : [],
  };
  const isConfiguredAdmin = env.admin_pi_usernames.includes(normalizePiUsername(String(normalizedUser.username || "")));

  try {
    let currentUser = await userCollection.findOne({ uid: normalizedUser.uid });

    if (currentUser) {
      const role = isConfiguredAdmin ? "admin" : ["buyer", "seller", "admin"].includes(currentUser.role) ? currentUser.role : "buyer";
      if (currentUser.blocked) {
        return res.status(403).json({ error: "blocked", message: "This SMAJ account has been blocked" });
      }
      await userCollection.updateOne(
        {
          _id: currentUser._id,
        },
        {
          $set: {
            username: normalizedUser.username,
            piUsername: normalizedUser.username,
            displayName: currentUser.displayName || normalizedUser.username,
            country: currentUser.country || "",
            contactPhone: currentUser.contactPhone || "",
            role,
            roles: [role],
            blocked: false,
            verificationLevel: currentUser.verificationLevel === "verified" ? "pi_verified" : currentUser.verificationLevel || "basic",
            verificationStatus: currentUser.verificationStatus || "none",
            verificationRequested: Boolean(currentUser.verificationRequested),
            settings: currentUser.settings || { theme: "light", language: "English", notifications: true },
            createdAt: currentUser.createdAt || new Date(),
            lastSeenAt: new Date(),
            accessToken: auth.accessToken,
          },
        },
      );

      currentUser = await userCollection.findOne({ _id: currentUser._id });
    } else {
      const role = isConfiguredAdmin ? "admin" : "buyer";
      const insertResult = await userCollection.insertOne({
        username: normalizedUser.username,
        piUsername: normalizedUser.username,
        uid: normalizedUser.uid,
        displayName: normalizedUser.username,
        country: "",
        contactPhone: "",
        role,
        roles: [role],
        blocked: false,
        verificationLevel: isConfiguredAdmin ? "trusted_seller" : "basic",
        verificationStatus: isConfiguredAdmin ? "approved" : "none",
        verificationRequested: false,
        settings: { theme: "light", language: "English", notifications: true },
        createdAt: new Date(),
        lastSeenAt: new Date(),
        accessToken: auth.accessToken,
      });

      currentUser = await userCollection.findOne({ _id: insertResult.insertedId });
    }

    await establishAuthSession(req, currentUser, req.body?.device || {});
    if (currentUser?.uid) {
      await createNotification(req.app, {
        userId: currentUser.uid,
        type: "security_login",
        title: "Login successful",
        message: "Your SMAJ PI HUB account signed in successfully.",
        relatedId: "settings",
      });
    }
    return res.status(200).json({ message: "User signed in", user: toClientUser(currentUser) });
  } catch (err) {
    console.error("Error during signin:", err);
    return res.status(500).json({ error: "internal_error", message: "Failed to sign in" });
  }
};

export default function mountUserEndpoints(router: Router) {
  router.post("/dev-signin", async (req: Request, res: Response) => {
    if (!env.dev_auth || env.is_production) {
      return res.status(404).json({ error: "not_found", message: "Development sign-in is disabled" });
    }

    const uid = "local-dev-user";
    const userCollection = req.app.locals.userCollection;
    await userCollection.updateOne(
      { uid },
      {
        $setOnInsert: {
          _id: new ObjectId(),
          username: "localdev",
          piUsername: "localdev",
          uid,
          displayName: "Local Dev Seller",
          country: "Local",
          contactPhone: "@localdev",
          role: "seller",
          roles: ["seller"],
          sellerActive: true,
          blocked: false,
          verificationLevel: "trusted_seller",
          verificationStatus: "approved",
          verificationRequested: false,
          settings: { theme: "light", language: "English", notifications: true },
          createdAt: new Date(),
          accessToken: "dev-token",
        },
      },
      { upsert: true },
    );
    const currentUser = await userCollection.findOne({ uid });
    await establishAuthSession(req, currentUser, req.body?.device || {});
    if (currentUser?.uid) {
      await createNotification(req.app, {
        userId: currentUser.uid,
        type: "security_login",
        title: "Login successful",
        message: "Your SMAJ PI HUB development account signed in successfully.",
        relatedId: "settings",
      });
    }
    return res.status(200).json({ message: "Development user signed in", user: toClientUser(currentUser) });
  });

  // POST /user/signin
  router.post("/signin", handleSignIn);

  // GET /user (session check)
  router.get("/", async (req: Request, res: Response) => {
    let currentUser = await resolveCurrentUser(req);
    if (currentUser && currentUser.role !== "admin" && isConfiguredAdminUser(currentUser)) {
      await req.app.locals.userCollection.updateOne(
        { uid: currentUser.uid },
        { $set: { role: "admin", roles: ["admin"], updatedAt: new Date() } },
      );
      currentUser = await req.app.locals.userCollection.findOne({ uid: currentUser.uid });
      if (currentUser) await refreshExistingAuthSession(req, currentUser);
    }
    return res.status(200).json({
      user: toClientUser(currentUser),
    });
  });

  router.put("/profile", async (req: Request, res: Response) => {
    const currentUser = await resolveCurrentUser(req);
    const userCollection = req.app.locals.userCollection;

    if (!currentUser) {
      return res.status(200).json({ user: null, message: "Profile saved locally" });
    }

    const displayName = String(req.body?.displayName || currentUser.displayName || currentUser.username || "Pi User").trim();
    const country = String(req.body?.country || "").trim();
    const contactPhone = String(req.body?.contactPhone || "").trim();
    const avatarInput = String(req.body?.avatar || currentUser.avatar || "");
    const coverImageInput = String(req.body?.coverImage || currentUser.coverImage || "");
    const bio = String(req.body?.bio || currentUser.bio || "").trim();
    const language = String(req.body?.language || currentUser.language || currentUser.settings?.language || "English").trim();
    const sellerActive = typeof req.body?.sellerActive === "boolean" ? req.body.sellerActive : Boolean(currentUser.sellerActive || currentUser.role === "seller");
    const requestedRole = req.body?.role;
    const role = currentUser.role === "admin" ? "admin" : sellerActive ? "seller" : requestedRole === "seller" ? "seller" : "buyer";

    if (displayName.length > 80 || country.length > 80 || contactPhone.length > 40 || bio.length > 500 || language.length > 40 || avatarInput.length > 6_500_000 || coverImageInput.length > 6_500_000 || !["buyer", "seller", "admin"].includes(role)) {
      return res.status(400).json({ error: "bad_request", message: "Profile image or text is too large." });
    }

    let avatar = "";
    let coverImage = "";
    try {
      avatar = await resolveImageValue(avatarInput, "avatar", "avatar");
      coverImage = await resolveImageValue(coverImageInput, "profile-banner", "cover-image");
    } catch (err: any) {
      if (err?.statusCode === 413) return res.status(413).json({ error: "payload_too_large", message: err.message });
      if (err?.statusCode === 400 || err?.statusCode === 503) return res.status(err.statusCode).json({ error: "image_upload_failed", message: err.message });
      console.error("Profile image upload failed:", err);
      return res.status(500).json({ error: "image_upload_failed", message: "Profile image upload failed." });
    }

    const nextVerificationLevel = !sellerActive && ["seller_verified", "trusted_seller"].includes(normalizeVerificationLevel(currentUser)) ? "pi_verified" : normalizeVerificationLevel(currentUser);

    const profileUpdates = { displayName, country, contactPhone, avatar, coverImage, bio, language, sellerActive, role, roles: [role], verificationLevel: nextVerificationLevel, verificationStatus: currentUser.verificationStatus || "none", lastSeenAt: new Date() };
    assertNoBase64Images(profileUpdates, "user");
    await userCollection.updateOne(
      { uid: currentUser.uid },
      { $set: profileUpdates },
    );

    const updatedUser = await userCollection.findOne({ uid: currentUser.uid });
    await refreshExistingAuthSession(req, updatedUser);
    return res.status(200).json({ user: toClientUser(updatedUser) });
  });

  router.get("/stats", async (req: Request, res: Response) => {
    const currentUser = await resolveCurrentUser(req);
    if (!currentUser) return res.status(200).json({ stats: { totalProducts: 0, approvedListings: 0, successfulOrders: 0, completedSales: 0 } });
    const [totalProducts, approvedListings, successfulOrders, completedSales] = await Promise.all([
      req.app.locals.productCollection.countDocuments({ sellerId: currentUser.uid }),
      req.app.locals.productCollection.countDocuments({ sellerId: currentUser.uid, active: true, hidden: { $ne: true }, approved: true, reviewStatus: "approved" }),
      req.app.locals.marketplaceOrderCollection.countDocuments({ $or: [{ sellerId: currentUser.uid }, { buyerId: currentUser.uid }], status: "completed" }),
      req.app.locals.marketplaceOrderCollection.countDocuments({ sellerId: currentUser.uid, status: "completed" }),
    ]);
    return res.status(200).json({ stats: { totalProducts, approvedListings, successfulOrders, completedSales } });
  });

  router.get("/search", async (req: Request, res: Response) => {
    const query = String(req.query.q || "").trim().slice(0, 80);
    if (!query) return res.status(200).json({ users: [] });
    const regex = { $regex: escapeRegex(query), $options: "i" };
    const users = await req.app.locals.userCollection
      .find({ blocked: { $ne: true }, $or: [{ displayName: regex }, { username: regex }, { piUsername: regex }, { country: regex }] })
      .project({ uid: 1, username: 1, piUsername: 1, displayName: 1, country: 1, role: 1, sellerActive: 1, verificationLevel: 1, verificationStatus: 1 })
      .limit(12)
      .toArray();
    return res.status(200).json({ users: users.map((user: any) => ({ uid: user.uid, username: user.username, piUsername: user.piUsername, displayName: user.displayName || user.username || "Pi user", country: user.country || "", role: user.role || "buyer", sellerActive: Boolean(user.sellerActive || user.role === "seller"), verificationLevel: publicVerificationLevel(user), verificationStatus: verificationStatus(user) })) });
  });

  router.get("/recent-searches", async (req: Request, res: Response) => {
    const currentUser = await resolveCurrentUser(req);
    return res.status(200).json({ searches: Array.isArray(currentUser?.recentSearches) ? currentUser.recentSearches.slice(0, 10) : [] });
  });

  router.post("/recent-searches", async (req: Request, res: Response) => {
    const currentUser = await resolveCurrentUser(req);
    const query = String(req.body?.query || "").trim().slice(0, 80);
    if (!query) return res.status(400).json({ error: "bad_request", message: "Search query is required" });
    if (!currentUser) return res.status(200).json({ searches: [query] });
    const current = Array.isArray(currentUser.recentSearches) ? currentUser.recentSearches : [];
    const searches = [query, ...current.filter((item: string) => item.toLowerCase() !== query.toLowerCase())].slice(0, 10);
    await req.app.locals.userCollection.updateOne({ uid: currentUser.uid }, { $set: { recentSearches: searches } });
    const updatedUser = await req.app.locals.userCollection.findOne({ uid: currentUser.uid });
    await refreshExistingAuthSession(req, updatedUser);
    return res.status(200).json({ searches });
  });

  router.delete("/recent-searches", async (req: Request, res: Response) => {
    const currentUser = await resolveCurrentUser(req);
    if (currentUser) {
      await req.app.locals.userCollection.updateOne({ uid: currentUser.uid }, { $set: { recentSearches: [] } });
      const updatedUser = await req.app.locals.userCollection.findOne({ uid: currentUser.uid });
      await refreshExistingAuthSession(req, updatedUser);
    }
    return res.status(200).json({ searches: [] });
  });

  router.post("/verification-request", async (req: Request, res: Response) => {
    const currentUser = await resolveCurrentUser(req);
    if (!currentUser) return res.status(200).json({ user: null, message: "Verification request saved locally" });
    const requestedLevel = ["pi_verified", "seller_verified", "trusted_seller"].includes(req.body?.level) ? req.body.level : "pi_verified";
    const profileComplete = hasCompletePiProfile(currentUser);
    const [approvedListings, completedSales] = await Promise.all([
      req.app.locals.productCollection.countDocuments({ sellerId: currentUser.uid, active: true, hidden: { $ne: true }, approved: true, reviewStatus: "approved" }),
      req.app.locals.marketplaceOrderCollection.countDocuments({ sellerId: currentUser.uid, status: "completed" }),
    ]);
    if (requestedLevel === "pi_verified" && !profileComplete) {
      return res.status(400).json({ error: "profile_incomplete", message: "Complete your profile before requesting Real Pi User verification." });
    }
    if (requestedLevel === "seller_verified" && (!(currentUser.sellerActive || currentUser.role === "seller") || approvedListings < 10)) {
      return res.status(400).json({ error: "seller_locked", message: "Seller verification unlocks after seller tools are active and 10 approved listings are completed." });
    }
    if (requestedLevel === "trusted_seller" && (approvedListings < 100 || completedSales < 20)) {
      return res.status(400).json({ error: "trusted_locked", message: "Trusted Seller unlocks after 100 approved listings and 20 completed sales." });
    }
    await req.app.locals.userCollection.updateOne(
      { uid: currentUser.uid },
      { $set: { verificationRequested: true, verificationStatus: "pending", verificationRequestType: requestedLevel, verificationRequestedAt: new Date() } },
    );
    await createNotification(req.app, {
      userId: currentUser.uid,
      type: "verification_requested",
      title: "Verification request sent",
      message: requestedLevel === "trusted_seller" ? "Team will review your trusted seller verification request." : requestedLevel === "seller_verified" ? "Team will review your seller verification request." : "Team will review your Pi verified account request.",
      relatedId: "settings",
    });
    const admins = await req.app.locals.userCollection.find({ role: "admin" }).project({ uid: 1 }).toArray();
    await Promise.all(admins.map((admin: any) => createNotification(req.app, {
      userId: admin.uid,
      type: "admin_verification_request",
      title: "New verification request",
      message: `${currentUser.displayName || currentUser.username} requested ${requestedLevel === "trusted_seller" ? "Trusted Seller" : requestedLevel === "seller_verified" ? "Seller Verified" : "Pi Verified"} status.`,
      relatedId: currentUser.uid,
    })));
    const updatedUser = await req.app.locals.userCollection.findOne({ uid: currentUser.uid });
    await refreshExistingAuthSession(req, updatedUser);
    return res.status(200).json({ user: toClientUser(updatedUser), message: "Verification request submitted" });
  });

  router.get("/sessions", async (req: Request, res: Response) => {
    const currentUser = await resolveCurrentUser(req);
    if (!currentUser) return res.status(401).json({ error: "unauthorized" });
    // Always upsert the current device. The express session can outlive its
    // device_sessions record (for example after TTL cleanup or an older login),
    // so checking only for deviceSessionId can incorrectly return an empty list.
    await ensureDeviceSession(req, currentUser.uid);
    const currentKey = currentDeviceSessionKey(req);
    const sessions = await req.app.locals.deviceSessionCollection
      .find({ userId: currentUser.uid, active: true })
      .sort({ lastActiveAt: -1 })
      .limit(50)
      .toArray();
    return res.json({ sessions: sessions.map((item: any) => ({
      id: item.sessionKey,
      name: item.name,
      platform: item.platform,
      browser: item.browser,
      operatingSystem: item.operatingSystem,
      osVersion: item.osVersion,
      location: item.location,
      createdAt: item.createdAt,
      lastActiveAt: item.lastActiveAt,
      expiresAt: item.expiresAt,
      notificationsEnabled: Boolean(item.notificationsEnabled),
      current: item.sessionKey === currentKey,
    })) });
  });

  router.delete("/sessions/:sessionKey", async (req: Request, res: Response) => {
    const currentUser = await resolveCurrentUser(req);
    if (!currentUser) return res.status(401).json({ error: "unauthorized" });
    const sessionKey = String(req.params.sessionKey || "");
    if (!/^[a-f0-9]{64}$/.test(sessionKey)) return res.status(400).json({ error: "invalid_session" });
    if (sessionKey === currentDeviceSessionKey(req)) return res.status(400).json({ error: "current_session", message: "Use Logout to remove this device." });
    const result = await req.app.locals.deviceSessionCollection.updateOne(
      { sessionKey, userId: currentUser.uid, active: true },
      { $set: { active: false, revokedAt: new Date() } },
    );
    await req.app.locals.nativePushTokenCollection?.deleteOne({ sessionKey, userId: currentUser.uid });
    return res.json({ removed: result.matchedCount > 0 });
  });

  router.post("/sessions/revoke-others", async (req: Request, res: Response) => {
    const currentUser = await resolveCurrentUser(req);
    if (!currentUser) return res.status(401).json({ error: "unauthorized" });
    const currentKey = currentDeviceSessionKey(req);
    await req.app.locals.deviceSessionCollection.updateMany(
      { userId: currentUser.uid, sessionKey: { $ne: currentKey }, active: true },
      { $set: { active: false, revokedAt: new Date() } },
    );
    await req.app.locals.nativePushTokenCollection?.deleteMany?.({ userId: currentUser.uid, sessionKey: { $ne: currentKey } });
    return res.json({ removed: true });
  });
  router.put("/settings", async (req: Request, res: Response) => {
    const currentUser = await resolveCurrentUser(req);
    if (!currentUser) {
      return res.status(200).json({ user: null, message: "Settings saved locally" });
    }

    const theme = req.body?.theme;
    const language = String(req.body?.language || "").trim();
    const notifications = req.body?.notifications;
    if (!["dark", "light"].includes(theme) || !language || language.length > 40 || typeof notifications !== "boolean") {
      return res.status(400).json({ error: "bad_request", message: "Invalid settings" });
    }

    const settings = { theme, language, notifications };
    await req.app.locals.userCollection.updateOne({ uid: currentUser.uid }, { $set: { settings } });
    const updatedUser = await req.app.locals.userCollection.findOne({ uid: currentUser.uid });
    await refreshExistingAuthSession(req, updatedUser);
    return res.status(200).json({ user: toClientUser(updatedUser) });
  });

  // GET|POST /user/signout
  router.get("/signout", destroySession);
  router.post("/signout", destroySession);
}
