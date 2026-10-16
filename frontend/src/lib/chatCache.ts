import type { ChatMessage } from "../types/marketplace";
const prefix = "smaj-chat-v2:";
export function readChatCache<T>(uid: string | undefined, key: string, fallback: T): T {
  if (!uid) return fallback;
  try { return JSON.parse(localStorage.getItem(prefix + uid + ":" + key) || "null") ?? fallback; } catch { return fallback; }
}
export function writeChatCache(uid: string | undefined, key: string, value: unknown) {
  if (!uid) return false;
  const storageKey = prefix + uid + ":" + key;
  // Confirmed history stores metadata; binary downloads live in the media cache.
  if (Array.isArray(value) && key !== "outbox") value = value.map(item => {
    if (!item?.conversationId || item.deliveryState) return item;
    const { audioDataUrl, attachmentDataUrl, ...metadata } = item;
    return { ...metadata, ...(audioDataUrl || attachmentDataUrl ? { mediaAvailable: true } : {}) };
  });
  try { localStorage.setItem(storageKey, JSON.stringify(value)); return true; }
  catch {
    // Give unsent messages priority over replaceable history when storage is full.
    if (key === "outbox") {
      try {
        const removable: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const entry = localStorage.key(i);
          if (entry?.startsWith(prefix + uid + ":") && entry !== storageKey && !entry.includes(":draft-text:")) removable.push(entry);
        }
        removable.forEach(entry => localStorage.removeItem(entry));
        localStorage.setItem(storageKey, JSON.stringify(value));
        return true;
      } catch { /* Disabled storage still permits live chat. */ }
    }
    return false;
  }
}
export function mergeChatMessages(previous: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const confirmed = new Set(incoming.map(item => item.clientMessageId).filter(Boolean));
  const items = new Map(previous.filter(item => !item.clientMessageId || !confirmed.has(item.clientMessageId)).map(item => [item._id, item]));
  incoming.forEach(item => items.set(item._id, item));
  return [...items.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a._id.localeCompare(b._id));
}
export function chatLink(recipient: { uid: string; displayName?: string; avatar?: string }, product?: { _id: string; title?: string; image?: string }) {
  const query = new URLSearchParams({ recipient: recipient.uid, name: recipient.displayName || "SMAJ user" });
  if (recipient.avatar) query.set("avatar", recipient.avatar);
  if (product) { query.set("product", product._id); query.set("title", product.title || ""); query.set("image", product.image || ""); }
  return "/messages?" + query;
}

export function savedChatHistory(uid: string | undefined, id: string, memory: Map<string, ChatMessage[]>) {
  const saved = memory.get(id) ?? readChatCache<ChatMessage[] | null>(uid, id, null);
  if (saved) memory.set(id, saved);
  return saved;
}
