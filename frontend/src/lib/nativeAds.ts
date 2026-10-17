import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import { useSyncExternalStore } from "react";
export type AdConsent = { allowed: boolean; canRequestAds: boolean; privacyRequired: boolean };
interface AdsBridge {
  status(): Promise<AdConsent>;
  refresh(): Promise<AdConsent>;
  consent(options: { allowed: boolean }): Promise<AdConsent>;
  privacy(): Promise<AdConsent>;
  show(options: { format: "banner" | "native"; width: number }): Promise<{ height?: number }>;
  position(options: {
    visible: boolean;
    viewportWidth: number;
    left: number;
    top: number;
    width: number;
    height: number;
  }): Promise<void>;
  addListener(event: "unavailable", listener: () => void): Promise<PluginListenerHandle>;
  hide(): Promise<void>;
  reward(): Promise<{ earned: boolean }>;
}
export const supportsAds = () =>
  Capacitor.isNativePlatform() &&
  Capacitor.getPlatform() === "android" &&
  !/PiBrowser|Pi Browser/i.test(navigator.userAgent);
export const nativeAds = registerPlugin<AdsBridge>("SmajAds");
let consent: AdConsent = { allowed: false, canRequestAds: false, privacyRequired: false };
const listeners = new Set<() => void>();
let obscured = false;
export const updateAdsObscured = (value: boolean) => {
  obscured = value;
  listeners.forEach(fn => fn());
};
export const useAdsObscured = () =>
  useSyncExternalStore(
    fn => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    () => obscured
  );
export const updateAdConsent = (value: AdConsent) => {
  consent = value;
  listeners.forEach(fn => fn());
};
export const useAdConsent = () =>
  useSyncExternalStore(
    fn => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    () => consent
  );
