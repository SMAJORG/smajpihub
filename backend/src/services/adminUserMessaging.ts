import { createHash } from "node:crypto";
import { ObjectId } from "mongodb";

const accountFields = ["uid", "username", "piUsername", "displayName", "avatar", "coverImage", "bio", "country", "contactPhone", "email", "language", "role", "roles", "blocked", "sellerActive", "createdAt", "updatedAt", "lastSeenAt", "verificationLevel", "verificationStatus", "verificationRequested", "verificationRequestType"];
export const adminAccount = (user: Record<string, any>) => Object.fromEntries([
  ["_id", user._id.toString()], ...accountFields.filter(key => user[key] !== undefined).map(key => [key, user[key]]),
]);

export async function sendAdminUserMessage(collections: any, sender: Record<string, any>, recipient: Record<string, any>, text: string, requestId: string, notify: (input: any) => Promise<void>) {
  if (!sender.uid || !recipient.uid || sender.uid === recipient.uid) throw new Error("This account cannot receive this message.");
  if (!text.trim() || text.trim().length > 1000) throw new Error("Enter a message of 1 to 1,000 characters.");
  const pairKey = [sender.uid, recipient.uid].sort().join(":");
  const conversations = collections.conversationCollection;
  let conversation = await conversations.findOne({ pairKey });
  if (!conversation) conversation = await conversations.findOne({ $or: [{ buyerId: sender.uid, sellerId: recipient.uid }, { buyerId: recipient.uid, sellerId: sender.uid }], contextType: { $ne: "jobs" } });
  if (!conversation) {
    const document = { pairKey, contextType: "admin", buyerId: sender.uid, buyerName: sender.displayName || sender.username, sellerId: recipient.uid, sellerName: recipient.displayName || recipient.username, participants: [sender.uid, recipient.uid], productId: "", productTitle: "", productImage: "", unreadBy: [], lastMessage: "", createdAt: new Date(), updatedAt: new Date() };
    try { const result = await conversations.insertOne(document); conversation = { ...document, _id: result.insertedId }; }
    catch (error: any) { if (error?.code !== 11000) throw error; conversation = await conversations.findOne({ pairKey }); if (!conversation) throw error; }
  }
  const id = new ObjectId(createHash("sha256").update(JSON.stringify([sender.uid, requestId, recipient.uid])).digest("hex").slice(0, 24));
  const existing = await collections.messageCollection.findOne({ _id: id });
  if (existing && existing.message !== text.trim()) throw new Error("Start a new message before changing a retried message.");
  if (existing?.deliveredAt) return { conversationId: existing.conversationId, alreadySent: true };
  let inserted = false;
  if (!existing) {
    try {
      await collections.messageCollection.insertOne({ _id: id, conversationId: conversation._id.toString(), productId: conversation.productId || "", productTitle: conversation.productTitle || "", productImage: conversation.productImage || "", senderId: sender.uid, senderName: sender.displayName || sender.username, message: text.trim(), messageType: "text", adminMessage: true, createdAt: new Date() });
      inserted = true;
    } catch (error: any) { if (error?.code !== 11000) throw error; }
  }
  // Repair visibility on retries without generating another message or notification.
  const latest = await collections.messageCollection.find({ conversationId: conversation._id.toString() }).sort({ createdAt: -1 }).limit(1).toArray();
  await conversations.updateOne({ _id: conversation._id }, { $set: { lastMessage: latest[0]?.message || text.trim(), lastMessageId: latest[0]?._id.toString() || id.toString(), updatedAt: latest[0]?.createdAt || new Date() }, $addToSet: { unreadBy: recipient.uid }, $pull: { deletedBy: { $in: [sender.uid, recipient.uid] }, archivedBy: recipient.uid } });
  await collections.messageCollection.updateOne({ _id: id }, { $set: { deliveredAt: new Date() } });
  if (inserted) await notify({ userId: recipient.uid, type: "admin_message", title: "Message from admin", message: (sender.displayName || sender.username) + ": " + text.trim().slice(0, 100), relatedId: conversation._id.toString(), image: sender.avatar || "" });
  return { conversationId: conversation._id.toString(), alreadySent: !inserted };
}
