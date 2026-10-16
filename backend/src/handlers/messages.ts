import { readUserPresence } from "../services/userPresence";
import { Router } from "express";
import { ObjectId } from "mongodb";
import { createNotification } from "../services/notifications";
import { resolveCurrentUser } from "../services/auth";

const serialize = (item: Record<string, any>) => ({ ...item, _id: item._id.toString() });
const lightMessage = (item: Record<string, any>) => {
  const { audioDataUrl, attachmentDataUrl, ...metadata } = item;
  return { ...serialize(metadata), mediaAvailable: !item.deletedForEveryone && (Boolean(audioDataUrl || attachmentDataUrl) || item.messageType === "voice" || item.messageType === "document" || (item.messageType === "image" && !item.attachmentUrl)) };
};
const historyPage = async (req: any, id: string, uid: string, limit: number, before = "", light = false) => {
  const records = await req.app.locals.messageCollection.find({ conversationId: id, hiddenFor: { $ne: uid }, ...(before ? { _id: { $lt: new ObjectId(before) } } : {}) }, light ? { projection: { audioDataUrl: 0, attachmentDataUrl: 0 } } : {}).sort({ _id: -1 }).limit(limit + 1).toArray();
  const hasMore = records.length > limit;
  const messages = records.slice(0, limit).reverse();
  return { messages: messages.map(light ? lightMessage : serialize), hasMore, nextCursor: hasMore ? messages[0]?._id.toString() : null };
};
const TYPING_WINDOW_MS = 5 * 1000;
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
const MAX_VOICE_NOTE_BYTES = 2_000_000;
const MAX_MESSAGE_IMAGE_BYTES = 2_500_000;
const MAX_MESSAGE_DOCUMENT_BYTES = 3_500_000;
const voiceDataPattern = /^data:audio\/(webm|mp4|mpeg|ogg|wav)(;codecs=[a-z0-9-]+)?;base64,[a-z0-9+/=]+$/i;
const imageDataPattern = /^data:image\/(png|jpe?g|webp|gif);base64,[a-z0-9+/=]+$/i;
const documentDataPattern = /^data:([a-z0-9.+-]+\/[a-z0-9.+-]+);base64,[a-z0-9+/=]+$/i;
const allowedMessageTypes = new Set(["text", "voice", "image", "document"]);
const safeAttachmentName = (value: unknown) => String(value || "Attachment").trim().replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-").slice(0, 120) || "Attachment";
const pairKeyFor = (firstId: string, secondId: string) => [firstId, secondId].sort().join(":");

const mergePairConversations = async (req: any, conversations: Array<Record<string, any>>): Promise<Record<string, any> | null> => {
  if (!conversations.length) return null;
  const sorted = [...conversations].sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());
  const canonical = sorted.find(item => item.pairKey);
  if (canonical && sorted[0] !== canonical) { sorted.splice(sorted.indexOf(canonical), 1); sorted.unshift(canonical); }
  const primary = sorted[0];
  const duplicates = sorted.slice(1);
  if (!duplicates.length && primary.pairKey) return primary;
  const pairKey = primary.contextType === "jobs" && primary.pairKey
    ? primary.pairKey
    : pairKeyFor(primary.buyerId, primary.sellerId);
  const unreadBy = [...new Set(sorted.flatMap((item) => Array.isArray(item.unreadBy) ? item.unreadBy : []))];
  const archivedBy = [...new Set(sorted.flatMap((item) => Array.isArray(item.archivedBy) ? item.archivedBy : []))];
  const deletedBy = [...new Set(sorted.flatMap((item) => Array.isArray(item.deletedBy) ? item.deletedBy : []))];

  if (duplicates.length || primary.pairKey !== pairKey) {
    for (const conversation of sorted) {
      const conversationId = conversation._id.toString();
      await req.app.locals.messageCollection.updateMany(
        { conversationId },
        { $set: {
          conversationId: primary._id.toString(),
        } },
      );
    }
  }
  await req.app.locals.conversationCollection.updateOne(
    { _id: primary._id },
    { $set: { pairKey, unreadBy, archivedBy, deletedBy } },
  );
  for (const duplicate of duplicates) {
    await req.app.locals.conversationCollection.deleteOne({ _id: duplicate._id });
  }
  return { ...primary, pairKey, unreadBy, archivedBy };
};

