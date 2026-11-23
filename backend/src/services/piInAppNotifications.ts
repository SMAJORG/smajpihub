import env from "../environments";

const apiRoot = (value: string) => value.trim().replace(/\/+$/, "").replace(/\/v2$/i, "");

type PiUser = {
  uid?: string;
  credentials?: {
    scopes?: string[];
    valid_until?: { timestamp?: number };
  };
};

export type PiInAppNotification = {
  userId: string;
  title: string;
  body: string;
  subroute: string;
};

type PiApiOptions = {
  apiKey?: string;
  apiUrl?: string;
  fetcher?: typeof fetch;
};

const requestTimeout = () => AbortSignal.timeout(8_000);

export const piInAppNotificationsConfigured = () => Boolean(env.pi_api_key);

export const verifyPiInAppNotificationScope = async (
  accessToken: string,
  expectedUid: string,
  options: Pick<PiApiOptions, "apiUrl" | "fetcher"> = {},
) => {
  const fetcher = options.fetcher || fetch;
  const response = await fetcher(`${apiRoot(options.apiUrl || env.platform_api_url)}/v2/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: requestTimeout(),
  });
  if (response.status === 401) return false;
  if (!response.ok) {
    throw Object.assign(new Error("Pi identity verification failed"), { status: response.status });
  }

  const user = await response.json() as PiUser;
  const validUntil = Number(user.credentials?.valid_until?.timestamp || 0);
  return user.uid === expectedUid
    && (validUntil === 0 || validUntil * 1000 > Date.now())
    && Array.isArray(user.credentials?.scopes)
    && user.credentials.scopes.includes("in_app_notifications");
};

export const sendPiInAppNotification = async (
  notification: PiInAppNotification,
  options: PiApiOptions = {},
) => {
  const apiKey = options.apiKey ?? env.pi_api_key;
  if (!apiKey) return { configured: false, delivered: false };

  const fetcher = options.fetcher || fetch;
  const response = await fetcher(
    `${apiRoot(options.apiUrl || env.platform_api_url)}/v2/in_app_notifications/notify`,
    {
      method: "POST",
      headers: {
        Authorization: `Key ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        notifications: [{
          title: notification.title,
          body: notification.body,
          user_uid: notification.userId,
          subroute: notification.subroute.startsWith("/") && !notification.subroute.startsWith("//")
            ? notification.subroute
            : "/notifications",
        }],
      }),
      signal: requestTimeout(),
    },
  );

  if (!response.ok) {
    throw Object.assign(new Error("Pi in-app notification request failed"), { status: response.status });
  }
  const result = await response.json() as {
    success?: boolean;
    delivered_notifications?: Array<{ user_uid?: string }>;
  };
  return {
    configured: true,
    delivered: result.success === true
      && result.delivered_notifications?.some(item => item.user_uid === notification.userId) === true,
  };
};
