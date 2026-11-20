import { getCommunityFeed, type CommunityPost } from "./communityApi";

export type CommunityFeedScope = "all" | "following";
export type CommunityFeedSnapshot = {
  posts: CommunityPost[];
  hasMore: boolean;
  page: number;
  loaded: boolean;
};

type CachedFeed = { snapshot: CommunityFeedSnapshot; cachedAt: number };
const feedCache = new Map<string, CachedFeed>();
const inFlightFeeds = new Map<string, Promise<CommunityFeedSnapshot>>();
const preloadedMedia = new Map<string, HTMLImageElement>();
const CACHE_MAX_AGE_MS = 60_000;

const cacheKey = (uid: string, scope: CommunityFeedScope) => `smaj-community-feed-v1:${uid}:${scope}`;

export const emptyCommunityFeed = (): CommunityFeedSnapshot => ({
  posts: [],
  hasMore: false,
  page: 1,
  loaded: false,
});

export const readCommunityFeedCache = (uid: string | undefined, scope: CommunityFeedScope): CachedFeed | null => {
  if (!uid || typeof window === "undefined") return null;
  const key = cacheKey(uid, scope);
  const inMemory = feedCache.get(key);
  if (inMemory) return inMemory;
  try {
    const stored = window.sessionStorage.getItem(key);
    if (!stored) return null;
    const value = JSON.parse(stored) as Partial<CommunityFeedSnapshot> & { cachedAt?: number };
    if (!Array.isArray(value.posts) || !value.posts.every(post => post && typeof post._id === "string" && Array.isArray(post.media))) return null;
    const cached: CachedFeed = {
      snapshot: {
        posts: value.posts,
        hasMore: value.hasMore === true,
        page: Number.isInteger(value.page) && Number(value.page) > 0 ? Number(value.page) : 1,
        loaded: true,
      },
      cachedAt: Number.isFinite(value.cachedAt) ? Number(value.cachedAt) : 0,
    };
    feedCache.set(key, cached);
    return cached;
  } catch {
    return null;
  }
};

export const writeCommunityFeedCache = (
  uid: string | undefined,
  scope: CommunityFeedScope,
  snapshot: CommunityFeedSnapshot,
) => {
  if (!uid || typeof window === "undefined") return;
  const key = cacheKey(uid, scope);
  const cached: CachedFeed = { snapshot, cachedAt: Date.now() };
  feedCache.set(key, cached);
  try {
    window.sessionStorage.setItem(key, JSON.stringify({ ...snapshot, cachedAt: cached.cachedAt }));
  } catch {
    // Keep the in-memory feed when session storage is full or disabled.
  }
  preloadCommunityMedia(snapshot.posts);
};

const videoPoster = (url: string) => url
  .replace("/video/upload/", "/video/upload/so_0/")
  .replace(/\.(mp4|webm|mov)(\?.*)?$/i, ".jpg$2");

export const preloadCommunityMedia = (posts: CommunityPost[]) => {
  if (typeof window === "undefined") return;
  let preloaded = 0;
  for (const post of posts.slice(0, 6)) {
    const target = post.originalPost ? { ...post, ...post.originalPost } as CommunityPost : post;
    const urls = [
      target.author.avatar,
      ...target.media.map(media => media.type === "video" ? videoPoster(media.url) : media.url),
    ];
    for (const url of urls) {
      if (!url || preloadedMedia.has(url)) continue;
      const image = new Image();
      image.decoding = "async";
      image.src = url;
      preloadedMedia.set(url, image);
      if (++preloaded >= 12) return;
    }
  }
};

export const getCachedCommunityFeed = async (
  uid: string | undefined,
  scope: CommunityFeedScope,
  forceRefresh = false,
): Promise<CommunityFeedSnapshot> => {
  const cached = readCommunityFeedCache(uid, scope);
  if (!forceRefresh && cached && Date.now() - cached.cachedAt < CACHE_MAX_AGE_MS) {
    preloadCommunityMedia(cached.snapshot.posts);
    return cached.snapshot;
  }
  if (!uid) {
    const { posts, hasMore } = await getCommunityFeed({ scope, page: 1 });
    return { posts, hasMore, page: 1, loaded: true };
  }
  const key = cacheKey(uid, scope);
  const pending = inFlightFeeds.get(key);
  if (pending) return pending;
  const request = getCommunityFeed({ scope, page: 1 }).then(({ posts, hasMore }) => {
    const snapshot = { posts, hasMore, page: 1, loaded: true };
    writeCommunityFeedCache(uid, scope, snapshot);
    return snapshot;
  }).finally(() => inFlightFeeds.delete(key));
  inFlightFeeds.set(key, request);
  return request;
};

export const prefetchCommunityFeeds = async (uid: string) => {
  await Promise.all([
    getCachedCommunityFeed(uid, "all"),
    getCachedCommunityFeed(uid, "following"),
  ]);
};
