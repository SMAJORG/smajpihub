import assert from "node:assert/strict";
import test from "node:test";
import {
  sendPiInAppNotification,
  verifyPiInAppNotificationScope,
} from "../services/piInAppNotifications";
import { createNotification } from "../services/notifications";
import express from "express";
import { ObjectId } from "mongodb";
import mountNotificationEndpoints from "../handlers/notifications";

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

test("Pi notification delivery uses the server key and valid notification payload", async () => {
  let requestUrl = "";
  let requestInit: RequestInit | undefined;
  const result = await sendPiInAppNotification({
    userId: "pi-recipient",
    title: "Order update",
    body: "Your order is ready.",
    subroute: "/orders/123",
  }, {
    apiKey: "server-key-fixture",
    apiUrl: "https://api.minepi.com/v2/",
    fetcher: async (url, init) => {
      requestUrl = String(url);
      requestInit = init;
      return jsonResponse({
        success: true,
        delivered_notifications: [{ user_uid: "pi-recipient" }],
      }, 201);
    },
  });

  assert.equal(requestUrl, "https://api.minepi.com/v2/in_app_notifications/notify");
  assert.equal((requestInit?.headers as Record<string, string>).Authorization, "Key server-key-fixture");
  assert.deepEqual(JSON.parse(String(requestInit?.body)), {
    notifications: [{
      title: "Order update",
      body: "Your order is ready.",
      user_uid: "pi-recipient",
      subroute: "/orders/123",
    }],
  });
  assert.deepEqual(result, { configured: true, delivered: true });
});

test("Pi notification route rejects external subroutes and reports partial delivery", async () => {
  let payload: any;
  const result = await sendPiInAppNotification({
    userId: "pi-recipient",
    title: "Update",
    body: "Body",
    subroute: "//attacker.example",
  }, {
    apiKey: "server-key-fixture",
    fetcher: async (_url, init) => {
      payload = JSON.parse(String(init?.body));
      return jsonResponse({ success: true, delivered_notifications: [] }, 201);
    },
  });

  assert.equal(payload.notifications[0].subroute, "/notifications");
  assert.deepEqual(result, { configured: true, delivered: false });
});

test("Pi notification sender skips requests without an API key", async () => {
  let requestMade = false;
  const result = await sendPiInAppNotification({
    userId: "pi-recipient",
    title: "Update",
    body: "Body",
    subroute: "/notifications",
  }, {
    apiKey: "",
    fetcher: async () => {
      requestMade = true;
      return jsonResponse({});
    },
  });

  assert.deepEqual(result, { configured: false, delivered: false });
  assert.equal(requestMade, false);
});

test("Pi consent requires matching identity, an unexpired token and the notification scope", async () => {
  const makeFetcher = (user: unknown) => async () => jsonResponse(user);
  const granted = {
    uid: "pi-recipient",
    credentials: {
      scopes: ["username", "in_app_notifications"],
      valid_until: { timestamp: Math.floor(Date.now() / 1000) + 60 },
    },
  };
  assert.equal(await verifyPiInAppNotificationScope("token", "pi-recipient", {
    apiUrl: "https://api.minepi.com",
    fetcher: makeFetcher(granted),
  }), true);
  assert.equal(await verifyPiInAppNotificationScope("token", "other-user", {
    fetcher: makeFetcher(granted),
  }), false);
  assert.equal(await verifyPiInAppNotificationScope("token", "pi-recipient", {
    fetcher: makeFetcher({ ...granted, credentials: { scopes: ["username"] } }),
  }), false);
  assert.equal(await verifyPiInAppNotificationScope("token", "pi-recipient", {
    fetcher: makeFetcher({
      ...granted,
      credentials: { scopes: ["in_app_notifications"], valid_until: { timestamp: 1 } },
    }),
  }), false);
  assert.equal(await verifyPiInAppNotificationScope("tampered", "pi-recipient", {
    fetcher: async () => jsonResponse({ error: "unauthorized" }, 401),
  }), false);
});

test("Pi API failures remain observable to the caller", async () => {
  await assert.rejects(
    sendPiInAppNotification({
      userId: "pi-recipient",
      title: "Update",
      body: "Body",
      subroute: "/notifications",
    }, {
      apiKey: "server-key-fixture",
      fetcher: async () => jsonResponse({ error: "quota" }, 403),
    }),
    (error: unknown) => (error as { status?: number }).status === 403,
  );
});

test("shared notification creation forwards opted-in events and respects user consent", async () => {
  const recipient = { uid: "pi-recipient", piInAppNotificationsEnabled: true };
  const notifications: any[] = [];
  const piDeliveries: any[] = [];
  const app = {
    locals: {
      userCollection: {
        async findOne(query: any) {
          return query.uid === recipient.uid ? recipient : null;
        },
      },
      notificationCollection: {
        async insertOne(document: any) {
          notifications.push(document);
          return { insertedId: new ObjectId() };
        },
        async countDocuments() { return notifications.length; },
      },
      piInAppNotificationSender: async (notification: any) => {
        piDeliveries.push(notification);
        return { configured: true, delivered: true };
      },
    },
  };

  await createNotification(app, {
    userId: recipient.uid,
    type: "jobs_application_update",
    title: "Application update",
    message: "Your application was reviewed.",
    relatedId: "job-123",
    actionUrl: "/jobs/job-123",
  });
  assert.equal(notifications.length, 1);
  assert.deepEqual(piDeliveries, [{
    userId: "pi-recipient",
    title: "Application update",
    body: "Your application was reviewed.",
    subroute: "/jobs/job-123",
  }]);

  recipient.piInAppNotificationsEnabled = false;
  await createNotification(app, {
    userId: recipient.uid,
    type: "community_reply",
    title: "New reply",
    message: "Someone replied to your post.",
  });
  assert.equal(notifications.length, 2);
  assert.equal(piDeliveries.length, 1);
});

test("notification center consent routes require a user session and allow revocation", async () => {
  const user = { _id: new ObjectId(), uid: "pi-session-user", piInAppNotificationsEnabled: true };
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    Object.defineProperty(req, "session", {
      configurable: true,
      value: { user: { userId: String(user._id), piUsername: user.uid, role: "buyer" } },
    });
    next();
  });
  app.locals.userCollection = {
    async findOne(query: any) {
      if (query._id) return String(query._id) === String(user._id) ? user : null;
      return query.uid === user.uid ? user : null;
    },
    find(query: any) {
      return {
        limit() { return this; },
        async toArray() { return query.uid === user.uid ? [user] : []; },
      };
    },
    async updateOne(query: any, update: any) {
      if (query.uid !== user.uid) return { matchedCount: 0 };
      Object.assign(user, update.$set);
      return { matchedCount: 1 };
    },
  };
  app.locals.piIdentityLinkCollection = { async findOne() { return null; } };
  const router = express.Router();
  mountNotificationEndpoints(router);
  app.use("/notifications", router);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));

  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const status = await fetch(`http://127.0.0.1:${address.port}/notifications/pi/status`);
    assert.equal(status.status, 200);
    assert.equal((await status.json() as { enabled: boolean }).enabled, true);

    const revoked = await fetch(`http://127.0.0.1:${address.port}/notifications/pi/consent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: false }),
    });
    assert.equal(revoked.status, 200);
    assert.equal((await revoked.json() as { enabled: boolean }).enabled, false);
    assert.equal(user.piInAppNotificationsEnabled, false);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
