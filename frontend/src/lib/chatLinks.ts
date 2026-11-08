import { Capacitor } from "@capacitor/core";

export type ChatLinkPart = { text: string; href?: string };
const urls = /https?:\/\/[^\s<>"'`\\\u0000-\u001f\u007f]+/gi;

export function safeChatUrl(value: string): string | null {
  if (/[\u0000-\u0020\u007f\u202a-\u202e\u2066-\u2069]/.test(value)) return null;
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || !url.hostname || url.username || url.password) return null;
    return url.href;
  } catch { return null; }
}

export function chatLinkParts(message: string): ChatLinkPart[] {
  const parts: ChatLinkPart[] = [];
  let position = 0;
  for (const match of message.matchAll(urls)) {
    const index = match.index!;
    const before = message.slice(0, index);
    // Do not turn a substring of an unsafe scheme or another word into a link.
    if (/[\p{L}\p{N}_]$/u.test(before) || /(?:javascript|data|vbscript|file|blob):/i.test(before.match(/\S+$/)?.[0] || "")) continue;
    let text = match[0];
    while (text) {
      if (/[.,!?;:]$/.test(text)) { text = text.slice(0, -1); continue; }
      const pair = ({ ")": "(", "]": "[", "}": "{" } as Record<string, string>)[text.at(-1)!];
      if (pair && text.split(text.at(-1)!).length > text.split(pair).length) { text = text.slice(0, -1); continue; }
      break;
    }
    const href = safeChatUrl(text);
    if (!href) continue;
    if (index > position) parts.push({ text: message.slice(position, index) });
    parts.push({ text, href });
    position = index + text.length;
  }
  if (position < message.length) parts.push({ text: message.slice(position) });
  return parts;
}

// Undefined preserves normal anchor navigation, including browser modifier keys.
export function openChatUrl(value: string): Promise<void> | undefined {
  const url = safeChatUrl(value);
  if (!url) return undefined;
  if (Capacitor.isNativePlatform()) return import("@capacitor/browser").then(({ Browser }) => Browser.open({ url }));
  const sdk = window.Pi as unknown as { openUrlInSystemBrowser?: (url: string) => Promise<void> } | undefined;
  if (/PiBrowser/i.test(navigator.userAgent) && typeof sdk?.openUrlInSystemBrowser === "function") {
    try { return Promise.resolve(sdk.openUrlInSystemBrowser(url)); }
    catch (error) { return Promise.reject(error); }
  }
  return undefined;
}
