import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { Clipboard } from "@capacitor/clipboard";
import { Device } from "@capacitor/device";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { Geolocation } from "@capacitor/geolocation";
import { LocalNotifications } from "@capacitor/local-notifications";
import { Network } from "@capacitor/network";
import { PushNotifications } from "@capacitor/push-notifications";
import { Share } from "@capacitor/share";
import { Capacitor } from "@capacitor/core";

export const isNativeAndroid = () => Capacitor.getPlatform() === "android";

export const chooseNativeImage = async (source: "camera" | "gallery" | "prompt" = "prompt") => {
  const sourceMap = { camera: CameraSource.Camera, gallery: CameraSource.Photos, prompt: CameraSource.Prompt };
  const photo = await Camera.getPhoto({
    source: sourceMap[source],
    resultType: CameraResultType.Uri,
    quality: 85,
    correctOrientation: true,
  });
  return { uri: photo.webPath || photo.path || "", format: photo.format, saved: photo.saved };
};

export const chooseNativeFiles = (accept = "*/*", multiple = false) =>
  new Promise<File[]>((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.multiple = multiple;
    input.onchange = () => resolve(Array.from(input.files || []));
    input.oncancel = () => resolve([]);
    input.click();
  });

export const saveNativeFile = async (path: string, data: string) => {
  if (!Capacitor.isNativePlatform()) {
    const anchor = document.createElement("a");
    anchor.href = data;
    anchor.download = path.split("/").pop() || "download";
    anchor.click();
    return { uri: data };
  }
  return Filesystem.writeFile({ path, data, directory: Directory.Documents, recursive: true });
};

export const getNativeLocation = async () => {
  if (!Capacitor.isNativePlatform()) {
    return new Promise<GeolocationPosition>((resolve, reject) =>
      navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15000 })
    );
  }
  const permission = await Geolocation.requestPermissions();
  if (permission.location !== "granted" && permission.coarseLocation !== "granted") {
    throw new Error("Location permission was not granted.");
  }
  return Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 15000 });
};

export const shareNative = async (options: { title?: string; text?: string; url?: string; dialogTitle?: string }) => {
  if (Capacitor.isNativePlatform()) return Share.share(options);
  if (navigator.share) return navigator.share({ title: options.title, text: options.text, url: options.url });
  if (options.url) await navigator.clipboard.writeText(options.url);
  return { activityType: undefined };
};

export const writeNativeClipboard = async (value: string) => {
  if (Capacitor.isNativePlatform()) return Clipboard.write({ string: value });
  return navigator.clipboard.writeText(value);
};

export const readNativeClipboard = async () => {
  if (Capacitor.isNativePlatform()) return (await Clipboard.read()).value;
  return navigator.clipboard.readText();
};

export const getNativeNetworkStatus = () => Network.getStatus();

export const getNativeDeviceInfo = async () => {
  const [info, id, language] = await Promise.all([Device.getInfo(), Device.getId(), Device.getLanguageCode()]);
  return { ...info, identifier: id.identifier, languageCode: language.value };
};

export const scheduleNativeReminder = async (options: { id: number; title: string; body: string; at: Date; extra?: Record<string, unknown> }) => {
  const permission = await LocalNotifications.requestPermissions();
  if (permission.display !== "granted") throw new Error("Notification permission was not granted.");
  return LocalNotifications.schedule({
    notifications: [{
      id: options.id,
      title: options.title,
      body: options.body,
      schedule: { at: options.at },
      smallIcon: "ic_stat_smaj",
      largeIcon: "smaj_notification_logo",
      iconColor: "#08768b",
      extra: options.extra,
    }],
  });
};

export const requestNativePushRegistration = async () => {
  if (!Capacitor.isNativePlatform()) throw new Error("Native push registration requires the Android app.");
  const permission = await PushNotifications.requestPermissions();
  if (permission.receive !== "granted") {
    throw new Error("Notifications are off. Open Phone Settings > Apps > SMAJ PI HUB > Notifications and allow them.");
  }

  let resolveToken!: (token: string) => void;
  let rejectToken!: (error: Error) => void;
  const tokenPromise = new Promise<string>((resolve, reject) => {
    resolveToken = resolve;
    rejectToken = reject;
  });
  let settled = false;
  const handles: Array<{ remove: () => Promise<void> }> = [];
  const finish = (callback: () => void) => {
    if (settled) return;
    settled = true;
    window.clearTimeout(timeout);
    void Promise.all(handles.map((handle) => handle.remove()));
    callback();
  };
  const timeout = window.setTimeout(() => {
    finish(() => rejectToken(new Error("Firebase registration timed out. Check your internet connection and try again.")));
  }, 20000);

  const [registrationHandle, errorHandle] = await Promise.all([
    PushNotifications.addListener("registration", ({ value }) => finish(() => resolveToken(value))),
    PushNotifications.addListener("registrationError", (error) =>
      finish(() => rejectToken(new Error(error.error || "Android push registration failed.")))
    ),
  ]);
  handles.push(registrationHandle, errorHandle);

  try {
    await PushNotifications.register();
  } catch (error) {
    finish(() => rejectToken(error instanceof Error ? error : new Error("Android push registration failed.")));
  }

  return tokenPromise;
};