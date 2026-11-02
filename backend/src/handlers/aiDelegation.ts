import type { Router } from "express";
import { createHash, createHmac, timingSafeEqual } from "crypto";
import { ObjectId } from "mongodb";
import { isEmployerBackedJob, isVerifiedEmployerCompany } from "./jobs";
import { financialError, financialTransaction } from "../services/financialIntegrity";
import { piFromUsdt } from "../services/piPricing";
import { timelineEntry } from "../services/orderLifecycle";
import { createNotification } from "../services/notifications";
import { ensureProductConversation } from "./messages";

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
const storeProductQuery = (id: ObjectId) => ({
  _id: id,
  active: true,
  hidden: { $ne: true },
  approved: true,
  reviewStatus: "approved",
});
const resolvedPiPrice = (product: any) => {
  const price = Number(product.pricePi);
  if (Number.isFinite(price) && price > 0) return price;
  return piFromUsdt(product.priceUsdt);
};
const deterministicObjectId = (value: string) => new ObjectId(createHash("sha256").update(value).digest("hex").slice(0, 24));
const isAvailableUser = (user: any) => user && !user.blocked && !user.isBlocked && !user.accessTokenRevokedAt && user.status !== "blocked";

const getStoreContext = async (req: any, user: any, claims: any, action: any) => {
  if (!ObjectId.isValid(action.recordId)) return { error: "invalid_product", message: "Invalid product ID." };
  const product = await req.app.locals.productCollection.findOne(storeProductQuery(new ObjectId(action.recordId)));
  if (!product || product.sellerId === user.uid) return { error: "product_unavailable", message: "This published product is unavailable or cannot be purchased by its seller." };
  const seller = await req.app.locals.userCollection.findOne({ uid: product.sellerId });
  if (!isAvailableUser(seller)) return { error: "seller_unavailable", message: "The product's seller is unavailable." };
  const pricePi = resolvedPiPrice(product);
  if (!Number.isFinite(pricePi) || pricePi <= 0) return { error: "invalid_price", message: "This product has no valid Pi price." };
  const quantity = action.kind === "create_order" ? action.quantity : undefined;
  if (action.kind === "create_order" && (!Number.isInteger(quantity) || quantity < 1 || quantity > 20)) {
    return { error: "invalid_quantity", message: "Order quantity must be a whole number between 1 and 20." };
  }
  const quantityAvailable = Number.isInteger(Number(product.quantity)) ? Math.max(0, Number(product.quantity)) : 0;
  if (action.kind === "create_order" && quantityAvailable < quantity) {
    return { error: "insufficient_stock", message: "The requested quantity is not currently in stock." };
  }
  const productPreview = {
    recordId: String(product._id),
    sellerId: String(seller.uid),
    title: String(product.title || ""),
    sellerName: String(seller.displayName || seller.piUsername || seller.username || seller.uid),
    pricePi: Math.round(pricePi * 1e7) / 1e7,
    quantityAvailable,
  };
  const detailsHash = hash({
    contractId: claims.contractId,
    actionId: action.id,
    actionKind: action.kind,
    ownerId: String(user._id),
    ownerUid: String(user.uid),
    product: {
      recordId: productPreview.recordId,
      sellerId: productPreview.sellerId,
      title: productPreview.title,
      sellerName: productPreview.sellerName,
      pricePi: productPreview.pricePi,
    },
    ...(action.kind === "create_order" ? { quantity } : {}),
    ...(action.kind === "contact_seller" ? { message: action.message } : {}),
  });
  return {
    product,
    seller,
    detailsHash,
    preview: { product: productPreview },
  };
};

const approvedStoreContext = async (req: any, user: any, claims: any, action: any) => {
  const context = await getStoreContext(req, user, claims, action);
  if ("error" in context) return context;
  const approvedProduct = action.storePreview?.product;
  const currentProduct = context.preview.product;
  const productDetailsMatch = approvedProduct
    && approvedProduct.recordId === currentProduct.recordId
    && approvedProduct.sellerId === currentProduct.sellerId
    && approvedProduct.title === currentProduct.title
    && approvedProduct.sellerName === currentProduct.sellerName
    && approvedProduct.pricePi === currentProduct.pricePi
    && Number.isInteger(approvedProduct.quantityAvailable)
    && (action.kind !== "create_order" || approvedProduct.quantityAvailable >= action.quantity);
  if (!productDetailsMatch) {
    return { error: "store_details_changed", message: "The product, seller, price, message, or quantity changed after review. Prepare and approve the details again." };
  }
  return context;
};

