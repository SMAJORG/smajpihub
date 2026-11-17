import { ObjectId } from "mongodb";
import { createNotification } from "./notifications";

export const welcomeLinks = [
  { href: "https://smajpihub.com/terms", label: "Terms & Conditions" },
  { href: "https://smajpihub.com/privacy", label: "Privacy Policy" },
  { href: "https://smajpihub.com/seller-agreement", label: "Seller Agreement" },
];
export const welcomeMessage = `🎉 Welcome to SMAJ PI HUB!

A real-world utility and GCV community-focused platform.

Complete your profile and review: ${welcomeLinks[0].href}, ${welcomeLinks[1].href}, and ${welcomeLinks[2].href}.

Our Live Services

- SMAJ Store — Buy and sell.
- SMAJ Jobs — Find work and hire.
- SMAJ Stream — Watch and explore.

Coming Soon: SMAJ Education.

Stay Connected

Follow SMAJ PI HUB on:

Telegram: https://t.me/smajpihub

X: https://x.com/smajpihub

Message from the SMAJ PI HUB Team

We welcome your feedback. Message the SMAJ PI HUB Team here on SMAJ PI HUB.

Follow SMAJ PI HUB on X: https://x.com/Devsmaj

CONNECT • EMPOWER • GROW

— SMAJ PI HUB Team`;

// Only registration creates this durable pending flag. Existing accounts are
// never backfilled, and client-supplied sender identities are never accepted.
export async function deliverWelcomeMessage(app: any, recipient: any) {
  if (!recipient?.welcomeMessagePending || !recipient.uid || recipient.blocked) return;
  const { userCollection: users, conversationCollection: conversations, messageCollection: messages } = app.locals;
  const welcomeAccountId = recipient._id.toString();
  let message = await messages.findOne({ welcomeAccountId });
  let inserted = false;
  if (!message) {
    const config = await app.locals.siteContentCollection.findOne({ _id: "welcome-message" });
    if (!config?.senderUid) return; // Leave queued until the official account is configured.
    const admin = await users.findOne({ uid: config.senderUid, role: "admin", blocked: { $ne: true } });
    if (!admin || admin.uid === recipient.uid) return;
    const pairKey = [recipient.uid, admin.uid].sort().join(":");
    const now = new Date();
    try {
      await conversations.updateOne({ pairKey }, { $setOnInsert: {
        _id: new ObjectId(), pairKey, buyerId: recipient.uid, buyerName: recipient.displayName || recipient.username,
        sellerId: admin.uid, sellerName: admin.displayName || admin.username,
        participants: [recipient.uid, admin.uid], lastMessage: "", unreadBy: [], createdAt: now, updatedAt: now,
      } }, { upsert: true });
    } catch (error: any) { if (error?.code !== 11000) throw error; }
    const conversation = await conversations.findOne({ pairKey, participants: { $all: [recipient.uid, admin.uid] } });
    if (!conversation) throw new Error("Welcome conversation unavailable");
    try {
      const result = await messages.updateOne({ welcomeAccountId }, { $setOnInsert: {
        _id: new ObjectId(), welcomeAccountId, welcomeVersion: 1,
        conversationId: conversation._id.toString(), senderId: admin.uid, senderName: admin.displayName || admin.username,
        message: welcomeMessage, messageType: "text", linkLabels: welcomeLinks, createdAt: now,
      } }, { upsert: true });
      inserted = result.upsertedCount === 1;
    } catch (error: any) { if (error?.code !== 11000) throw error; }
    message = await messages.findOne({ welcomeAccountId });
  }
  if (!message) throw new Error("Welcome message unavailable");
  const conversation = await conversations.findOne({ _id: new ObjectId(message.conversationId), participants: recipient.uid });
  if (!conversation) throw new Error("Welcome conversation missing");
  // Repair a partial delivery without overwriting replies or re-marking a read
  // welcome as unread. This update is atomic even with multiple worker replicas.
  await conversations.updateOne({ _id: conversation._id, $or: [
    { lastMessageId: { $exists: false } }, { lastMessageId: { $lt: message._id.toString() } },
  ] }, {
    $set: { lastMessage: message.message, lastMessageId: message._id.toString(), updatedAt: message.createdAt },
    $addToSet: { unreadBy: recipient.uid },
  });
  await users.updateOne({ _id: recipient._id, welcomeMessagePending: true }, { $set: {
    welcomeMessagePending: false, welcomeMessageId: message._id.toString(), welcomeMessageSentAt: message.createdAt,
  } });
  if (inserted) await createNotification(app, {
    userId: recipient.uid, type: "new_message", title: "Welcome to SMAJ PI HUB",
    message: "Your welcome message from SMAJ PI HUB Admin is in Messages.", relatedId: message.conversationId,
  });
}

export function startWelcomeDelivery(app: any) {
  let running = false;
  const deliver = async () => {
    if (running) return;
    running = true;
    try {
      const pending = await app.locals.userCollection.find({ welcomeMessagePending: true, blocked: { $ne: true } }).limit(25).toArray();
      for (const recipient of pending) {
        try { await deliverWelcomeMessage(app, recipient); }
        catch { console.error("Welcome delivery deferred; will retry"); }
      }
    } catch { console.error("Welcome delivery queue unavailable; will retry"); }
    finally { running = false; }
  };
  void deliver();
  const timer = setInterval(() => { void deliver(); }, 30000);
  timer.unref();
  return () => clearInterval(timer);
}
