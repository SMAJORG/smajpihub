import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Network } from "@capacitor/network";
import { PushNotifications } from "@capacitor/push-notifications";
import { LocalNotifications } from "@capacitor/local-notifications";
import { StatusBar, Style } from "@capacitor/status-bar";
import { enableNativePushNotifications, ensureNativePushNotificationsEnabled } from "../lib/nativePushNotifications";
import { runPostHomePermissionOnboarding } from "../lib/nativePermissionOnboarding";
import "./NativeRuntimeBridge.css";

const notificationErrorMessage = (error: unknown) =>
  error instanceof Error && error.message
    ? error.message
    : "Notifications could not be enabled. Check the app notification permission and try again.";

const NativeRuntimeBridge = () => {
  const [notificationIssue, setNotificationIssue] = useState("");
  const [requestingNotifications, setRequestingNotifications] = useState(false);

  const retryNotifications = async () => {
    setRequestingNotifications(true);
    setNotificationIssue("");
    try {
      await enableNativePushNotifications();
    } catch (error) {
      setNotificationIssue(notificationErrorMessage(error));
    } finally {
      setRequestingNotifications(false);
    }
  };

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    document.documentElement.dataset.nativeApp = Capacitor.getPlatform();
    void StatusBar.setOverlaysWebView({ overlay: true }).catch(() => undefined);
    void StatusBar.setBackgroundColor({ color: "#00000000" }).catch(() => undefined);
    void StatusBar.setStyle({ style: Style.Dark }).catch(() => undefined);
    let active = true;
    const cleanups: Array<() => Promise<void>> = [];

    const updateNetwork = (connected: boolean, connectionType: string) => {
      if (!active) return;
      document.documentElement.classList.toggle("smaj-offline", !connected);
      window.dispatchEvent(new CustomEvent("smaj:native-network", {
        detail: { connected, connectionType },
      }));
    };

    void Network.getStatus().then(status => updateNetwork(status.connected, status.connectionType));
    void PushNotifications.createChannel({ id: "smaj_notifications", name: "SMAJ Notifications", description: "Messages, orders, jobs, courses and account alerts", importance: 5, visibility: 1, vibration: true }).catch(() => undefined);
    // Wait for the authenticated Home dashboard to be visible before asking for
    // Android permissions. Firebase registration follows the native dialogs.
    void runPostHomePermissionOnboarding().then(({ reachedHome, notificationGranted }) => {
      if (!active || !reachedHome || !notificationGranted) return;
      void ensureNativePushNotificationsEnabled().catch(error => {
        if (active) setNotificationIssue(notificationErrorMessage(error));
      });
    });
    void Network.addListener("networkStatusChange", status =>
      updateNetwork(status.connected, status.connectionType)
    ).then(handle => cleanups.push(() => handle.remove()));

    void PushNotifications.addListener("pushNotificationReceived", notification => {
      window.dispatchEvent(new CustomEvent("smaj:native-push", { detail: notification }));
      void LocalNotifications.schedule({
        notifications: [{
          id: Math.max(1, Math.floor(Date.now() % 2_147_483_647)),
          title: notification.title || "SMAJ PI HUB",
          body: notification.body || "You have a new notification.",
          channelId: "smaj_notifications",
          extra: notification.data || {},
        }],
      }).catch(() => undefined);
    }).then(handle => cleanups.push(() => handle.remove()));

    void LocalNotifications.addListener("localNotificationActionPerformed", ({ notification }) => {
      const path = String(notification.extra?.path || notification.extra?.url || "");
      if (path.startsWith("/") && !path.startsWith("//")) {
        window.history.pushState(window.history.state, "", path);
        window.dispatchEvent(new PopStateEvent("popstate", { state: window.history.state }));
      }
    }).then(handle => cleanups.push(() => handle.remove()));
    void PushNotifications.addListener("pushNotificationActionPerformed", ({ notification }) => {
      const path = String(notification.data?.path || notification.data?.url || "");
      if (path.startsWith("/") && !path.startsWith("//")) {
        window.history.pushState(window.history.state, "", path);
        window.dispatchEvent(new PopStateEvent("popstate", { state: window.history.state }));
      }
    }).then(handle => cleanups.push(() => handle.remove()));

    return () => {
      active = false;
      delete document.documentElement.dataset.nativeApp;
      void Promise.all(cleanups.map(cleanup => cleanup()));
    };
  }, []);

  if (!notificationIssue) return null;

  return (
    <aside className="native-notification-permission" role="alertdialog" aria-modal="true" aria-labelledby="native-notification-title">
      <div>
        <span aria-hidden="true">🔔</span>
        <h2 id="native-notification-title">Turn on notifications</h2>
        <p>{notificationIssue}</p>
        <small>Get new messages, orders, job updates and SMAJ alerts on this phone.</small>
        <div>
          <button type="button" onClick={() => void retryNotifications()} disabled={requestingNotifications}>
            {requestingNotifications ? "Checking…" : "Try again"}
          </button>
          <button type="button" className="secondary" onClick={() => setNotificationIssue("")} disabled={requestingNotifications}>Later</button>
        </div>
      </div>
    </aside>
  );
};

export default NativeRuntimeBridge;