const enrichConversations = async (req: any, currentUser: Record<string, any>, conversations: Array<Record<string, any>>) => {
  const otherUserIds = conversations
    .map((conversation) => conversation.buyerId === currentUser.uid ? conversation.sellerId : conversation.buyerId)
    .filter(Boolean);
  const users: Array<Record<string, any>> = otherUserIds.length && req.app.locals.userCollection
    ? await req.app.locals.userCollection.find({ uid: { $in: otherUserIds } }).toArray()
    : [];
  const usersById = new Map(users.map((user: Record<string, any>) => [user.uid, user]));

  return conversations.map((conversation) => {
    const otherUserId = conversation.buyerId === currentUser.uid ? conversation.sellerId : conversation.buyerId;
    const otherUser = usersById.get(otherUserId);
    const presence = readUserPresence(otherUser);
    const typingAt = conversation.typingBy?.[otherUserId];
    const typingMs = typingAt ? new Date(typingAt).getTime() : 0;
    return {
      ...serialize(conversation),
      participantId: otherUserId,
      participantName: otherUser?.displayName || otherUser?.username || (conversation.buyerId === currentUser.uid ? conversation.sellerName : conversation.buyerName),
      profileImage: otherUser?.avatar || (conversation.buyerId === currentUser.uid ? conversation.sellerAvatar : conversation.buyerAvatar) || "",
      verificationLevel: publicVerificationLevel(otherUser),
      verificationStatus: verificationStatus(otherUser),
      ...presence,
      typing: typingMs > 0 && Date.now() - typingMs < TYPING_WINDOW_MS,
      archived: Array.isArray(conversation.archivedBy) && conversation.archivedBy.includes(currentUser.uid),
    };
  });
};

const directConversation = async (req: any, user: any, recipientId: string, create: boolean) => {
  if (!recipientId || recipientId === user.uid) return null;
  const recipient = await req.app.locals.userCollection.findOne({ uid: recipientId });
  if (!recipient) return null;
  const pairKey = pairKeyFor(user.uid, recipientId);
  const matches = await req.app.locals.conversationCollection.find({ contextType: { $ne: "jobs" }, $or: [{ pairKey }, { buyerId: user.uid, sellerId: recipientId }, { buyerId: recipientId, sellerId: user.uid }] }).toArray();
  let conversation = await mergePairConversations(req, matches);
  if (!conversation && create) {
    const document = { pairKey, buyerId: user.uid, buyerName: user.displayName || user.username, sellerId: recipientId, sellerName: recipient.displayName || recipient.username, participants: [user.uid, recipientId], lastMessage: "", unreadBy: [], createdAt: new Date(), updatedAt: new Date() };
    try {
      await req.app.locals.conversationCollection.updateOne({ pairKey }, { $setOnInsert: document }, { upsert: true });
    } catch (error: any) { if (error?.code !== 11000) throw error; }
    conversation = await req.app.locals.conversationCollection.findOne({ pairKey, participants: user.uid });
  }
  return conversation || { _id: "draft:" + recipientId, buyerId: user.uid, sellerId: recipientId, sellerName: recipient.displayName || recipient.username, participants: [user.uid, recipientId], updatedAt: new Date() };
};

