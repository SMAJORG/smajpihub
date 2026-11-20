import type { Response } from "express";

type NotificationEvent = {
  notification?: Record<string, unknown>;
  unreadCount: number;
};

const streams = new Map<string, Set<Response>>();

export const subscribeToUserNotifications = (userId: string, response: Response) => {
  const subscribers = streams.get(userId) || new Set<Response>();
  subscribers.add(response);
  streams.set(userId, subscribers);
  return () => {
    subscribers.delete(response);
    if (!subscribers.size) streams.delete(userId);
  };
};

export const publishUserNotification = (userId: string, event: NotificationEvent) => {
  const subscribers = streams.get(userId);
  if (!subscribers) return;
  const payload = `event: notification\ndata: ${JSON.stringify(event)}\n\n`;
  for (const response of subscribers) {
    if (response.destroyed || response.writableEnded) {
      subscribers.delete(response);
      continue;
    }
    response.write(payload);
  }
  if (!subscribers.size) streams.delete(userId);
};

export const publishUserNotificationState = (userId: string, unreadCount: number) => {
  publishUserNotification(userId, { unreadCount });
};
