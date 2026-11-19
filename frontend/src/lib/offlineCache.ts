const DB_NAME = "smaj-mainnet-offline";
const STORE_NAME = "responses";
const VERSION = 1;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export const API_CACHE_FRESH_MS = 30_000;
export const API_CACHE_MAX_SWR_MS = 5 * 60_000;

export type CachedResponse<T = unknown> = {
  data: T;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  cachedAt: number;
};

const memoryResponses = new Map<string, CachedResponse>();
const namespaceGenerations = new Map<string, number>();
const pendingWrites = new Map<string, Set<Promise<void>>>();

const openDatabase = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const requestResult = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

export const isCacheableApiRead = (url = "") => {
  const path = url
    .replace(/^https?:\/\/[^/]+/i, "")
    .split("?")[0]
    .toLowerCase();
  if (
    /(^|\/)(admin|applications|appointments|billing|bookings|cart|checkout|order-tracking|orders|payment|payments|payout|settlements|transactions|viewings|wallet)(?:\/|$)/.test(
      path
    )
  )
    return false;
  if (/^\/jobs\/(profile|applications|activity|employer|admin)(?:\/|$)/.test(path)) return false;
  if (path === "/marketplace/seller/settlements" || path === "/marketplace/seller/dashboard") return false;
  const marketplaceRead = /^\/marketplace\/(feed|products|saved|seller(?:s)?)(?:\/|$)/.test(path);
  const jobsRead = path.startsWith("/jobs/") && !/^\/jobs\/(billing|earnings|employer\/payments)(?:\/|$)/.test(path);
  return (
    marketplaceRead ||
    jobsRead ||
    path === "/sports/bootstrap" ||
    [
      "/products",
      "/services",
      "/courses",
      "/education",
      "/my-learning",
      "/my-certificates",
      "/notifications",
      "/profile",
      "/user/profile",
      "/user/stats",
      "/health",
      "/food-delivery",
      "/housing",
    ].some(prefix => path === prefix || path.startsWith(prefix + "/"))
  );
};

export const getResponseCacheNamespace = () => {
  if (typeof window === "undefined") return "public";
  try {
    const stored = JSON.parse(window.localStorage.getItem("smaj_pi_user") || "{}") as {
      uid?: string;
      username?: string;
      _id?: string;
    };
    return stored.uid || stored._id || stored.username || "public";
  } catch {
    return "public";
  }
};

export const buildResponseCacheKey = (url = "", params?: unknown, namespace = getResponseCacheNamespace()) =>
  `${namespace}::${url}::${JSON.stringify(params || {})}`;

export const getResponseCacheGeneration = (namespace: string) => namespaceGenerations.get(namespace) || 0;
export const isResponseCacheGenerationCurrent = (namespace: string, generation: number) =>
  getResponseCacheGeneration(namespace) === generation;

const namespaceFromKey = (key: string) => key.split("::", 1)[0] || "public";

export const storeCachedResponse = async <T>(
  key: string,
  value: CachedResponse<T>,
  namespace = namespaceFromKey(key),
  generation = getResponseCacheGeneration(namespace)
) => {
  if (!isResponseCacheGenerationCurrent(namespace, generation)) return;
  memoryResponses.set(key, value);
  if (typeof window === "undefined" || !("indexedDB" in window)) return;

  const write = (async () => {
    const database = await openDatabase();
    try {
      if (!isResponseCacheGenerationCurrent(namespace, generation)) return;
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put(value, key);
      await new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
    } finally {
      database.close();
    }
  })();
  const writes = pendingWrites.get(namespace) || new Set<Promise<void>>();
  writes.add(write);
  pendingWrites.set(namespace, writes);
  try {
    await write;
  } finally {
    writes.delete(write);
    if (!writes.size) pendingWrites.delete(namespace);
  }
};

export const readCachedResponse = async <T>(key: string): Promise<CachedResponse<T> | null> => {
  const memoryValue = memoryResponses.get(key);
  if (memoryValue) {
    if (Date.now() - memoryValue.cachedAt <= MAX_AGE_MS) return memoryValue as CachedResponse<T>;
    memoryResponses.delete(key);
  }
  if (typeof window === "undefined" || !("indexedDB" in window)) return null;
  const database = await openDatabase();
  try {
    const value = (await requestResult(
      database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(key)
    )) as CachedResponse<T> | undefined;
    if (!value || Date.now() - value.cachedAt > MAX_AGE_MS) return null;
    memoryResponses.set(key, value);
    return value;
  } finally {
    database.close();
  }
};

export const clearCachedResponsesForNamespace = async (namespace: string) => {
  namespaceGenerations.set(namespace, getResponseCacheGeneration(namespace) + 1);
  const prefix = `${namespace}::`;
  for (const key of memoryResponses.keys()) {
    if (key.startsWith(prefix)) memoryResponses.delete(key);
  }

  await Promise.allSettled([...(pendingWrites.get(namespace) || [])]);
  if (typeof window === "undefined" || !("indexedDB" in window)) return;
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      const cursor = transaction.objectStore(STORE_NAME).openCursor();
      cursor.onsuccess = () => {
        const item = cursor.result;
        if (!item) return;
        if (String(item.key).startsWith(prefix)) item.delete();
        item.continue();
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
};
