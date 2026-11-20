import { Router } from "express";
import { ObjectId } from "mongodb";
import { resolveCurrentUser } from "../services/auth";
import { getVapidPublicKey, nativePushConfigured, pushConfigured } from "../services/pushNotifications";
import { currentDeviceSessionKey } from "../services/deviceSessions";
import { publishUserNotificationState, subscribeToUserNotifications } from "../services/notificationEvents";

const serialize = (item: Record<string, any>) => ({ ...item, _id: item._id.toString() });

export default function mountNotificationEndpoints(router: Router) {
  router.get("/stream", async (req, res) => {
    const currentUser = await resolveCurrentUser(req);
    if (!currentUser) return res.status(401).end();
    res.status(200).set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();
    res.write(": connected\n\n");
    const unsubscribe = subscribeToUserNotifications(currentUser.uid, res);
    const heartbeat = setInterval(() => {
      if (!res.destroyed && !res.writableEnded) res.write(": heartbeat\n\n");
    }, 25_000);
    res.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });

  router.get("/unread-count", async (req, res) => {
    const currentUser = await resolveCurrentUser(req);
    if (!currentUser) return res.status(200).json({ unreadCount: 0 });
    const unreadCount = await req.app.locals.notificationCollection.countDocuments({ userId: currentUser.uid, read: false });
    return res.status(200).json({ unreadCount });
  });

  router.get("/push/config", (_req, res) => res.json({ configured: pushConfigured(), publicKey: getVapidPublicKey() }));

  router.get("/push/native/status", async (req, res) => {
    const currentUser = await resolveCurrentUser(req);
    if (!currentUser) return res.json({ configured: nativePushConfigured(), subscribed: false });
    const count = await req.app.locals.nativePushTokenCollection.countDocuments({ userId: currentUser.uid });
    return res.json({ configured: nativePushConfigured(), subscribed: count > 0 });
  });

  router.post("/push/native/register", async (req, res) => {
    const currentUser = await resolveCurrentUser(req);
    if (!currentUser) return res.status(401).json({ error: "unauthorized" });
    const token = String(req.body?.token || "").trim();
    if (token.length < 20 || token.length > 4096) return res.status(400).json({ error: "invalid_fcm_token" });
    await req.app.locals.nativePushTokenCollection.updateOne(
      { token },
      { $set: { userId: currentUser.uid, token, sessionKey: currentDeviceSessionKey(req), platform: "android", userAgent: req.get("user-agent"), updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
      { upsert: true },
    );
    const sessionKey = currentDeviceSessionKey(req);
    if (sessionKey) await req.app.locals.deviceSessionCollection?.updateOne({ sessionKey, userId: currentUser.uid }, { $set: { notificationsEnabled: true } });
    return res.status(201).json({ registered: true, configured: nativePushConfigured() });
  });

  router.post("/push/native/unregister", async (req, res) => {
    const currentUser = await resolveCurrentUser(req);
    if (!currentUser) return res.status(401).json({ error: "unauthorized" });
    const token = String(req.body?.token || "").trim();
    if (token) await req.app.locals.nativePushTokenCollection.deleteOne({ userId: currentUser.uid, token });
    const sessionKey = currentDeviceSessionKey(req);
    if (sessionKey) await req.app.locals.deviceSessionCollection?.updateOne({ sessionKey, userId: currentUser.uid }, { $set: { notificationsEnabled: false } });
    return res.json({ registered: false });
  });
  router.get("/push/status", async (req, res) => {
    const currentUser = await resolveCurrentUser(req);
    if (!currentUser) return res.json({ subscribed: false });
    const count = await req.app.locals.pushSubscriptionCollection.countDocuments({ userId: currentUser.uid });
    return res.json({ subscribed: count > 0 });
  });

  router.post("/push/subscribe", async (req, res) => {
    const currentUser = await resolveCurrentUser(req);
    const subscription = req.body?.subscription;
    if (!currentUser) return res.status(401).json({ error: "unauthorized" });
    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) return res.status(400).json({ error: "invalid_subscription" });
    await req.app.locals.pushSubscriptionCollection.updateOne(
      { endpoint: subscription.endpoint },
      { $set: { userId: currentUser.uid, endpoint: subscription.endpoint, subscription, userAgent: req.get("user-agent"), updatedAt: new Date() } },
      { upsert: true },
    );
    return res.status(201).json({ subscribed: true });
  });

  router.post("/push/unsubscribe", async (req, res) => {
    const currentUser = await resolveCurrentUser(req);
    if (currentUser && req.body?.endpoint) await req.app.locals.pushSubscriptionCollection.deleteOne({ userId: currentUser.uid, endpoint: req.body.endpoint });
    return res.json({ subscribed: false });
  });

  router.get("/", async (req, res) => {
    const currentUser = await resolveCurrentUser(req);
    if (!currentUser) {
      return res.status(200).json({ notifications: [], unreadCount: 0 });
    }
    const userId = currentUser.uid;
    const notifications = await req.app.locals.notificationCollection.find({ userId }).sort({ createdAt: -1 }).limit(100).toArray();
    const unreadCount = await req.app.locals.notificationCollection.countDocuments({ userId, read: false });
    return res.status(200).json({ notifications: notifications.map(serialize), unreadCount });
  });

  router.patch("/read-all", async (req, res) => {
    const currentUser = await resolveCurrentUser(req);
    if (!currentUser) {
      return res.status(200).json({ message: "Notifications marked as read" });
    }
    await req.app.locals.notificationCollection.updateMany({ userId: currentUser.uid, read: false }, { $set: { read: true } });
    publishUserNotificationState(currentUser.uid, 0);
    return res.status(200).json({ message: "Notifications marked as read" });
  });

  router.patch("/:id/read", async (req, res) => {
    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: "bad_request", message: "Invalid notification id" });
    const currentUser = await resolveCurrentUser(req);
    if (!currentUser) {
      return res.status(200).json({ message: "Notification marked as read" });
    }
    await req.app.locals.notificationCollection.updateOne({ _id: new ObjectId(req.params.id), userId: currentUser.uid }, { $set: { read: true } });
    const unreadCount = await req.app.locals.notificationCollection.countDocuments({ userId: currentUser.uid, read: false });
    publishUserNotificationState(currentUser.uid, unreadCount);
    return res.status(200).json({ message: "Notification marked as read" });
  });

  router.delete("/:id", async (req, res) => {
    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: "bad_request", message: "Invalid notification id" });
    const currentUser = await resolveCurrentUser(req);
    if (!currentUser) {
      return res.status(200).json({ message: "Notification deleted" });
    }
    await req.app.locals.notificationCollection.deleteOne({ _id: new ObjectId(req.params.id), userId: currentUser.uid });
    const unreadCount = await req.app.locals.notificationCollection.countDocuments({ userId: currentUser.uid, read: false });
    publishUserNotificationState(currentUser.uid, unreadCount);
    return res.status(200).json({ message: "Notification deleted" });
  });
}