export default function mountMessageEndpoints(router: Router) {
  router.use(async (req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    const owner = req.get("X-SMAJ-Chat-Owner");
    if (owner) {
      const user = await resolveCurrentUser(req);
      if (!user || user.uid !== owner) return res.status(401).json({ error: "account_changed" });
    }
    next();
  });
  // Authenticated long polling works with Pi/native bearer headers and cookie sessions.
  // The database signature also observes changes made by other server instances.
  router.get("/sync", async (req, res) => {
    const user = await resolveCurrentUser(req);
    if (!user) return res.status(401).json({ error: "unauthorized" });
    res.setHeader("Cache-Control", "no-store");
    let closed = false;
    res.on("close", () => { closed = true; });
    const deadline = Date.now() + 24000;
    while (!closed) {
      const records = await req.app.locals.conversationCollection.find({ participants: user.uid, deletedBy: { $ne: user.uid }, contextType: { $ne: "jobs" } }).sort({ updatedAt: -1 }).toArray();
      const conversations = await enrichConversations(req, user, records);
      const { createHash } = await import("crypto");
      const cursor = createHash("sha256").update(JSON.stringify(conversations)).digest("hex");
      if (cursor !== req.query.cursor || Date.now() >= deadline) return res.json({ cursor, conversations });
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  });
  router.get("/direct/:recipientId", async (req, res) => {
    const user = await resolveCurrentUser(req);
    if (!user) return res.status(401).json({ error: "unauthorized" });
    const conversation = await directConversation(req, user, req.params.recipientId, false);
    if (!conversation) return res.status(404).json({ message: "Recipient not found" });
    const [enriched] = await enrichConversations(req, user, [conversation]);
    return res.json({ conversation: enriched });
  });
  router.get("/", async (req, res) => {
    const currentUser = await resolveCurrentUser(req);
    if (!currentUser) return res.status(401).json({ error: "unauthorized" });
    const uid = currentUser.uid;
    const contextType = req.query.context === "jobs" ? "jobs" : "marketplace";
    const conversations = await req.app.locals.conversationCollection.find({
      participants: uid,
      deletedBy: { $ne: uid },
      ...(contextType === "jobs"
        ? { contextType: "jobs", applicationId: { $exists: true, $ne: "" }, jobId: { $exists: true, $ne: "" } }
        : { contextType: { $ne: "jobs" } }),
    }).sort({ updatedAt: -1 }).toArray();
    const visibleConversations = contextType === "jobs"
      ? conversations.filter((conversation: Record<string, any>) =>
        conversation.sellerId === uid || Boolean(conversation.lastMessage),
      )
      : conversations;
    const grouped = new Map<string, Array<Record<string, any>>>();
    visibleConversations.forEach((conversation: Record<string, any>) => {
      const key = conversation.pairKey || pairKeyFor(conversation.buyerId, conversation.sellerId);
      grouped.set(key, [...(grouped.get(key) || []), conversation]);
    });
    const merged = (await Promise.all([...grouped.values()].map((items) => mergePairConversations(req, items)))).filter(Boolean) as Array<Record<string, any>>;
    merged.sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());
    const previews: Record<string, any> = {};
    if (req.query.includePreviews === "1") {
      const queue = merged.slice(0, 20);
      const worker = async () => { while (queue.length) { const item = queue.shift()!; const id = item._id.toString(); previews[id] = await historyPage(req, id, uid, 12, "", true); } };
      await Promise.all([worker(), worker(), worker(), worker()]);
    }
    return res.status(200).json({ conversations: await enrichConversations(req, currentUser, merged), ...(req.query.includePreviews === "1" ? { previews } : {}) });
  });

  router.post("/start", async (req, res) => {
    const user = await resolveCurrentUser(req);
    if (!user) return res.status(401).json({ error: "unauthorized", message: "User needs to sign in first" });
    const productId = String(req.body?.productId || "");
    if (!ObjectId.isValid(productId)) return res.status(400).json({ error: "bad_request", message: "Invalid product id" });
    const product = await req.app.locals.productCollection.findOne({ _id: new ObjectId(productId) });
    if (!product || product.sellerId === user.uid) return res.status(400).json({ error: "bad_request", message: "Conversation cannot be created" });
    const pairKey = pairKeyFor(user.uid, product.sellerId);
    const pairConversations = await req.app.locals.conversationCollection.find({
      $or: [
        { pairKey, contextType: { $ne: "jobs" } },
        { buyerId: user.uid, sellerId: product.sellerId, contextType: { $ne: "jobs" } },
        { buyerId: product.sellerId, sellerId: user.uid, contextType: { $ne: "jobs" } },
      ],
    }).sort({ updatedAt: -1 }).toArray();
    let conversation: Record<string, any> | null = await mergePairConversations(req, pairConversations);
    if (!conversation) {
      const document = {
        pairKey,
        buyerId: user.uid,
        buyerName: user.displayName || user.username,
        sellerId: product.sellerId,
        sellerName: product.sellerName,
        productId,
        productTitle: product.title,
        productImage: product.image,
        participants: [user.uid, product.sellerId],
        lastMessage: "",
        unreadBy: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      try {
        const result = await req.app.locals.conversationCollection.insertOne(document);
        conversation = { ...document, _id: result.insertedId };
      } catch (error: any) {
        if (error?.code !== 11000) throw error;
        conversation = await req.app.locals.conversationCollection.findOne({ pairKey });
        if (!conversation) throw error;
      }
    } else {
      const productContext = { productId, productTitle: product.title, productImage: product.image, updatedAt: new Date() };
      await req.app.locals.conversationCollection.updateOne({ _id: conversation._id }, { $set: productContext, $pull: { deletedBy: user.uid } });
      conversation = { ...conversation, ...productContext };
    }
    return res.status(200).json({ conversation: serialize(conversation) });
  });

  router.get("/:id", async (req, res) => {
    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: "bad_request", message: "Invalid conversation id" });
    const currentUser = await resolveCurrentUser(req);
    if (!currentUser) return res.status(401).json({ error: "unauthorized" });
    const uid = currentUser.uid;
    const conversation = await req.app.locals.conversationCollection.findOne({ _id: new ObjectId(req.params.id), participants: uid, deletedBy: { $ne: uid } });
    if (!conversation) return res.status(404).json({ error: "not_found", message: "Conversation not found" });
    if (conversation.contextType === "jobs") {
      if (!conversation.applicationId || !conversation.jobId)
        return res.status(404).json({ error: "not_found", message: "Jobs conversation not found" });
      if (!conversation.lastMessage && conversation.sellerId !== uid)
        return res.status(403).json({ error: "employer_message_required", message: "The employer must send the first Jobs message." });
    }
    const before = String(req.query.before || "");
    if (before && !ObjectId.isValid(before)) return res.status(400).json({ message: "Invalid history cursor" });
    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 50));
    const page = await historyPage(req, req.params.id, uid, limit, before, req.query.light === "1");
    if (!before && req.query.preview !== "true") {
      const readAt = new Date();
      await req.app.locals.messageCollection.updateMany({ conversationId: req.params.id, senderId: { $ne: uid }, hiddenFor: { $ne: uid }, readAt: { $exists: false } }, { $set: { readAt } });
      await req.app.locals.conversationCollection.updateOne({ _id: conversation._id, unreadBy: uid }, { $pull: { unreadBy: uid }, $set: { readUpdatedAt: readAt } });
    }
    const [enrichedConversation] = await enrichConversations(req, currentUser, [conversation]);
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ conversation: enrichedConversation, ...page });
  });

  router.get("/:id/messages/:messageId/media", async (req, res) => {
    if (!ObjectId.isValid(req.params.id) || !ObjectId.isValid(req.params.messageId)) return res.status(400).json({ message: "Invalid media id" });
    const user = await resolveCurrentUser(req);
    if (!user) return res.status(401).json({ error: "unauthorized" });
    const conversation = await req.app.locals.conversationCollection.findOne({ _id: new ObjectId(req.params.id), participants: user.uid, deletedBy: { $ne: user.uid } });
    if (!conversation || (conversation.contextType === "jobs" && (!conversation.applicationId || !conversation.jobId || (!conversation.lastMessage && conversation.sellerId !== user.uid)))) return res.status(404).json({ message: "Media not found" });
    const message = await req.app.locals.messageCollection.findOne({ _id: new ObjectId(req.params.messageId), conversationId: req.params.id, hiddenFor: { $ne: user.uid }, deletedForEveryone: { $ne: true } });
    if (!message) return res.status(404).json({ message: "Media not found" });
    const value = String(message.audioDataUrl || message.attachmentDataUrl || "");
    const match = /^data:([a-z0-9.+-]+\/[a-z0-9.+-]+)(?:;codecs=[a-z0-9-]+)?;base64,([a-z0-9+/=]+)$/i.exec(value);
    if (!match || value.length > MAX_MESSAGE_DOCUMENT_BYTES) return res.status(404).json({ message: "Media not found" });
    const mime = match[1].toLowerCase();
    const inline = /^(audio\/(webm|mp4|mpeg|ogg|wav)|video\/(mp4|webm|ogg)|image\/(png|jpeg|jpg|webp|gif))$/.test(mime);
    res.setHeader("Content-Type", inline ? mime : "application/octet-stream");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Disposition", (inline ? "inline" : "attachment") + "; filename*=UTF-8''" + encodeURIComponent(safeAttachmentName(message.attachmentName || "voice-note")));
    return res.send(Buffer.from(match[2], "base64"));
  });

  router.post("/:id/typing", async (req, res) => {
    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: "bad_request", message: "Invalid conversation id" });
    const user = await resolveCurrentUser(req);
    if (!user) return res.status(401).json({ error: "unauthorized", message: "User needs to sign in first" });
    const conversation = await req.app.locals.conversationCollection.findOne({ _id: new ObjectId(req.params.id), participants: user.uid });
    if (!conversation) return res.status(404).json({ error: "not_found", message: "Conversation not found" });
    const typingBy = { ...(conversation.typingBy || {}) };
    if (req.body?.typing) typingBy[user.uid] = new Date();
    else delete typingBy[user.uid];
    await req.app.locals.conversationCollection.updateOne({ _id: conversation._id }, { $set: { typingBy } });
    return res.status(200).json({ ok: true });
  });

  router.patch("/:id/archive", async (req, res) => {
    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: "bad_request", message: "Invalid conversation id" });
    const user = await resolveCurrentUser(req);
    if (!user) return res.status(401).json({ error: "unauthorized", message: "User needs to sign in first" });
    const conversation = await req.app.locals.conversationCollection.findOne({ _id: new ObjectId(req.params.id), participants: user.uid });
    if (!conversation) return res.status(404).json({ error: "not_found", message: "Conversation not found" });
    const archive = Boolean(req.body?.archive);
    await req.app.locals.conversationCollection.updateOne(
      { _id: conversation._id },
      archive ? { $addToSet: { archivedBy: user.uid }, $set: { updatedAt: new Date() } } : { $pull: { archivedBy: user.uid }, $set: { updatedAt: new Date() } },
    );
    const updated = await req.app.locals.conversationCollection.findOne({ _id: conversation._id });
    const [enrichedConversation] = await enrichConversations(req, user, updated ? [updated] : []);
    return res.status(200).json({ conversation: enrichedConversation });
  });

  router.delete("/:id", async (req, res) => {
    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: "bad_request", message: "Invalid conversation id" });
    const user = await resolveCurrentUser(req);
    if (!user) return res.status(401).json({ error: "unauthorized", message: "User needs to sign in first" });
    const conversation = await req.app.locals.conversationCollection.findOne({ _id: new ObjectId(req.params.id), participants: user.uid });
    if (!conversation) return res.status(404).json({ error: "not_found", message: "Conversation not found" });
    await req.app.locals.conversationCollection.updateOne(
      { _id: conversation._id },
      { $addToSet: { deletedBy: user.uid }, $pull: { unreadBy: user.uid, archivedBy: user.uid }, $set: { updatedAt: new Date() } },
    );
    return res.status(200).json({ deleted: true, conversationId: req.params.id });
  });

  router.post(["/direct/:recipientId", "/:id"], async (req, res) => {
    if (!req.params.recipientId && !ObjectId.isValid(req.params.id)) return res.status(400).json({ error: "bad_request", message: "Invalid conversation id" });
    const user = await resolveCurrentUser(req);
    if (!user) return res.status(401).json({ error: "unauthorized", message: "User needs to sign in first" });
    let conversation = req.params.recipientId ? null : await req.app.locals.conversationCollection.findOne({ _id: new ObjectId(req.params.id), participants: user.uid });
    if (!conversation && !req.params.recipientId) return res.status(404).json({ error: "not_found", message: "Conversation not found" });
    if (conversation?.contextType === "jobs" && !conversation.lastMessage && conversation.sellerId !== user.uid)
      return res.status(403).json({ error: "employer_message_required", message: "The employer must send the first Jobs message." });
    const message = String(req.body?.message || "").trim();
    const requestedType = String(req.body?.messageType || "text");
    const messageType = allowedMessageTypes.has(requestedType) ? requestedType : "text";
    const audioDataUrl = String(req.body?.audioDataUrl || "");
    const audioMimeType = String(req.body?.audioMimeType || "");
    const audioDurationSeconds = Math.max(1, Math.min(180, Math.round(Number(req.body?.audioDurationSeconds) || 0)));
    const attachmentUrl = String(req.body?.attachmentUrl || "").trim().slice(0, 1200);
    const attachmentDataUrl = String(req.body?.attachmentDataUrl || "");
    const attachmentName = safeAttachmentName(req.body?.attachmentName);
    const attachmentMimeType = String(req.body?.attachmentMimeType || "").trim().slice(0, 120);
    const attachmentSize = Math.max(0, Math.round(Number(req.body?.attachmentSize) || 0));
    if (messageType === "text" && (!message || message.length > 1000)) return res.status(400).json({ error: "bad_request", message: "Message must be 1-1000 characters" });
    if (messageType === "voice" && (!voiceDataPattern.test(audioDataUrl) || audioDataUrl.length > MAX_VOICE_NOTE_BYTES)) {
      return res.status(400).json({ error: "bad_request", message: "Voice note must be a valid audio file under 2MB." });
    }
    if (messageType === "image") {
      const hasImageUrl = /^https?:\/\//i.test(attachmentUrl);
      const hasImageData = imageDataPattern.test(attachmentDataUrl) && attachmentDataUrl.length <= MAX_MESSAGE_IMAGE_BYTES;
      if (!hasImageUrl && !hasImageData) return res.status(400).json({ error: "bad_request", message: "Photo must be a valid uploaded image." });
    }
    if (messageType === "document" && (!documentDataPattern.test(attachmentDataUrl) || attachmentDataUrl.length > MAX_MESSAGE_DOCUMENT_BYTES)) {
      return res.status(400).json({ error: "bad_request", message: "Document must be a valid file under 3.5MB." });
    }
    if (req.params.recipientId) {
      conversation = await directConversation(req, user, req.params.recipientId, false);
      if (!conversation) return res.status(404).json({ message: "Recipient not found" });
      req.params.id = conversation._id.toString();
    }
    const clientMessageId = String(req.body?.clientMessageId || "");
    if (clientMessageId && !/^[a-zA-Z0-9_-]{8,100}$/.test(clientMessageId)) return res.status(400).json({ message: "Invalid send identifier" });
    const receiverId = conversation.buyerId === user.uid ? conversation.sellerId : conversation.buyerId;
    const imageCaption = messageType === "image" && message ? message.slice(0, 1000) : "";
    const displayMessage = messageType === "voice" ? `Voice message (${Math.floor(audioDurationSeconds / 60)}:${String(audioDurationSeconds % 60).padStart(2, "0")})` : messageType === "image" ? imageCaption || "Photo" : messageType === "document" ? (attachmentMimeType.startsWith("video/") ? message.slice(0, 1000) || "Video" : `Document: ${attachmentName}`) : message;
    // Product context belongs to an explicit enquiry, not every reply in the thread.
    let productContext = {};
    const enquiryProductId = String(req.body?.productId || "");
    if (enquiryProductId) {
      if (!ObjectId.isValid(enquiryProductId)) return res.status(400).json({ message: "Invalid enquiry product." });
      const product = await req.app.locals.productCollection.findOne({ _id: new ObjectId(enquiryProductId) });
      const otherParticipant = conversation.participants.find((id: string) => id !== user.uid);
      if (!product || product.sellerId !== otherParticipant || conversation.contextType === "jobs") return res.status(400).json({ message: "Product does not belong to this conversation's seller." });
      productContext = { productContextExplicit: true, productId: enquiryProductId, productTitle: product.title, productImage: product.image };
    }
    if (req.params.recipientId && typeof conversation._id === "string") {
      conversation = await directConversation(req, user, req.params.recipientId, true);
      if (!conversation || typeof conversation._id === "string") return res.status(404).json({ message: "Recipient not found" });
      req.params.id = conversation._id.toString();
    }
    const previous = clientMessageId ? await req.app.locals.messageCollection.findOne({ conversationId: req.params.id, senderId: user.uid, clientMessageId }) : null;
    if (previous) {
      await req.app.locals.conversationCollection.updateOne({ _id: conversation._id, lastMessageId: { $exists: false } }, { $set: { lastMessage: previous.message, lastMessageId: previous._id.toString(), updatedAt: previous.createdAt }, $addToSet: { unreadBy: receiverId }, $pull: { deletedBy: receiverId } });
      return res.json({ message: serialize(previous), conversation: (await enrichConversations(req, user, [conversation]))[0] });
    }
    const document = {
      conversationId: req.params.id,
      ...(clientMessageId ? { clientMessageId } : {}),
      ...productContext,
      senderId: user.uid,
      senderName: user.displayName || user.username,
      message: displayMessage,
      messageType,
      ...(messageType === "voice" ? { audioDataUrl, audioMimeType, audioDurationSeconds } : {}),
      ...(messageType === "image" ? { attachmentUrl, ...(attachmentDataUrl ? { attachmentDataUrl } : {}), attachmentName, attachmentMimeType, attachmentSize } : {}),
      ...(messageType === "document" ? { attachmentDataUrl, attachmentName, attachmentMimeType, attachmentSize } : {}),
      createdAt: new Date(),
    };
    let result;
    try { result = await req.app.locals.messageCollection.insertOne(document); }
    catch (error: any) {
      if (error?.code !== 11000 || !clientMessageId) throw error;
      const existing = await req.app.locals.messageCollection.findOne({ conversationId: req.params.id, senderId: user.uid, clientMessageId });
      if (!existing) throw error;
      return res.json({ message: serialize(existing), conversation: (await enrichConversations(req, user, [conversation]))[0] });
    }
    await req.app.locals.conversationCollection.updateOne({ _id: conversation._id, $or: [{ lastMessageId: { $exists: false } }, { lastMessageId: { $lt: result.insertedId.toString() } }] }, { $set: { lastMessage: document.message, lastMessageId: result.insertedId.toString(), updatedAt: document.createdAt }, $addToSet: { unreadBy: receiverId }, $pull: { deletedBy: { $in: [user.uid, receiverId] } } });
    void createNotification(req.app, { userId: receiverId, type: "new_message", title: "New message", message: `${document.senderName}: ${document.message.slice(0, 100)}`, relatedId: req.params.id, image: user.avatar || "" }).catch((error: unknown) => console.error("Message notification failed", error));
    return res.status(201).json({ message: serialize({ ...document, _id: result.insertedId }), conversation: (await enrichConversations(req, user, [{ ...conversation, lastMessage: document.message, lastMessageId: result.insertedId.toString(), updatedAt: document.createdAt }]))[0] });
  });

  router.delete("/:id/messages/:messageId", async (req, res) => {
    if (!ObjectId.isValid(req.params.id) || !ObjectId.isValid(req.params.messageId)) return res.status(400).json({ error: "bad_request", message: "Invalid message id" });
    const user = await resolveCurrentUser(req);
    if (!user) return res.status(401).json({ error: "unauthorized", message: "User needs to sign in first" });
    const conversation = await req.app.locals.conversationCollection.findOne({ _id: new ObjectId(req.params.id), participants: user.uid });
    if (!conversation) return res.status(404).json({ error: "not_found", message: "Conversation not found" });
    const message = await req.app.locals.messageCollection.findOne({ _id: new ObjectId(req.params.messageId), conversationId: req.params.id });
    if (!message) return res.status(404).json({ error: "not_found", message: "Message not found" });
    const scope = req.body?.scope === "everyone" ? "everyone" : "me";
    if (scope === "everyone") {
      if (message.senderId !== user.uid) return res.status(403).json({ error: "forbidden", message: "Only the sender can delete this message for everyone." });
      if (Date.now() - new Date(message.createdAt).getTime() > 15 * 60 * 1000) return res.status(400).json({ error: "delete_window_expired", message: "Delete for everyone is available for 15 minutes." });
      const deletedMessage = "This message was deleted.";
      const deletedAt = new Date();
      const deletedFields = { message: deletedMessage, messageType: "text", deletedForEveryone: true, deletedAt, audioDataUrl: "", attachmentUrl: "", attachmentDataUrl: "", attachmentName: "" };
      await req.app.locals.messageCollection.updateOne({ _id: message._id }, { $set: deletedFields });
      if (conversation.lastMessageId === req.params.messageId || conversation.lastMessage === message.message) {
        await req.app.locals.conversationCollection.updateOne({ _id: conversation._id }, { $set: { lastMessage: deletedMessage, updatedAt: deletedAt } });
      }
      await req.app.locals.conversationCollection.updateOne({ _id: conversation._id }, { $set: { messageUpdatedAt: deletedAt } });
      return res.status(200).json({ message: serialize({ ...message, ...deletedFields }) });
    }
    await req.app.locals.messageCollection.updateOne({ _id: message._id }, { $addToSet: { hiddenFor: user.uid } });
    await req.app.locals.conversationCollection.updateOne({ _id: conversation._id }, { $set: { messageUpdatedAt: new Date() } });
    return res.status(200).json({ hidden: true, messageId: req.params.messageId });
  });
}