const approvedStoreDetailsHash = (user: any, claims: any, action: any) => hash({
  contractId: claims.contractId,
  actionId: action.id,
  actionKind: action.kind,
  ownerId: String(user._id),
  ownerUid: String(user.uid),
  product: {
    recordId: action.storePreview.product.recordId,
    sellerId: action.storePreview.product.sellerId,
    title: action.storePreview.product.title,
    sellerName: action.storePreview.product.sellerName,
    pricePi: action.storePreview.product.pricePi,
  },
  ...(action.kind === "create_order" ? { quantity: action.quantity } : {}),
  ...(action.kind === "contact_seller" ? { message: action.message } : {}),
});

const storeIdempotencyKey = (user: any, claims: any, action: any) => hash({
  ownerId: String(user._id),
  contractId: claims.contractId,
  actionId: action.id,
  serviceId: action.serviceId,
  kind: action.kind,
  recordId: action.recordId,
});

const upsertDelegatedNotification = async (req: any, idempotencyKey: string, input: any, options: any = {}) => {
  if (!req.app.locals.notificationCollection) return;
  const _id = deterministicObjectId(`ai-delegation-notification:${idempotencyKey}`);
  const result = await req.app.locals.notificationCollection.updateOne({ _id }, {
    $setOnInsert: { ...input, _id, read: false, createdAt: new Date() },
  }, { upsert: true, ...options });
  if (result.upsertedCount) {
    try {
      const { sendPushNotification } = await import("../services/pushNotifications");
      await sendPushNotification(req.app, input.userId, {
        title: input.title,
        body: input.message,
        icon: "/logo.png",
        badge: "/notification-badge.png",
        url: input.relatedId === "messages" || input.type.includes("message") ? "/messages" : `/orders/${input.relatedId}/track`,
        tag: `${input.type}:${input.relatedId || input.title}`,
      });
    } catch (error) {
      console.error("Delegated action push notification failed:", error);
    }
  }
};

const resumeContactSeller = async (req: any, user: any, claims: any, action: any, idempotencyKey: string, detailsHash: string) => {
  const message = await req.app.locals.messageCollection.findOne({
    ownerId: String(user._id),
    senderId: user.uid,
    productId: action.recordId,
    delegationId: claims.contractId,
    delegationActionId: action.id,
    idempotencyKey,
    detailsHash,
    message: action.message,
  });
  if (!message || !ObjectId.isValid(String(message.conversationId))) return null;
  const conversation = await req.app.locals.conversationCollection.findOne({
    _id: new ObjectId(String(message.conversationId)),
    participants: { $all: [user.uid, message.sellerId] },
  });
  if (!conversation || message.sellerId === user.uid || conversation.participants?.length !== 2
    || !conversation.participants.includes(user.uid) || !conversation.participants.includes(message.sellerId)) return null;
  const messageTime = new Date(message.createdAt || 0).getTime();
  if (new Date(conversation.updatedAt || 0).getTime() <= messageTime) {
    await req.app.locals.conversationCollection.updateOne({ _id: conversation._id, updatedAt: { $lte: message.createdAt } }, {
      $set: { productContextExplicit: true, productId: action.recordId, productTitle: message.productTitle, productImage: message.productImage, lastMessage: message.message, lastMessageId: String(message._id), updatedAt: message.createdAt },
      $addToSet: { unreadBy: message.sellerId },
      $pull: { deletedBy: { $in: [user.uid, message.sellerId] } },
    });
  }
  await upsertDelegatedNotification(req, `${idempotencyKey}:message`, {
    userId: message.sellerId,
    type: "new_message",
    title: "New message",
    message: `${message.senderName}: ${String(message.message).slice(0, 100)}`,
    relatedId: String(conversation._id),
    image: user.avatar || "",
  });
  return { conversation, message };
};

