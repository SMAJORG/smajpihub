const DB_NAME = "smaj-offline";
const STORE_NAME = "responses";
const VERSION = 1;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type CachedResponse<T = unknown> = {
  data: T;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  cachedAt: number;
};

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
  if (/^\/jobs\/(profile|applications|activity|employer|admin)(?:\/|$)/.test(path)) return false;
  if (path === "/marketplace/seller/settlements") return false;
  const marketplaceRead = /^\/marketplace\/(feed|products|saved|seller(?:s)?)(?:\/|$)/.test(path);
  const jobsRead = path.startsWith("/jobs/") && !/^\/jobs\/(billing|earnings|employer\/payments)(?:\/|$)/.test(path);
  return (
    marketplaceRead ||
    jobsRead ||
    [
      "/products",
      "/services",
      "/courses",
      "/education",
      "/my-learning",
      "/my-certificates",
      "/profile",
      "/user/profile",
      "/user/stats",
      "/health",
      "/food-delivery",
      "/housing",
    ].some(prefix => path === prefix || path.startsWith(prefix + "/"))
  );
};

const userNamespace = () => {
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

export const buildResponseCacheKey = (url = "", params?: unknown) =>
  `${userNamespace()}::${url}::${JSON.stringify(params || {})}`;

export const storeCachedResponse = async <T>(key: string, value: CachedResponse<T>) => {
  if (!("indexedDB" in window)) return;
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(value, key);
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
};

export const readCachedResponse = async <T>(key: string): Promise<CachedResponse<T> | null> => {
  if (!("indexedDB" in window)) return null;
  const database = await openDatabase();
  try {
    const value = (await requestResult(
      database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(key)
    )) as CachedResponse<T> | undefined;
    if (!value || Date.now() - value.cachedAt > MAX_AGE_MS) return null;
    return value;
  } finally {
    database.close();
  }
};
