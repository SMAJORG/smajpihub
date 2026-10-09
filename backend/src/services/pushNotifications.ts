import webpush from "web-push";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";

type PushSubscriptionRecord = {
  userId: string;
  endpoint: string;
  subscription: webpush.PushSubscription;
};

type NativePushTokenRecord = {
  userId: string;
  token: string;
};

const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
const subject = process.env.VAPID_SUBJECT?.trim() || "mailto:support@smajpihub.com";
const firebaseProjectId = process.env.FIREBASE_PROJECT_ID?.trim();
const firebaseClientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
const firebasePrivateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n").trim();

if (publicKey && privateKey) webpush.setVapidDetails(subject, publicKey, privateKey);

export const pushConfigured = () => Boolean(publicKey && privateKey);
export const nativePushConfigured = () => Boolean(firebaseProjectId && firebaseClientEmail && firebasePrivateKey);
export const getVapidPublicKey = () => publicKey || "";

const firebaseMessaging = () => {
  if (!nativePushConfigured()) return null;
  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId: firebaseProjectId,
        clientEmail: firebaseClientEmail,
        privateKey: firebasePrivateKey,
      }),
    });
  }
  return getMessaging();
};

const sendWebPushNotification = async (app: any, userId: string, payload: Record<string, unknown>) => {
  if (!pushConfigured() || !app.locals.pushSubscriptionCollection) return;
  const subscriptions: PushSubscriptionRecord[] = await app.locals.pushSubscriptionCollection.find({ userId }).toArray();
  await Promise.all(subscriptions.map(async (record) => {
    try {
      await webpush.sendNotification(record.subscription, JSON.stringify(payload), { TTL: 86400 });
    } catch (error: any) {
      if (error?.statusCode === 404 || error?.statusCode === 410) {
        await app.locals.pushSubscriptionCollection.deleteOne({ endpoint: record.endpoint });
      } else {
        console.error("Web push delivery failed:", error?.statusCode || error);
      }
    }
  }));
};

const sendNativePushNotification = async (app: any, userId: string, payload: Record<string, unknown>) => {
  const messaging = firebaseMessaging();
  if (!messaging || !app.locals.nativePushTokenCollection) return;
  const records: NativePushTokenRecord[] = await app.locals.nativePushTokenCollection.find({ userId }).toArray();
  const title = String(payload.title || "SMAJ PI HUB");
  const body = String(payload.body || "You have a new notification.");
  const path = String(payload.path || payload.url || "/notifications");
  const image = payload.image || payload.icon;
  const imageUrl = typeof image === "string" && /^https:\/\//.test(image) ? image : undefined;
  const data = { path, url: path, type: String(payload.type || "notification") };

  await Promise.all(records.map(async (record) => {
    try {
      await messaging.send({
        token: record.token,
        notification: { title, body, ...(imageUrl ? { imageUrl } : {}) },
        data,
        android: {
          priority: "high",
          ttl: 24 * 60 * 60 * 1000,
          notification: { channelId: "smaj_notifications", sound: "default", icon: "ic_stat_smaj", color: "#08768b" },
        },
      });
    } catch (error: any) {
      const code = String(error?.code || "");
      if (["messaging/registration-token-not-registered", "messaging/invalid-registration-token", "messaging/invalid-argument"].includes(code)) {
        await app.locals.nativePushTokenCollection.deleteOne({ token: record.token });
      } else {
        console.error("Android push delivery failed:", code || error);
      }
    }
  }));
};

export const sendPushNotification = async (app: any, userId: string, payload: Record<string, unknown>) => {
  await Promise.all([
    sendWebPushNotification(app, userId, payload),
    sendNativePushNotification(app, userId, payload),
  ]);
};