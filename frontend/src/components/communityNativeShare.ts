import { Capacitor } from "@capacitor/core";
import { Share } from "@capacitor/share";

export type CommunitySharePayload = {
  title: string;
  text: string;
  url: string;
};

export type CommunityNativeShareResult = "shared" | "cancelled" | "fallback" | "failed";

export const communityPostUrl = (postId: string) => {
  if (!postId.trim()) return "";
  const origin = /^https?:$/.test(window.location.protocol) ? window.location.origin : "https://smajpihub.com";
  const url = new URL("/community/feed", origin);
  url.searchParams.set("post", postId);
  return url.toString();
};

const isCancelled = (reason: unknown) =>
  (reason instanceof DOMException && reason.name === "AbortError")
  || (reason instanceof Error && /cancel|dismiss/i.test(reason.message));

export const openCommunityNativeShare = async (
  payload: CommunitySharePayload,
): Promise<CommunityNativeShareResult> => {
  try {
    const url = new URL(payload.url);
    if (!["http:", "https:"].includes(url.protocol) || !url.hostname || url.username || url.password) return "failed";
  } catch {
    return "failed";
  }

  try {
    if (typeof navigator.share === "function") {
      await navigator.share(payload);
      return "shared";
    }
  } catch (reason) {
    if (isCancelled(reason)) return "cancelled";
    if (Capacitor.isNativePlatform()) {
      try {
        await Share.share(payload);
        return "shared";
      } catch (nativeReason) {
        return isCancelled(nativeReason) ? "cancelled" : "fallback";
      }
    }
    return "fallback";
  }

  if (!Capacitor.isNativePlatform()) return "fallback";
  try {
    await Share.share(payload);
    return "shared";
  } catch (reason) {
    return isCancelled(reason) ? "cancelled" : "fallback";
  }
};
