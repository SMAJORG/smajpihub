import { ObjectId } from "mongodb";
import { publishUserNotification } from "./notificationEvents";
import { sendPiInAppNotification } from "./piInAppNotifications";

type NotificationInput = {
  userId: string;
  type: string;
  title: string;
  message: string;
  relatedId?: string;
  image?: string;
  actorId?: string;
  action?: string;
  actionUrl?: string;
  dedupeKey?: string;
};

const defaultNotificationRoute = (input: NotificationInput) =>
  input.relatedId === "messages" || input.type.includes("message")
    ? "/messages"
    : input.relatedId && (input.type.includes("order") || input.type.includes("payment"))
      ? `/orders/${input.relatedId}/track`
      : input.type.includes("product") && input.relatedId
        ? `/product/${input.relatedId}`
        : input.relatedId === "settings" || input.type.includes("security")
          ? "/settings"
          : "/notifications";

export const sendPiInAppNotificationToUser = async (
  app: any,
  userId: string,
  input: { title: string; body: string; subroute?: string },
) => {
  try {
    const recipient = await app.locals.userCollection?.findOne({ uid: userId });
    if (recipient?.piInAppNotificationsEnabled !== true) return false;
    const sender = app.locals.piInAppNotificationSender || sendPiInAppNotification;
    const result = await sender({
      userId,
      title: input.title,
      body: input.body,
      subroute: input.subroute || "/notifications",
    });
    return result.delivered;
  } catch (error: any) {
    console.error("Pi in-app notification delivery failed:", error?.status || "request_error");
    return false;
  }
};

export const createNotification = async (app: any, input: NotificationInput): Promise<void> => {
  if (!input.userId || !app.locals.notificationCollection) return;
  try {
    // Education stores MongoDB user IDs; inboxes and push subscriptions use Pi UIDs.
    let userId = input.userId;
    if (ObjectId.isValid(userId) && app.locals.userCollection) {
      const user = await app.locals.userCollection.findOne({ uid: userId })
        || await app.locals.userCollection.findOne({ _id: new ObjectId(userId) });
      if (!user?.uid) return;
      userId = user.uid;
    }
    const [recipient, actor] = await Promise.all([
      app.locals.userCollection?.findOne({ uid: userId }),
      input.actorId ? app.locals.userCollection?.findOne({ uid: input.actorId }) : null,
    ]);
    if (actor?.uid === userId) return;
    const settings = recipient?.settings || {};
    const categoryPreference = input.type.startsWith("community_")
      ? settings.community?.notifications
      : input.type.startsWith("jobs_") ? settings.jobs?.notifications : undefined;
    if (!input.type.includes("security")
      && (settings.notifications === false || categoryPreference === false)) return;
    const createdAt = new Date();
    const document = {
      userId,
      type: input.type,
      title: input.title,
      message: input.message,
      ...(input.relatedId ? { relatedId: input.relatedId } : {}),
      ...(input.action ? { action: input.action } : {}),
      ...(input.actionUrl ? { actionUrl: input.actionUrl } : {}),
      ...(input.dedupeKey ? { dedupeKey: input.dedupeKey } : {}),
      ...(actor ? {
        actor: { uid: actor.uid, displayName: String(actor.displayName || actor.username || "Pi user"), avatar: String(actor.avatar || "") },
        image: String(actor.avatar || input.image || ""),
      } : input.image ? { image: input.image } : {}),
      read: false,
      createdAt,
    };
    let insertedId: ObjectId | null = null;
    if (input.dedupeKey) {
      const result = await app.locals.notificationCollection.updateOne(
        { userId, dedupeKey: input.dedupeKey },
        { $setOnInsert: document },
        { upsert: true },
      );
      if (!result.upsertedCount) return;
      insertedId = result.upsertedId;
    } else {
      const result = await app.locals.notificationCollection.insertOne(document);
      insertedId = result.insertedId;
    }
    const unreadCount = await app.locals.notificationCollection.countDocuments({ userId, read: false });
    publishUserNotification(userId, {
      notification: { ...document, _id: String(insertedId) },
      unreadCount,
    });
    const subroute = input.actionUrl?.startsWith("/") && !input.actionUrl.startsWith("//")
      ? input.actionUrl
      : defaultNotificationRoute(input);
    await sendPiInAppNotificationToUser(app, userId, {
      title: input.title,
      body: input.message,
      subroute,
    });
    const { sendPushNotification } = await import("./pushNotifications");
    await sendPushNotification(app, userId, {
      title: input.title,
      body: input.message,
      icon: "/logo.png",
      badge: "/notification-badge.png",
      image: actor?.avatar || input.image || undefined,
      url: input.actionUrl || defaultNotificationRoute(input),
      tag: input.dedupeKey || `${input.type}:${input.relatedId || input.title}`,
    });
  } catch (err) {
    console.error("Notification creation failed:", err);
  }
};
