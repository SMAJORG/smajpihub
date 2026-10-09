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
    await app.locals.notificationCollection.insertOne({ ...input, read: false, createdAt: new Date() });
    const { sendPushNotification } = await import("./pushNotifications");
    await sendPushNotification(app, input.userId, {
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
