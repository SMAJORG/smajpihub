import { Camera } from "@capacitor/camera";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";
import { Preferences } from "@capacitor/preferences";
import { PushNotifications } from "@capacitor/push-notifications";

const COMPLETED_KEY = "smaj_native_permissions_onboarding_v1";

interface SmajPermissionsPlugin {
  requestMicrophone(): Promise<{ state: string }>;
  requestMedia(): Promise<{ state: string }>;
}

const SmajPermissions = registerPlugin<SmajPermissionsPlugin>("SmajPermissions");

const pause = (milliseconds: number) =>
  new Promise<void>(resolve => window.setTimeout(resolve, milliseconds));

const waitForHome = async () => {
  for (let attempt = 0; attempt < 240; attempt += 1) {
    if (
      window.location.pathname === "/dashboard" &&
      document.querySelector(".private-home")
    ) {
      await pause(1200);
      return true;
    }
    await pause(250);
  }
  return false;
};

const requestWithoutBlockingNext = async (request: () => Promise<unknown>) => {
  try {
    await request();
  } catch (error) {
    console.warn("Native permission request was not completed", error);
  }
  await pause(350);
};

export const runPostHomePermissionOnboarding = async () => {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") {
    return { reachedHome: false, firstRun: false, notificationGranted: false };
  }

  const reachedHome = await waitForHome();
  if (!reachedHome) return { reachedHome: false, firstRun: false, notificationGranted: false };

  const { value } = await Preferences.get({ key: COMPLETED_KEY });
  if (value === "complete") {
    const notification = await PushNotifications.checkPermissions();
    return { reachedHome: true, firstRun: false, notificationGranted: notification.receive === "granted" };
  }

  // Android owns the appearance and wording of these dialogs. Requests are
  // intentionally sequential and begin only after the Home UI is visible.
  let notificationGranted = false;
  await requestWithoutBlockingNext(async () => {
    const notification = await PushNotifications.requestPermissions();
    notificationGranted = notification.receive === "granted";
  });
  await requestWithoutBlockingNext(() => Geolocation.requestPermissions());
  await requestWithoutBlockingNext(() => Camera.requestPermissions({ permissions: ["camera"] }));
  await requestWithoutBlockingNext(() => SmajPermissions.requestMicrophone());
  await requestWithoutBlockingNext(() => SmajPermissions.requestMedia());

  await Preferences.set({ key: COMPLETED_KEY, value: "complete" });
  return { reachedHome: true, firstRun: true, notificationGranted };
};