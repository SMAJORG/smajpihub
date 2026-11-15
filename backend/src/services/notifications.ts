import { ObjectId } from "mongodb";

type NotificationInput = {
  userId: string;
  type: string;
  title: string;
  message: string;
  relatedId?: string;
  image?: string;
};

export const createNotification = async (app: any, input: NotificationInput) => {
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
    await app.locals.notificationCollection.insertOne({ ...input, userId, read: false, createdAt: new Date() });
    const { sendPushNotification } = await import("./pushNotifications");
    await sendPushNotification(app, userId, {
      title: input.title,
      body: input.message,
      icon: "/logo.png",
      badge: "/notification-badge.png",
      image: input.image || undefined,
      url: input.relatedId === "messages" || input.type.includes("message")
        ? "/messages"
        : input.relatedId && (input.type.includes("order") || input.type.includes("payment"))
          ? `/orders/${input.relatedId}/track`
          : input.type.includes("product") && input.relatedId
            ? `/product/${input.relatedId}`
            : input.relatedId === "settings" || input.type.includes("security") ? "/settings" : "/notifications",
      tag: `${input.type}:${input.relatedId || input.title}`,
    });
  } catch (err) {
    console.error("Notification creation failed:", err);
  }
};
