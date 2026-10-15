import { readUserPresence } from "../services/userPresence";
import { Router } from "express";
import { ObjectId } from "mongodb";
import { createNotification } from "../services/notifications";
import { resolveCurrentUser } from "../services/auth";

const serialize = (item: Record<string, any>) => ({ ...item, _id: item._id.toString() });
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
  const primary = sorted[0];
  const duplicates = sorted.slice(1);
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
          productId: conversation.productId || "",
          productTitle: conversation.productTitle || "",
          productImage: conversation.productImage || "",
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

export default function mountMessageEndpoints(router: Router) {
  router.get("/", async (req, res) => {
    const currentUser = await resolveCurrentUser(req);
    if (!currentUser) return res.status(200).json({ conversations: [] });
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
    return res.status(200).json({ conversations: await enrichConversations(req, currentUser, merged) });
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
    if (!currentUser) return res.status(200).json({ conversation: null, messages: [] });
    const uid = currentUser.uid;
    const conversation = await req.app.locals.conversationCollection.findOne({ _id: new ObjectId(req.params.id), participants: uid, deletedBy: { $ne: uid } });
    if (!conversation) return res.status(404).json({ error: "not_found", message: "Conversation not found" });
    if (conversation.contextType === "jobs") {
      if (!conversation.applicationId || !conversation.jobId)
        return res.status(404).json({ error: "not_found", message: "Jobs conversation not found" });
      if (!conversation.lastMessage && conversation.sellerId !== uid)
        return res.status(403).json({ error: "employer_message_required", message: "The employer must send the first Jobs message." });
    }
    await req.app.locals.messageCollection.updateMany({ conversationId: req.params.id, senderId: { $ne: uid }, readAt: { $exists: false } }, { $set: { readAt: new Date() } });
    const messages = (await req.app.locals.messageCollection.find({ conversationId: req.params.id }).sort({ createdAt: 1 }).toArray())
      .filter((message: Record<string, any>) => !Array.isArray(message.hiddenFor) || !message.hiddenFor.includes(uid));
    await req.app.locals.conversationCollection.updateOne({ _id: conversation._id }, { $pull: { unreadBy: uid } });
    const [enrichedConversation] = await enrichConversations(req, currentUser, [conversation]);
    return res.status(200).json({ conversation: enrichedConversation, messages: messages.map(serialize) });
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

  router.post("/:id", async (req, res) => {
    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: "bad_request", message: "Invalid conversation id" });
    const user = await resolveCurrentUser(req);
    if (!user) return res.status(401).json({ error: "unauthorized", message: "User needs to sign in first" });
    const conversation = await req.app.locals.conversationCollection.findOne({ _id: new ObjectId(req.params.id), participants: user.uid });
    if (!conversation) return res.status(404).json({ error: "not_found", message: "Conversation not found" });
    if (conversation.contextType === "jobs" && !conversation.lastMessage && conversation.sellerId !== user.uid)
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
    const receiverId = conversation.buyerId === user.uid ? conversation.sellerId : conversation.buyerId;
    const imageCaption = messageType === "image" && message ? message.slice(0, 1000) : "";
    const displayMessage = messageType === "voice" ? `Voice message (${Math.floor(audioDurationSeconds / 60)}:${String(audioDurationSeconds % 60).padStart(2, "0")})` : messageType === "image" ? imageCaption || "Photo" : messageType === "document" ? `Document: ${attachmentName}` : message;
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
    const document = {
      conversationId: req.params.id,
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
    const result = await req.app.locals.messageCollection.insertOne(document);
    await req.app.locals.conversationCollection.updateOne({ _id: conversation._id }, { $set: { lastMessage: document.message, lastMessageId: result.insertedId.toString(), updatedAt: new Date() }, $addToSet: { unreadBy: receiverId }, $pull: { deletedBy: receiverId } });
    await createNotification(req.app, { userId: receiverId, type: "new_message", title: "New message", message: `${document.senderName}: ${document.message.slice(0, 100)}`, relatedId: req.params.id, image: user.avatar || "" });
    return res.status(201).json({ message: serialize({ ...document, _id: result.insertedId }) });
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
      return res.status(200).json({ message: serialize({ ...message, ...deletedFields }) });
    }
    await req.app.locals.messageCollection.updateOne({ _id: message._id }, { $addToSet: { hiddenFor: user.uid } });
    return res.status(200).json({ hidden: true, messageId: req.params.messageId });
  });
}
