import { axiosClient } from "./axiosClient";
import type { ChatMessage } from "../types/marketplace";

export const CHAT_MEDIA_LIMIT = 25 * 1024 * 1024;
type Entry = {
  id: string;
  owner: string;
  blob: Blob;
  size: number;
  accessed: number;
};
// Keep recently viewed photos ready across conversation navigation.
const photoUrls = new Map<
  string,
  { url: string; size: number; users: number; accessed: number }
>();
const mediaKey = (owner: string, message: ChatMessage) =>
  owner + ":" + message.conversationId + ":" + message._id;
export function cachedPhotoUrl(owner: string, message: ChatMessage) {
  return photoUrls.get(mediaKey(owner, message))?.url || "";
}
export function retainPhotoUrl(
  owner: string,
  message: ChatMessage,
  blob?: Blob,
) {
  const key = mediaKey(owner, message);
  let entry = photoUrls.get(key);
  if (!entry && blob) {
    entry = {
      url: URL.createObjectURL(blob),
      size: blob.size,
      users: 0,
      accessed: Date.now(),
    };
    photoUrls.set(key, entry);
  }
  if (!entry) return null;
  entry.users++;
  entry.accessed = Date.now();
  const held = entry;
  const trim = () => {
    let total = [...photoUrls.values()].reduce(
      (sum, item) => sum + item.size,
      0,
    );
    for (const [id, item] of [...photoUrls.entries()].sort(
      (a, b) => a[1].accessed - b[1].accessed,
    )) {
      if (total <= CHAT_MEDIA_LIMIT) break;
      if (item.users) continue;
      URL.revokeObjectURL(item.url);
      photoUrls.delete(id);
      total -= item.size;
    }
  };
  trim();
  let released = false;
  return {
    url: held.url,
    release: () => {
      if (released) return;
      released = true;
      held.users--;
      trim();
    },
  };
}
const photoSizes = new Map<string, number>();
export function photoRatio(
  owner: string,
  message: ChatMessage,
  ratio?: number,
) {
  const key = mediaKey(owner, message);
  if (ratio && Number.isFinite(ratio))
    photoSizes.set(key, Math.max(0.65, Math.min(2, ratio)));
  return photoSizes.get(key) || 4 / 3;
}
const openMedia = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("smaj-chat-media", 1);
    request.onupgradeneeded = () =>
      request.result
        .createObjectStore("media", { keyPath: "id" })
        .createIndex("owner", "owner");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
export function mediaEvictions(
  entries: Pick<Entry, "id" | "size" | "accessed">[],
  limit = CHAT_MEDIA_LIMIT,
) {
  let total = entries.reduce((sum, item) => sum + item.size, 0);
  const remove: string[] = [];
  for (const item of [...entries].sort((a, b) => a.accessed - b.accessed)) {
    if (total <= limit) break;
    total -= item.size;
    remove.push(item.id);
  }
  return remove;
}
async function cachedMedia(owner: string, id: string): Promise<Blob | null> {
  const db = await openMedia();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("media", "readwrite");
    const store = tx.objectStore("media");
    const request = store.get(id);
    let blob: Blob | null = null;
    request.onsuccess = () => {
      const entry = request.result as Entry | undefined;
      if (entry?.owner === owner) {
        blob = entry.blob;
        store.put({ ...entry, accessed: Date.now() });
      }
    };
    tx.oncomplete = () => {
      db.close();
      resolve(blob);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
    tx.onabort = () => {
      db.close();
      reject(tx.error);
    };
  });
}
async function storeMedia(entry: Entry) {
  if (entry.size > CHAT_MEDIA_LIMIT) return;
  const db = await openMedia();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("media", "readwrite");
    const store = tx.objectStore("media");
    store.put(entry);
    const request = store.index("owner").getAll(entry.owner);
    request.onsuccess = () =>
      mediaEvictions(request.result).forEach((id) => store.delete(id));
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
    tx.onabort = () => {
      db.close();
      reject(tx.error);
    };
  });
}
export async function getMessageBlob(
  owner: string,
  message: ChatMessage,
  signal?: AbortSignal,
): Promise<Blob> {
  if (!owner) throw new Error("Sign in to download this file.");
  const id = `${owner}:${message.conversationId}:${message._id}`;
  const saved = await cachedMedia(owner, id).catch(() => null);
  if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
  if (saved) return saved;
  const inline = message.audioDataUrl || message.attachmentDataUrl;
  let blob: Blob;
  if (inline)
    blob = await fetch(inline, { signal }).then((response) => response.blob());
  else {
    if (!navigator.onLine)
      throw new Error(
        "This file is not saved on this device. Connect to download it.",
      );
    const response = await axiosClient.get<Blob>(
      `/messages/${message.conversationId}/messages/${message._id}/media`,
      {
        responseType: "blob",
        signal,
        timeout: 15000,
        headers: { "X-SMAJ-Chat-Owner": owner, "X-SMAJ-Silent": "true" },
      },
    );
    blob = response.data;
  }
  if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
  await storeMedia({
    id,
    owner,
    blob,
    size: blob.size,
    accessed: Date.now(),
  }).catch(() => undefined);
  return blob;
}

export function formatAudioTime(value: number) {
  const seconds = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
export async function audioWaveform(blob: Blob): Promise<number[] | null> {
  if (typeof AudioContext === "undefined") return null;
  const context = new AudioContext();
  try {
    const audio = await context.decodeAudioData(await blob.arrayBuffer());
    const samples = audio.getChannelData(0);
    const bars = Array.from({ length: 32 }, (_, i) => {
      const start = Math.floor((i * samples.length) / 32),
        end = Math.floor(((i + 1) * samples.length) / 32);
      let peak = 0;
      for (let j = start; j < end; j++)
        peak = Math.max(peak, Math.abs(samples[j]));
      return peak;
    });
    const max = Math.max(...bars, 0.001);
    return bars.map((value) => value / max);
  } catch {
    return null;
  } finally {
    await context.close().catch(() => undefined);
  }
}