const executeContactSeller = async (req: any, user: any, claims: any, action: any, context: any, idempotencyKey: string) => {
  const product = context.product;
  const seller = context.seller;
  const now = new Date();
  const conversation = await ensureProductConversation(req, user, product);
  if (!conversation || conversation.participants?.length !== 2 || !conversation.participants.includes(user.uid) || !conversation.participants.includes(seller.uid)) {
    throw new Error("Unable to resolve the exact buyer/seller conversation");
  }
  const conversationId = String(conversation._id);
  const clientMessageId = `ai_${idempotencyKey}`;
  let message = await req.app.locals.messageCollection.findOne({ conversationId, senderId: user.uid, clientMessageId });
  if (!message) {
    const document = {
      _id: deterministicObjectId(`ai-delegation-message:${idempotencyKey}`),
      conversationId,
      clientMessageId,
      productContextExplicit: true,
      productId: String(product._id),
      productTitle: String(product.title || ""),
      productImage: String(product.image || ""),
      senderId: user.uid,
      senderName: user.displayName || user.username || user.uid,
      message: action.message,
      messageType: "text",
      ownerId: String(user._id),
      sellerId: String(seller.uid),
      delegationId: claims.contractId,
      delegationActionId: action.id,
      idempotencyKey,
      detailsHash: context.detailsHash,
      createdAt: now,
    };
    try {
      await req.app.locals.messageCollection.insertOne(document);
      message = document;
    } catch (error: any) {
      if (error?.code !== 11000) throw error;
      message = await req.app.locals.messageCollection.findOne({ conversationId, senderId: user.uid, clientMessageId });
      if (!message) throw error;
    }
  }
  if (message.message !== action.message || message.productId !== action.recordId || message.delegationId !== claims.contractId || message.delegationActionId !== action.id || message.idempotencyKey !== idempotencyKey || message.detailsHash !== context.detailsHash) {
    throw financialError("This approved action id was already used for a different seller message.", 409);
  }
  const latestConversationTime = new Date(conversation.updatedAt || 0).getTime();
  const messageTime = new Date(message.createdAt || now).getTime();
  if (latestConversationTime <= messageTime) await req.app.locals.conversationCollection.updateOne({ _id: conversation._id, updatedAt: { $lte: message.createdAt || now } }, {
    $set: { productContextExplicit: true, productId: String(product._id), productTitle: String(product.title || ""), productImage: String(product.image || ""), lastMessage: message.message, lastMessageId: String(message._id), updatedAt: message.createdAt || now },
    $addToSet: { unreadBy: seller.uid },
    $pull: { deletedBy: { $in: [user.uid, seller.uid] } },
  });
  const notificationIdempotencyKey = `${idempotencyKey}:message`;
  await upsertDelegatedNotification(req, notificationIdempotencyKey, {
    userId: seller.uid,
    type: "new_message",
    title: "New message",
    message: `${message.senderName}: ${String(message.message).slice(0, 100)}`,
    relatedId: conversationId,
    image: user.avatar || "",
  });
  return { conversation, message };
};

