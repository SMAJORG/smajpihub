import { Capacitor } from "@capacitor/core";
import { Share } from "@capacitor/share";

export type CommunitySharePayload = {
  title: string;
  text: string;
  url: string;
};

export type CommunityNativeShareResult = "shared" | "cancelled" | "fallback" | "failed";

export const openCommunityNativeShare = async (
  payload: CommunitySharePayload,
): Promise<CommunityNativeShareResult> => {
  try {
    if (typeof navigator.share === "function") {
      await navigator.share(payload);
      return "shared";
    }
    if (!Capacitor.isNativePlatform()) return "fallback";
    await Share.share(payload);
    return "shared";
  } catch (reason) {
    if ((reason instanceof DOMException && reason.name === "AbortError")
      || (reason instanceof Error && /cancel|dismiss/i.test(reason.message))) return "cancelled";
    if (Capacitor.isNativePlatform()) return "fallback";
    if (reason instanceof TypeError || (reason instanceof DOMException && ["NotAllowedError", "NotSupportedError"].includes(reason.name))) {
      return "fallback";
    }
    return "failed";
  }
};