const matchingDelegatedStoreRecord = (record: any, user: any, claims: any, action: any, idempotencyKey: string, detailsHash: string) =>
  record
  && record.delegationId === claims.contractId
  && record.delegationActionId === action.id
  && record.idempotencyKey === idempotencyKey
  && record.detailsHash === detailsHash
  && record.ownerId === String(user._id)
  && record.productId === action.recordId;

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
      if (operation !== "prepare" && (!claims.approvedAt || !Number.isFinite(Date.parse(claims.approvedAt)) || Date.parse(claims.approvedAt) > now || !Number.isFinite(Date.parse(claims.expiresAt)) || Date.parse(claims.expiresAt) <= now || claims.bindingConfirmed !== true)) return res.status(401).json({ message: "Explicit approval of the application details is required" });
      const action = claims.action;
      const supportedAction = (action?.serviceId === "jobs" && action.kind === "apply")
        || (action?.serviceId === "store" && ["save_product", "contact_seller", "create_order"].includes(action.kind));
      if (!action || typeof action.id !== "string" || action.id.length > 100 || typeof action.recordId !== "string" || action.recordId.length > 160 || !supportedAction) return res.status(400).json({ message: "Unsupported delegated action" });
      if (action.kind === "contact_seller" && (typeof action.message !== "string" || !action.message.trim() || action.message.length > 2000)) return res.status(400).json({ message: "A nonempty approved seller message of at most 2,000 characters is required." });
      if (action.kind === "create_order" && (!Number.isInteger(action.quantity) || action.quantity < 1 || action.quantity > 20)) return res.status(400).json({ message: "Order quantity must be a whole number between 1 and 20." });
      if (operation !== "prepare" && ["contact_seller", "create_order"].includes(action.kind)) {
        const storePreview = action.storePreview;
        const preview = storePreview?.product;
        const wrapperKeys = storePreview && typeof storePreview === "object" ? Object.keys(storePreview).sort() : [];
        const keys = preview && typeof preview === "object" ? Object.keys(preview).sort() : [];
        if (stableStringify(wrapperKeys) !== stableStringify(["product"]) ||
          stableStringify(keys) !== stableStringify(["pricePi", "quantityAvailable", "recordId", "sellerId", "sellerName", "title"]) ||
          preview.recordId !== action.recordId || typeof preview.sellerId !== "string" || !preview.sellerId || typeof preview.title !== "string" || typeof preview.sellerName !== "string" ||
          !Number.isFinite(preview.pricePi) || !Number.isInteger(preview.quantityAvailable) || preview.quantityAvailable < 0) {
          return res.status(400).json({ message: "Approved Store product details are required." });
        }
      }
      const user = await req.app.locals.userCollection.findOne({ _id: new ObjectId(claims.sub), uid: claims.uid });
      if (!isAvailableUser(user)) return res.status(403).json({ message: "Delegated user is unavailable" });
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
      if (action.kind === "save_product") {
        if (!ObjectId.isValid(action.recordId)) return res.status(400).json({ message: "Invalid product ID" });
        const key = { userId: user.uid, productId: action.recordId };
        if (execute) {
          const product = await req.app.locals.productCollection.findOne(storeProductQuery(new ObjectId(action.recordId)));
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
      }

      const idempotencyKey = storeIdempotencyKey(user, claims, action);
      if (operation === "prepare") {
        const prepared = await getStoreContext(req, user, claims, action);
        if ("error" in prepared) {
          const status = prepared.error === "invalid_product" ? 400 : prepared.error === "product_unavailable" || prepared.error === "seller_unavailable" ? 404 : prepared.error === "insufficient_stock" ? 409 : 422;
          return res.status(status).json({ code: prepared.error, message: prepared.message });
        }
        return res.json({ preview: prepared.preview });
      }

      if (execute && action.kind === "contact_seller") {
        const detailsHash = approvedStoreDetailsHash(user, claims, action);
        const existing = await resumeContactSeller(req, user, claims, action, idempotencyKey, detailsHash);
        if (!existing) {
          const prepared = await approvedStoreContext(req, user, claims, action);
          if ("error" in prepared) {
            const status = prepared.error === "product_unavailable" || prepared.error === "seller_unavailable" ? 404 : 409;
            return res.status(status).json({ code: prepared.error, message: prepared.message });
          }
          await executeContactSeller(req, user, claims, action, prepared, idempotencyKey);
        }
      } else if (execute && action.kind === "create_order") {
        await financialTransaction(req.app, async session => {
          const options = session ? { session } : {};
          const orderId = deterministicObjectId(`ai-delegation-order:${idempotencyKey}`);
          const existing = await req.app.locals.marketplaceOrderCollection.findOne({ _id: orderId }, options);
          if (existing) {
            if (!matchingDelegatedStoreRecord(existing, user, claims, action, idempotencyKey, approvedStoreDetailsHash(user, claims, action)) || existing.quantity !== action.quantity || existing.paymentStatus !== "pending" || existing.status !== "pending" || existing.inventoryReserved !== true || existing.inventoryReleased === true) {
              throw financialError("The approved checkout idempotency key is bound to a different or inactive order.");
            }
            return existing;
          }
          const prepared = await approvedStoreContext(req, user, claims, action);
          if ("error" in prepared) throw financialError(prepared.message || "Approved Store details could not be verified.", prepared.error === "product_unavailable" || prepared.error === "seller_unavailable" ? 404 : 409);
          const product = prepared.product;
          const unitPricePi = prepared.preview.product.pricePi;
          const stock = await req.app.locals.productCollection.updateOne(
            { ...storeProductQuery(product._id), quantity: { $gte: action.quantity } },
            { $inc: { quantity: -action.quantity }, $set: { updatedAt: new Date() } },
            options,
          );
          if (!stock.modifiedCount) throw financialError("The requested product quantity is no longer available.", 409);
          const now = new Date();
          const order = {
            _id: orderId,
            ownerId: String(user._id),
            buyerId: user.uid,
            buyerName: user.displayName || user.username || user.uid,
            sellerId: product.sellerId,
            sellerName: prepared.seller.displayName || prepared.seller.piUsername || prepared.seller.username || prepared.seller.uid,
            productId: String(product._id),
            productTitle: String(product.title || ""),
            productImage: String(product.image || ""),
            productCategory: String(product.category || ""),
            quantity: action.quantity,
            unitPricePi,
            pricePi: unitPricePi * action.quantity,
            status: "pending",
            paymentStatus: "pending",
            paymentId: null,
            paymentTxid: null,
            paidAt: null,
            inventoryReserved: true,
            inventoryReleased: false,
            reservationExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
            delegationId: claims.contractId,
            delegationActionId: action.id,
            idempotencyKey,
            detailsHash: prepared.detailsHash,
            createdAt: now,
            updatedAt: now,
            timeline: [timelineEntry("pending", "Order Created")],
          };
          await req.app.locals.marketplaceOrderCollection.insertOne(order, options);
          await upsertDelegatedNotification(req, `${idempotencyKey}:buyer-order`, {
            userId: user.uid, type: "order_created", title: "Order created", message: `${product.title} order is awaiting payment`, relatedId: String(orderId),
          }, options);
          await upsertDelegatedNotification(req, `${idempotencyKey}:seller-order`, {
            userId: product.sellerId, type: "new_order", title: "Order created", message: `${product.title} order is awaiting payment`, relatedId: String(orderId),
          }, options);
          return order;
        });
      }

      const expectedDetailsHash = approvedStoreDetailsHash(user, claims, action);
      if (action.kind === "contact_seller") {
        const message = await req.app.locals.messageCollection.findOne({
          senderId: user.uid,
          productId: action.recordId,
          delegationId: claims.contractId,
          delegationActionId: action.id,
          idempotencyKey,
          detailsHash: expectedDetailsHash,
          message: action.message,
        });
        if (!message) return res.status(409).json({ message: "No matching delegated seller message was found." });
        const conversation = await req.app.locals.conversationCollection.findOne({
          _id: new ObjectId(String(message.conversationId)),
          participants: { $all: [user.uid] },
        });
        if (!conversation || message.ownerId !== String(user._id) || conversation.participants?.length !== 2 || message.sellerId === user.uid
          || !conversation.participants.includes(user.uid) || !conversation.participants.includes(message.sellerId)) {
          return res.status(409).json({ message: "The persisted message does not belong to an exact buyer/seller conversation." });
        }
        const notificationId = deterministicObjectId(`ai-delegation-notification:${idempotencyKey}:message`);
        const notification = await req.app.locals.notificationCollection?.findOne({ _id: notificationId, userId: conversation.sellerId });
        if (!notification) return res.status(409).json({ message: "The seller notification for this message was not persisted." });
        const messages = await req.app.locals.messageCollection.find({
          conversationId: String(conversation._id),
          senderId: { $in: [user.uid, conversation.sellerId] },
          deletedForEveryone: { $ne: true },
          hiddenFor: { $ne: user.uid },
        }).sort({ createdAt: -1 }).limit(50).toArray();
        return res.json({ evidence: {
          serviceId: "store", kind: "contact_seller", recordId: action.recordId, ownerId: String(user._id), contractId: claims.contractId,
          backendId: String(message._id), status: "sent", createdAt: message.createdAt, conversationId: String(conversation._id), messageId: String(message._id), sellerId: String(message.sellerId),
          messages: messages.reverse().map((entry: any) => ({
            id: String(entry._id),
            senderId: String(entry.senderId),
            senderName: String(entry.senderName || ""),
            message: String(entry.message || ""),
            createdAt: entry.createdAt,
          })),
        } });
      }

      const orderId = deterministicObjectId(`ai-delegation-order:${idempotencyKey}`);
      const order = await req.app.locals.marketplaceOrderCollection.findOne({
        _id: orderId,
        buyerId: user.uid,
        productId: action.recordId,
        delegationId: claims.contractId,
        delegationActionId: action.id,
        idempotencyKey,
        detailsHash: expectedDetailsHash,
        quantity: action.quantity,
      });
      if (!order || !order.createdAt || typeof order.status !== "string" || typeof order.paymentStatus !== "string") {
        return res.status(409).json({ message: "No matching delegated order with a verifiable current status was found." });
      }
      return res.json({ evidence: {
        serviceId: "store", kind: "create_order", recordId: action.recordId, ownerId: String(user._id), contractId: claims.contractId,
        backendId: String(order._id), orderId: String(order._id), status: order.status, createdAt: order.createdAt, quantity: order.quantity,
        unitPricePi: order.unitPricePi, totalPricePi: order.pricePi, paymentStatus: order.paymentStatus,
      } });
    } catch (error) {
      const status = (error as { status?: number })?.status;
      if (status) return res.status(status).json({ message: (error as Error).message });
      if ((error as { code?: number })?.code === 11000) return res.status(503).json({ message: "Concurrent submission detected; retry safely to verify the existing application record." });
      console.error("[ai-delegation] backend operation failed", error);
      return res.status(502).json({ message: "Delegated backend operation failed; no verified outcome is claimed." });
    }
  });
}
