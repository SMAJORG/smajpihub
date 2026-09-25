import type { Request, Response, Router } from "express";
import axios from "axios";
import { ObjectId } from "mongodb";
import env from "../environments";
import { resolveCurrentUser } from "../services/auth";
import { platformAPIKeyClient } from "../services/platformAPIClient";

const TMDB_API_URL = "https://api.themoviedb.org/3";
const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { expiresAt: number; value: unknown }>();
const STREAM_PI_RATE = 314159;
const streamPlans = {
  free: { id: "free", name: "Free", priceUsd: 0, features: ["Standard creator videos", "Basic My List", "Community channels"] },
  plus: { id: "plus", name: "Plus", priceUsd: 8, features: ["HD streaming", "Downloads list", "No advertising"] },
  family: { id: "family", name: "Family", priceUsd: 14, features: ["4K ready", "Up to five profiles", "Family controls"] },
} as const;
type StreamPlanId = keyof typeof streamPlans;

const streamPlanPrice = (priceUsd: number) => ({
  priceUsd,
  // Pi/Stellar amounts support seven decimal places. Sending more precision
  // lets Wallet normalize the amount and then fails our strict comparison.
  pricePi: Number.isFinite(priceUsd) && priceUsd > 0
    ? Math.round((priceUsd / STREAM_PI_RATE) * 10_000_000) / 10_000_000
    : 0,
  piRateUsed: STREAM_PI_RATE,
});

const normalizeStreamSubscription = (subscription: Record<string, any> | null | undefined) => {
  const plan = subscription?.plan && subscription.plan in streamPlans ? subscription.plan as StreamPlanId : "free";
  const expiresAt = subscription?.expiresAt ? new Date(subscription.expiresAt) : null;
  const expired = expiresAt ? expiresAt.getTime() < Date.now() : false;
  const status = expired ? "expired" : subscription?.status || "active";
  return {
    plan,
    status,
    startedAt: subscription?.startedAt || null,
    expiresAt: subscription?.expiresAt || null,
    priceUsd: Number(subscription?.priceUsd) || streamPlans[plan].priceUsd,
    pricePi: Number(subscription?.pricePi) || streamPlanPrice(streamPlans[plan].priceUsd).pricePi,
    piRateUsed: Number(subscription?.piRateUsed) || STREAM_PI_RATE,
  };
};

const youtubeVideoId = (input: string) => {
  try {
    const value = input.trim();
    if (/^[A-Za-z0-9_-]{11}$/.test(value)) return value;
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    const candidate = host === "youtu.be" ? url.pathname.split("/").filter(Boolean)[0]
      : host.endsWith("youtube.com") ? (url.searchParams.get("v") || (url.pathname.startsWith("/shorts/") || url.pathname.startsWith("/embed/") ? url.pathname.split("/")[2] : "")) : "";
    return candidate && /^[A-Za-z0-9_-]{11}$/.test(candidate) ? candidate : null;
  } catch { return null; }
};

const NO_PLAYABLE_ARCHIVE_SOURCE_MESSAGE = "No playable video source is available for this title.";

type ArchiveOrgFile = { name?: unknown; format?: unknown; size?: unknown; private?: unknown };

const ARCHIVE_IGNORED_NAME_PATTERN = /\.(xml|torrent|srt|vtt|sub|txt|pdf|sqlite|db|nfo|jpg|jpeg|png|gif|bmp|ico|json|tlg|log)$/i;
const ARCHIVE_IGNORED_FORMAT_PATTERN = /thumbnail|tile|metadata|torrent|text|image|subtitle|caption|animated gif/i;
const ARCHIVE_H264_MP4_NAME_PATTERN = /\.mp4$/i;
const ARCHIVE_H264_FORMAT_PATTERN = /h\.?264/i;
const ARCHIVE_MP4_NAME_PATTERN = /\.(mp4|m4v)$/i;
const ARCHIVE_MP4_FORMAT_PATTERN = /mpeg-?4/i;
const ARCHIVE_OTHER_VIDEO_NAME_PATTERN = /\.(webm|ogv|ogg)$/i;
const ARCHIVE_OTHER_VIDEO_FORMAT_PATTERN = /webm|ogg video|ogv/i;

const isPlayableArchiveCandidate = (file: ArchiveOrgFile) => {
  const name = typeof file.name === "string" ? file.name : "";
  if (!name || file.private === true || file.private === "true") return false;
  if (ARCHIVE_IGNORED_NAME_PATTERN.test(name)) return false;
  const format = typeof file.format === "string" ? file.format : "";
  if (ARCHIVE_IGNORED_FORMAT_PATTERN.test(format)) return false;
  return true;
};

const largestBySize = (files: ArchiveOrgFile[]) =>
  files.length ? files.sort((left, right) => Number(right.size || 0) - Number(left.size || 0))[0] : null;

// Selection order: H.264 MP4, then any other MPEG4/MP4, then another browser-playable format (WebM/Ogg).
const selectPlayableArchiveFile = (files: ArchiveOrgFile[]): ArchiveOrgFile | null => {
  const candidates = files.filter(isPlayableArchiveCandidate);
  const h264Mp4 = largestBySize(candidates.filter(file =>
    ARCHIVE_H264_MP4_NAME_PATTERN.test(String(file.name)) && ARCHIVE_H264_FORMAT_PATTERN.test(String(file.format || ""))));
  if (h264Mp4) return h264Mp4;
  const anyMp4 = largestBySize(candidates.filter(file =>
    ARCHIVE_MP4_NAME_PATTERN.test(String(file.name)) || ARCHIVE_MP4_FORMAT_PATTERN.test(String(file.format || ""))));
  if (anyMp4) return anyMp4;
  const otherVideo = largestBySize(candidates.filter(file =>
    ARCHIVE_OTHER_VIDEO_NAME_PATTERN.test(String(file.name)) || ARCHIVE_OTHER_VIDEO_FORMAT_PATTERN.test(String(file.format || ""))));
  return otherVideo || null;
};

type YouTubePlaylistItemsResponse = {
  items?: Array<{
    snippet?: { resourceId?: { videoId?: string } };
  }>;
};

type YouTubeVideosResponse = {
  items?: Array<{
    id?: string;
    snippet?: {
      title?: string;
      channelId?: string;
      channelTitle?: string;
      publishedAt?: string;
      liveBroadcastContent?: "live" | "upcoming" | "none";
      thumbnails?: Record<string, { url?: string }>;
    };
    status?: { embeddable?: boolean };
  }>;
};

type YouTubeLiveCacheItem = {
  channelId: string;
  videoId: string | null;
  title: string | null;
  thumbnail: string | null;
  channelTitle: string | null;
  isLive: boolean;
  lastCheckedAt: string;
  publishedAt: string | null;
};

const youtubeLiveCache = new Map<string, YouTubeLiveCacheItem>();
let youtubeLiveRefreshPromise: Promise<void> | null = null;
let youtubeLiveSchedulerStarted = false;
let lastManualYoutubeRefreshAt = 0;
const YOUTUBE_MANUAL_REFRESH_COOLDOWN_MS = 5 * 60 * 1000;
const YOUTUBE_DAILY_CALL_LIMIT = 100;
let youtubeCallBudgetDate = new Date().toISOString().slice(0, 10);
let youtubeCallsToday = 0;

const consumeYoutubeCallBudget = () => {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== youtubeCallBudgetDate) {
    youtubeCallBudgetDate = today;
    youtubeCallsToday = 0;
  }
  if (youtubeCallsToday >= YOUTUBE_DAILY_CALL_LIMIT) return false;
  youtubeCallsToday += 1;
  return true;
};

const youtubeSafeError = (error: unknown) => {
  if (!axios.isAxiosError(error)) return { httpStatus: null, reason: error instanceof Error ? error.message : "Unknown error" };
  const data = error.response?.data as { error?: { message?: string; errors?: Array<{ reason?: string; message?: string }> } } | undefined;
  return {
    httpStatus: error.response?.status || null,
    reason: data?.error?.errors?.[0]?.reason || data?.error?.errors?.[0]?.message || data?.error?.message || error.message,
  };
};

const refreshYoutubeLiveCache = async () => {
  if (youtubeLiveRefreshPromise) return youtubeLiveRefreshPromise;
  youtubeLiveRefreshPromise = (async () => {
    if (!env.youtube_api_key || !env.youtube_live_channel_ids.length) {
      console.warn("[YouTube live] background refresh skipped: API key or channel IDs are not configured");
      return;
    }
    const checkedAt = new Date().toISOString();
    const channelCandidates = await Promise.all(env.youtube_live_channel_ids.map(async (channelId) => {
      if (!consumeYoutubeCallBudget()) {
        console.warn("[YouTube live] daily API call budget exhausted; preserving cached channel", { channelId, dailyLimit: YOUTUBE_DAILY_CALL_LIMIT });
        const cached = youtubeLiveCache.get(channelId);
        if (cached) youtubeLiveCache.set(channelId, { ...cached, lastCheckedAt: checkedAt });
        return { channelId, videoIds: [] as string[], failed: true };
      }
      try {
        const response = await axios.get<YouTubePlaylistItemsResponse>("https://www.googleapis.com/youtube/v3/playlistItems", {
          params: { part: "snippet", playlistId: `UU${channelId.slice(2)}`, maxResults: 10, key: env.youtube_api_key },
          timeout: 12_000,
        });
        const videoIds = (response.data.items || []).map(item => item.snippet?.resourceId?.videoId || "").filter(id => /^[A-Za-z0-9_-]{11}$/.test(id));
        return { channelId, videoIds, failed: false };
      } catch (error) {
        const diagnostic = youtubeSafeError(error);
        const message = diagnostic.httpStatus === 429 ? "[YouTube live] rate limit; preserving cached channel" : "[YouTube live] playlist refresh failed; preserving cached channel";
        console.warn(message, { channelId, ...diagnostic });
        const cached = youtubeLiveCache.get(channelId);
        if (cached) youtubeLiveCache.set(channelId, { ...cached, lastCheckedAt: checkedAt });
        return { channelId, videoIds: [] as string[], failed: true };
      }
    }));

    const ownerByVideoId = new Map<string, string>();
    channelCandidates.forEach(({ channelId, videoIds }) => videoIds.forEach(videoId => ownerByVideoId.set(videoId, channelId)));
    const videoIds = [...ownerByVideoId.keys()];
    const videosByChannel = new Map<string, NonNullable<YouTubeVideosResponse["items"]>>();
    const failedChannels = new Set(channelCandidates.filter(item => item.failed).map(item => item.channelId));

    for (let index = 0; index < videoIds.length; index += 50) {
      const batch = videoIds.slice(index, index + 50);
      if (!consumeYoutubeCallBudget()) {
        batch.forEach(videoId => { const owner = ownerByVideoId.get(videoId); if (owner) failedChannels.add(owner); });
        console.warn("[YouTube live] daily API call budget exhausted; preserving cached live results", { dailyLimit: YOUTUBE_DAILY_CALL_LIMIT });
        continue;
      }
      try {
        const response = await axios.get<YouTubeVideosResponse>("https://www.googleapis.com/youtube/v3/videos", {
          params: { part: "snippet,status", id: batch.join(","), key: env.youtube_api_key },
          timeout: 12_000,
        });
        (response.data.items || []).forEach(video => {
          const channelId = (video.id && ownerByVideoId.get(video.id)) || video.snippet?.channelId;
          if (!channelId) return;
          videosByChannel.set(channelId, [...(videosByChannel.get(channelId) || []), video]);
        });
      } catch (error) {
        const diagnostic = youtubeSafeError(error);
        batch.forEach(videoId => {
          const owner = ownerByVideoId.get(videoId);
          if (!owner) return;
          failedChannels.add(owner);
          const cached = youtubeLiveCache.get(owner);
          if (cached) youtubeLiveCache.set(owner, { ...cached, lastCheckedAt: checkedAt });
        });
        const message = diagnostic.httpStatus === 429 ? "[YouTube live] rate limit; preserving cached live results" : "[YouTube live] video refresh failed; preserving cached live results";
        console.warn(message, { channelIds: [...failedChannels], ...diagnostic });
      }
    }

    channelCandidates.forEach(({ channelId, failed }) => {
      if (failed || failedChannels.has(channelId)) return;
      const liveVideo = (videosByChannel.get(channelId) || []).find(video => video.snippet?.liveBroadcastContent === "live" && video.status?.embeddable !== false);
      if (!liveVideo?.id) {
        youtubeLiveCache.set(channelId, { channelId, videoId: null, title: null, thumbnail: null, channelTitle: null, isLive: false, lastCheckedAt: checkedAt, publishedAt: null });
        return;
      }
      const thumbnails = liveVideo.snippet?.thumbnails || {};
      const thumbnail = thumbnails.maxres?.url || thumbnails.standard?.url || thumbnails.high?.url || thumbnails.medium?.url || `https://i.ytimg.com/vi/${liveVideo.id}/hqdefault.jpg`;
      youtubeLiveCache.set(channelId, {
        channelId,
        videoId: liveVideo.id,
        title: String(liveVideo.snippet?.title || "Live broadcast").slice(0, 180),
        thumbnail,
        channelTitle: String(liveVideo.snippet?.channelTitle || "Official YouTube Channel").slice(0, 120),
        isLive: true,
        lastCheckedAt: checkedAt,
        publishedAt: liveVideo.snippet?.publishedAt || null,
      });
    });
    console.info("[YouTube live] background refresh complete", { channelsChecked: channelCandidates.length, liveChannels: [...youtubeLiveCache.values()].filter(item => item.isLive).length, youtubeCallsToday, dailyCallLimit: YOUTUBE_DAILY_CALL_LIMIT, lastCheckedAt: checkedAt });
  })().finally(() => { youtubeLiveRefreshPromise = null; });
  return youtubeLiveRefreshPromise;
};

const cachedYoutubeLiveChannels = () => [...youtubeLiveCache.values()].filter(item => item.isLive && item.videoId).map(item => ({
  ...item,
  liveInputUid: `youtube-${item.videoId}`,
  youtubeVideoId: item.videoId,
  creatorName: item.channelTitle,
  youtubeChannelId: item.channelId,
  processingStatus: "live",
  thumbnailUrl: item.thumbnail,
  chatMode: "youtube",
  contentSource: "youtube",
  publishedAt: item.publishedAt,
}));

const startYoutubeLiveScheduler = () => {
  if (youtubeLiveSchedulerStarted) return;
  youtubeLiveSchedulerStarted = true;
  const runRefresh = () => void refreshYoutubeLiveCache().catch(error => console.error("[YouTube live] scheduled refresh failed", youtubeSafeError(error)));
  runRefresh();
  const timer = setInterval(runRefresh, env.youtube_live_refresh_minutes * 60 * 1000);
  timer.unref();
};

type TmdbMedia = {
  id: number;
  title?: string;
  name?: string;
  media_type?: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  release_date?: string;
  first_air_date?: string;
  vote_average?: number;
  vote_count?: number;
  genre_ids?: number[];
};

type TmdbVideo = {
  key?: string;
  name?: string;
  site?: string;
  type?: string;
  official?: boolean;
  iso_639_1?: string;
  published_at?: string;
};

const normalizeMedia = (item: TmdbMedia, fallbackType: "movie" | "tv" = "movie") => ({
  id: String(item.id),
  tmdbId: item.id,
  mediaType: item.media_type === "tv" || item.media_type === "movie" ? item.media_type : fallbackType,
  title: item.title || item.name || "Untitled",
  overview: item.overview || "",
  posterUrl: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : null,
  backdropUrl: item.backdrop_path ? `https://image.tmdb.org/t/p/original${item.backdrop_path}` : null,
  releaseDate: item.release_date || item.first_air_date || null,
  rating: typeof item.vote_average === "number" ? Number(item.vote_average.toFixed(1)) : null,
  voteCount: item.vote_count || 0,
  genreIds: item.genre_ids || [],
});

const tmdbGet = async <T>(path: string, params: Record<string, string | number | boolean | undefined> = {}) => {
  if (!env.tmdb_access_token) {
    const error = new Error("TMDB is not configured. Add TMDB_ACCESS_TOKEN to the backend environment.");
    Object.assign(error, { status: 503 });
    throw error;
  }
  const key = `${path}?${new URLSearchParams(Object.entries(params).filter((entry): entry is [string, string] => entry[1] !== undefined).map(([name, value]) => [name, String(value)])).toString()}`;
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value as T;
  const response = await axios.get<T>(`${TMDB_API_URL}${path}`, {
    params,
    timeout: 12_000,
    headers: { Authorization: `Bearer ${env.tmdb_access_token}`, Accept: "application/json" },
  });
  cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, value: response.data });
  return response.data;
};

const mountStreamEndpoints = (router: Router) => {
  startYoutubeLiveScheduler();

  const requireCreator = async (req: Request, res: Response) => {
    const user = await resolveCurrentUser(req);
    if (!user) { res.status(401).json({ error: "authentication_required", message: "Sign in to use Creator Studio." }); return null; }
    if (!req.app.locals.streamContentCollection) { res.status(503).json({ error: "service_unavailable", message: "Stream content storage is not ready." }); return null; }
    return user;
  };

  const requireViewer = async (req: Request, res: Response) => {
    const user = await resolveCurrentUser(req);
    if (!user) { res.status(401).json({ error: "authentication_required", message: "Sign in to manage My List." }); return null; }
    if (!req.app.locals.userCollection) { res.status(503).json({ error: "service_unavailable", message: "User storage is not ready." }); return null; }
    return user;
  };

  const requireStreamAdmin = async (req: Request, res: Response) => {
    const user = await resolveCurrentUser(req);
    const usernames = [user?.piUsername, user?.username].map(value => String(value || "").trim().replace(/^@+/, "").toLowerCase());
    if (!user) { res.status(401).json({ error: "unauthorized", message: "Sign in to manage Stream." }); return null; }
    if (user.role !== "admin" && !usernames.some(username => env.admin_pi_usernames.includes(username))) { res.status(403).json({ error: "forbidden", message: "Stream administrator access is required." }); return null; }
    if (!req.app.locals.streamContentCollection) { res.status(503).json({ error: "service_unavailable", message: "Stream content storage is not ready." }); return null; }
    return user;
  };

  const publicPost = (post: Record<string, unknown>) => ({
    _id: String(post._id),
    body: post.body,
    visibility: post.visibility || "public",
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
  });

  router.get("/my-list", async (req, res) => {
    const user = await requireViewer(req, res); if (!user) return;
    const stored = await req.app.locals.userCollection.findOne({ _id: user._id });
    return res.json({ items: Array.isArray(stored?.streamMyList) ? stored.streamMyList : [] });
  });

  router.get("/my-list/:type(movie|tv)/:id", async (req, res) => {
    const user = await requireViewer(req, res); if (!user) return;
    const tmdbId = Number(req.params.id);
    const stored = await req.app.locals.userCollection.findOne({ _id: user._id, streamMyList: { $elemMatch: { tmdbId, mediaType: req.params.type } } });
    return res.json({ saved: Boolean(stored) });
  });

  router.post("/my-list", async (req, res) => {
    const user = await requireViewer(req, res); if (!user) return;
    const tmdbId = Number(req.body?.tmdbId);
    const mediaType = req.body?.mediaType === "tv" ? "tv" : req.body?.mediaType === "movie" ? "movie" : null;
    const title = String(req.body?.title || "").trim().slice(0, 180);
    if (!Number.isInteger(tmdbId) || tmdbId <= 0 || !mediaType || !title) return res.status(400).json({ error: "bad_request", message: "A valid TMDB title is required." });
    const item = { tmdbId, id: String(tmdbId), mediaType, title, overview: String(req.body?.overview || "").slice(0, 1200), posterUrl: req.body?.posterUrl ? String(req.body.posterUrl).slice(0, 500) : null, backdropUrl: req.body?.backdropUrl ? String(req.body.backdropUrl).slice(0, 500) : null, releaseDate: req.body?.releaseDate ? String(req.body.releaseDate).slice(0, 20) : null, rating: Number.isFinite(Number(req.body?.rating)) ? Number(req.body.rating) : null, savedAt: new Date() };
    await req.app.locals.userCollection.updateOne({ _id: user._id }, { $pull: { streamMyList: { tmdbId, mediaType } } });
    await req.app.locals.userCollection.updateOne({ _id: user._id }, { $addToSet: { streamMyList: item } });
    return res.status(201).json({ saved: true, item });
  });

  router.delete("/my-list/:type(movie|tv)/:id", async (req, res) => {
    const user = await requireViewer(req, res); if (!user) return;
    await req.app.locals.userCollection.updateOne({ _id: user._id }, { $pull: { streamMyList: { tmdbId: Number(req.params.id), mediaType: req.params.type } } });
    return res.json({ saved: false });
  });

  router.get("/downloads", async (req, res) => {
    const user = await requireViewer(req, res); if (!user) return;
    const stored = await req.app.locals.userCollection.findOne({ _id: user._id });
    return res.json({ items: Array.isArray(stored?.streamDownloads) ? stored.streamDownloads : [] });
  });

  router.get("/downloads/:type(movie|tv)/:id", async (req, res) => {
    const user = await requireViewer(req, res); if (!user) return;
    const tmdbId = Number(req.params.id);
    const stored = await req.app.locals.userCollection.findOne({ _id: user._id, streamDownloads: { $elemMatch: { tmdbId, mediaType: req.params.type } } });
    return res.json({ downloaded: Boolean(stored) });
  });

  router.post("/downloads", async (req, res) => {
    const user = await requireViewer(req, res); if (!user) return;
    const tmdbId = Number(req.body?.tmdbId);
    const mediaType = req.body?.mediaType === "tv" ? "tv" : req.body?.mediaType === "movie" ? "movie" : null;
    const title = String(req.body?.title || "").trim().slice(0, 180);
    if (!Number.isInteger(tmdbId) || tmdbId <= 0 || !mediaType || !title) return res.status(400).json({ error: "bad_request", message: "A valid TMDB title is required." });
    const licensedVideo = await req.app.locals.streamContentCollection?.findOne({ "catalogAttachment.tmdbId": tmdbId, "catalogAttachment.mediaType": mediaType, visibility: "public", moderationStatus: "approved", playbackAllowed: true, processingStatus: "ready", downloadAllowed: true });
    if (!licensedVideo) return res.status(403).json({ error: "download_not_permitted", message: "This title is not licensed for download." });
    const item = { tmdbId, id: String(tmdbId), mediaType, title, overview: String(req.body?.overview || "").slice(0, 1200), posterUrl: req.body?.posterUrl ? String(req.body.posterUrl).slice(0, 500) : null, backdropUrl: req.body?.backdropUrl ? String(req.body.backdropUrl).slice(0, 500) : null, releaseDate: req.body?.releaseDate ? String(req.body.releaseDate).slice(0, 20) : null, rating: Number.isFinite(Number(req.body?.rating)) ? Number(req.body.rating) : null, downloadStatus: "ready", downloadedAt: new Date() };
    await req.app.locals.userCollection.updateOne({ _id: user._id }, { $pull: { streamDownloads: { tmdbId, mediaType } } });
    await req.app.locals.userCollection.updateOne({ _id: user._id }, { $addToSet: { streamDownloads: item } });
    return res.status(201).json({ downloaded: true, item });
  });

  router.delete("/downloads/:type(movie|tv)/:id", async (req, res) => {
    const user = await requireViewer(req, res); if (!user) return;
    await req.app.locals.userCollection.updateOne({ _id: user._id }, { $pull: { streamDownloads: { tmdbId: Number(req.params.id), mediaType: req.params.type } } });
    return res.json({ downloaded: false });
  });

  router.get("/subscription", async (req, res) => {
    const user = await requireViewer(req, res); if (!user) return;
    const stored = await req.app.locals.userCollection.findOne({ _id: user._id });
    return res.json({
      plans: Object.values(streamPlans).map(plan => ({ ...plan, ...streamPlanPrice(plan.priceUsd) })),
      subscription: normalizeStreamSubscription(stored?.streamSubscription),
    });
  });

  router.post("/subscription/checkout", async (req, res) => {
    const user = await requireViewer(req, res); if (!user) return;
    const plan = String(req.body?.plan || "free") as StreamPlanId;
    if (!(plan in streamPlans)) return res.status(400).json({ error: "invalid_plan", message: "Choose a valid Stream plan." });
    const selected = streamPlans[plan];
    const pricing = streamPlanPrice(selected.priceUsd);
    if (selected.priceUsd > 0) {
      const checkout = { plan, amountPi: pricing.pricePi, memo: `SMAJ Stream ${selected.name} monthly plan`, createdAt: new Date() };
      await req.app.locals.userCollection.updateOne({ _id: user._id }, { $set: { pendingStreamSubscription: checkout } });
      return res.status(201).json({ checkout: { plan, amountPi: pricing.pricePi, memo: checkout.memo } });
    }
    const now = new Date();
    const subscription = {
      plan,
      status: "active",
      startedAt: now,
      expiresAt: null,
      priceUsd: pricing.priceUsd,
      pricePi: pricing.pricePi,
      piRateUsed: pricing.piRateUsed,
      paymentStatus: "free",
      updatedAt: now,
    };
    await req.app.locals.userCollection.updateOne({ _id: user._id }, { $set: { streamSubscription: subscription } });
    return res.status(201).json({
      subscription: normalizeStreamSubscription(subscription),
      message: "Free Stream plan activated.",
    });
  });

  router.post("/subscription/payment/approve", async (req, res) => {
    const user = await requireViewer(req, res); if (!user) return;
    const paymentId = String(req.body?.paymentId || "").trim();
    const plan = String(req.body?.plan || "") as StreamPlanId;
    if (!paymentId || !(plan in streamPlans) || streamPlans[plan].priceUsd <= 0) return res.status(400).json({ error: "invalid_payment", message: "A valid paid Stream plan and Pi payment are required." });
    const stored = await req.app.locals.userCollection.findOne({ _id: user._id });
    const pending = stored?.pendingStreamSubscription;
    const expectedAmount = streamPlanPrice(streamPlans[plan].priceUsd).pricePi;
    if (!pending || pending.plan !== plan || Math.abs(Number(pending.amountPi) - expectedAmount) > 0.00000001) return res.status(409).json({ error: "checkout_mismatch", message: "Start this Stream checkout again." });
    try {
      const remote = await platformAPIKeyClient.get(`/v2/payments/${encodeURIComponent(paymentId)}`, { timeout: 6000 });
      const payment = remote.data;
      if (payment?.metadata?.service !== "stream" || payment?.metadata?.plan !== plan || Math.abs(Number(payment?.amount) - expectedAmount) > 0.00000001 || (payment?.user_uid && user.uid && payment.user_uid !== user.uid))
        return res.status(409).json({ error: "payment_mismatch", message: "This Pi payment does not match the selected Stream plan." });
      // Pi may repeat the approval callback after returning from Wallet.
      if (!payment?.status?.developer_approved)
        await platformAPIKeyClient.post(`/v2/payments/${encodeURIComponent(paymentId)}/approve`);
      await req.app.locals.userCollection.updateOne({ _id: user._id }, { $set: { "pendingStreamSubscription.paymentId": paymentId, "pendingStreamSubscription.approvedAt": new Date() } });
      return res.json({ approved: true });
    } catch (error) {
      const status = Number((error as { response?: { status?: number } }).response?.status || 502);
      return res.status(status).json({ error: "pi_approval_failed", message: "Pi could not approve this Stream payment." });
    }
  });

  router.post("/subscription/payment/complete", async (req, res) => {
    const user = await requireViewer(req, res); if (!user) return;
    const paymentId = String(req.body?.paymentId || "").trim();
    const txid = String(req.body?.txid || "").trim();
    const plan = String(req.body?.plan || "") as StreamPlanId;
    const stored = await req.app.locals.userCollection.findOne({ _id: user._id });
    if (stored?.streamSubscription?.paymentStatus === "paid" && stored.streamSubscription.paymentId === paymentId && stored.streamSubscription.plan === plan)
      return res.json({ subscription: normalizeStreamSubscription(stored.streamSubscription), message: `${streamPlans[plan].name} is already active.` });
    const pending = stored?.pendingStreamSubscription;
    if (!paymentId || !txid || !(plan in streamPlans) || !pending || pending.plan !== plan || pending.paymentId !== paymentId)
      return res.status(409).json({ error: "payment_mismatch", message: "This Pi payment does not match an approved Stream checkout." });
    try {
      // A successful Pi Platform completion response is authoritative. The
      // completion payload does not always include `transaction.verified`, so
      // requiring that optional field rejected valid Stream purchases.
      const completedResponse = await platformAPIKeyClient.post(`/v2/payments/${encodeURIComponent(paymentId)}/complete`, { txid });
      const completedPayment = completedResponse.data;
      const completedTxid = String(completedPayment?.transaction?.txid || "").trim();
      if (completedPayment?.status?.developer_completed === false || (completedTxid && completedTxid !== txid))
        return res.status(409).json({ error: "payment_not_completed", message: "Pi has not fully confirmed this payment. Your Stream plan was not changed." });
      const now = new Date();
      const expiresAt = new Date(now); expiresAt.setUTCMonth(expiresAt.getUTCMonth() + 1);
      const pricing = streamPlanPrice(streamPlans[plan].priceUsd);
      const subscription = { plan, status: "active", startedAt: now, expiresAt, priceUsd: pricing.priceUsd, pricePi: pricing.pricePi, piRateUsed: pricing.piRateUsed, paymentStatus: "paid", paymentId, paymentTxid: txid, updatedAt: now };
      const activation = await req.app.locals.userCollection.updateOne(
        { _id: user._id, "pendingStreamSubscription.plan": plan, "pendingStreamSubscription.paymentId": paymentId },
        { $set: { streamSubscription: subscription }, $unset: { pendingStreamSubscription: "" } },
      );
      if (!activation.matchedCount) return res.status(409).json({ error: "checkout_changed", message: "This checkout is no longer active. Contact support with your Pi transaction ID." });
      return res.json({ subscription: normalizeStreamSubscription(subscription), message: `${streamPlans[plan].name} is active for one month.` });
    } catch (error) {
      const status = Number((error as { response?: { status?: number } }).response?.status || 502);
      return res.status(status).json({ error: "pi_completion_failed", message: "Pi could not complete this Stream payment." });
    }
  });

  router.post("/subscription/cancel", async (req, res) => {
    const user = await requireViewer(req, res); if (!user) return;
    const stored = await req.app.locals.userCollection.findOne({ _id: user._id });
    const current = normalizeStreamSubscription(stored?.streamSubscription);
    const subscription = { ...current, status: "cancelled", updatedAt: new Date() };
    await req.app.locals.userCollection.updateOne({ _id: user._id }, { $set: { streamSubscription: subscription } });
    return res.json({ subscription, message: "Stream subscription cancelled." });
  });

  const streamProfileCompletion = (profile: Record<string, unknown>) => {
    let value = 0;
    if (profile.avatarUrl) value += 15;
    if (profile.displayName) value += 10;
    if (profile.country) value += 10;
    if (profile.language) value += 10;
    if (Array.isArray(profile.favoriteGenres) && profile.favoriteGenres.length >= 3) value += 15;
    if (profile.maturityLevel) value += 10;
    if (profile.videoQuality) value += 10;
    if (typeof profile.showActivity === "boolean") value += 10;
    if (typeof profile.emailNotifications === "boolean") value += 10;
    return value;
  };

  router.get("/profile", async (req, res) => {
    const user = await requireViewer(req, res); if (!user) return;
    const stored = await req.app.locals.userCollection.findOne({ _id: user._id });
    const profile = { displayName: stored?.streamProfile?.displayName || stored?.displayName || stored?.username || stored?.piUsername || "", avatarUrl: stored?.streamProfile?.avatarUrl || stored?.avatarUrl || "", country: stored?.streamProfile?.country || stored?.country || "", language: stored?.streamProfile?.language || "en", subtitleLanguage: stored?.streamProfile?.subtitleLanguage || "en", favoriteGenres: stored?.streamProfile?.favoriteGenres || [], preferredRegions: stored?.streamProfile?.preferredRegions || [], maturityLevel: stored?.streamProfile?.maturityLevel || "16", videoQuality: stored?.streamProfile?.videoQuality || "auto", autoplay: stored?.streamProfile?.autoplay ?? true, dataSaver: stored?.streamProfile?.dataSaver ?? false, showActivity: stored?.streamProfile?.showActivity ?? false, emailNotifications: stored?.streamProfile?.emailNotifications ?? false, channelName: stored?.streamProfile?.channelName || stored?.displayName || stored?.username || "My channel", channelHandle: stored?.streamProfile?.channelHandle || stored?.piUsername || stored?.username || "", channelDescription: stored?.streamProfile?.channelDescription || "", channelBannerUrl: stored?.streamProfile?.channelBannerUrl || "" };
    return res.json({ profile, completion: streamProfileCompletion(profile), username: stored?.piUsername || stored?.username || "" });
  });

  router.put("/profile", async (req, res) => {
    const user = await requireViewer(req, res); if (!user) return;
    const genres = ["action", "anime", "comedy", "documentary", "drama", "family", "horror", "music", "romance", "sports", "thriller"];
    const regions = ["african", "bollywood", "chinese", "hollywood", "k-drama", "kannywood", "nollywood"];
    const avatarUrl = String(req.body?.avatarUrl || "").trim().slice(0, 500);
    const channelBannerUrl = String(req.body?.channelBannerUrl || "").trim().slice(0, 500);
    if (avatarUrl && !/^https:\/\//i.test(avatarUrl)) return res.status(400).json({ error: "invalid_avatar", message: "Avatar must use a secure HTTPS URL." });
    if (channelBannerUrl && !/^https:\/\//i.test(channelBannerUrl)) return res.status(400).json({ error: "invalid_banner", message: "Channel banner must use a secure HTTPS URL." });
    const profile = { displayName: String(req.body?.displayName || "").trim().slice(0, 80), avatarUrl, country: String(req.body?.country || "").trim().toUpperCase().slice(0, 2), language: String(req.body?.language || "en").trim().slice(0, 10), subtitleLanguage: String(req.body?.subtitleLanguage || "en").trim().slice(0, 10), favoriteGenres: Array.isArray(req.body?.favoriteGenres) ? [...new Set(req.body.favoriteGenres.map(String).filter((item: string) => genres.includes(item)))].slice(0, 8) : [], preferredRegions: Array.isArray(req.body?.preferredRegions) ? [...new Set(req.body.preferredRegions.map(String).filter((item: string) => regions.includes(item)))].slice(0, 7) : [], maturityLevel: ["kids", "13", "16", "18"].includes(req.body?.maturityLevel) ? req.body.maturityLevel : "16", videoQuality: ["auto", "data-saver", "hd", "full-hd"].includes(req.body?.videoQuality) ? req.body.videoQuality : "auto", autoplay: req.body?.autoplay === true, dataSaver: req.body?.dataSaver === true, showActivity: req.body?.showActivity === true, emailNotifications: req.body?.emailNotifications === true, channelName: String(req.body?.channelName || req.body?.displayName || "").trim().slice(0, 80), channelHandle: String(req.body?.channelHandle || "").trim().replace(/^@/, "").replace(/[^a-zA-Z0-9_.-]/g, "").slice(0, 40), channelDescription: String(req.body?.channelDescription || "").trim().slice(0, 500), channelBannerUrl, updatedAt: new Date() };
    if (profile.displayName.length < 2) return res.status(400).json({ error: "invalid_name", message: "Display name must contain at least two characters." });
    await req.app.locals.userCollection.updateOne({ _id: user._id }, { $set: { streamProfile: profile } });
    return res.json({ profile, completion: streamProfileCompletion(profile) });
  });

  router.post("/creator/uploads", async (req, res) => {
    try {
      const user = await requireCreator(req, res);
      if (!user) return;
      const platformSettings = await req.app.locals.streamSettingsCollection?.findOne({ key: "platform" });
      if (platformSettings?.uploadsEnabled === false) return res.status(503).json({ error: "uploads_disabled", message: "Stream uploads are temporarily disabled by an administrator." });
      if (!env.cloudflare_stream_account_id || !env.cloudflare_stream_api_token) return res.status(503).json({ error: "cloudflare_stream_not_configured", message: "Add Cloudflare Stream credentials to the backend environment." });
      const title = String(req.body?.title || "").trim().slice(0, 140);
      const description = String(req.body?.description || "").trim().slice(0, 3000);
      const category = String(req.body?.category || "Entertainment").trim().slice(0, 60);
      const visibility = ["public", "unlisted", "private"].includes(req.body?.visibility) ? req.body.visibility : "private";
      const fileName = String(req.body?.fileName || "video.mp4").trim().slice(0, 180);
      const fileSize = Number(req.body?.fileSize || 0);
      const maxDurationSeconds = Math.max(1, Math.min(14_400, Number(req.body?.maxDurationSeconds) || 3600));
      if (!title || description.length < 20) return res.status(400).json({ error: "bad_request", message: "Add a title and a description of at least 20 characters." });
      if (fileSize <= 0 || fileSize > 200 * 1024 * 1024) return res.status(400).json({ error: "file_size", message: "This upload flow supports video files up to 200 MB." });
      if (req.body?.rightsConfirmed !== true) return res.status(400).json({ error: "rights_required", message: "Confirm that you own or control the rights to distribute this video." });
      const creatorId = String(user._id);
      const expiry = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      const response = await axios.post<{ success: boolean; result?: { uid?: string; uploadURL?: string }; errors?: Array<{ message?: string }> }>(`https://api.cloudflare.com/client/v4/accounts/${env.cloudflare_stream_account_id}/stream/direct_upload`, {
        maxDurationSeconds,
        expiry,
        creator: creatorId.slice(0, 64),
        requireSignedURLs: false,
        meta: { name: fileName, smajTitle: title },
      }, { headers: { Authorization: `Bearer ${env.cloudflare_stream_api_token}`, "Content-Type": "application/json" }, timeout: 15_000 });
      const uid = response.data.result?.uid;
      const uploadURL = response.data.result?.uploadURL;
      if (!response.data.success || !uid || !uploadURL) throw new Error(response.data.errors?.[0]?.message || "Cloudflare did not create an upload URL.");
      const now = new Date();
      const record = { cloudflareUid: uid, creatorId, creatorName: user.displayName || user.username || user.piUsername || "Creator", title, description, category, visibility, fileName, fileSize, rightsConfirmed: true, rightsConfirmedAt: now, processingStatus: "awaiting_upload", moderationStatus: "pending", playbackAllowed: false, createdAt: now, updatedAt: now };
      const result = await req.app.locals.streamContentCollection.insertOne(record);
      return res.status(201).json({ upload: { id: String(result.insertedId), uid, uploadURL, expiresAt: expiry, status: record.processingStatus } });
    } catch (error) {
      console.error("Failed to create Stream upload:", error);
      const message = axios.isAxiosError(error) ? String(error.response?.data?.errors?.[0]?.message || error.message) : error instanceof Error ? error.message : "Unable to create upload";
      return res.status(502).json({ error: "upload_session_failed", message });
    }
  });

  router.post("/creator/youtube", async (req, res) => {
    try {
      const user = await requireCreator(req, res); if (!user) return;
      const platformSettings = await req.app.locals.streamSettingsCollection?.findOne({ key: "platform" });
      if (platformSettings?.uploadsEnabled === false) return res.status(503).json({ error: "uploads_disabled", message: "Stream uploads are temporarily disabled by an administrator." });
      const videoId = youtubeVideoId(String(req.body?.youtubeUrl || ""));
      const title = String(req.body?.title || "").trim().slice(0, 140);
      const description = String(req.body?.description || "").trim().slice(0, 3000);
      const category = String(req.body?.category || "Entertainment").trim().slice(0, 60);
      const visibility = ["public", "unlisted", "private"].includes(req.body?.visibility) ? req.body.visibility : "private";
      if (!videoId) return res.status(400).json({ error: "invalid_youtube_url", message: "Enter a valid YouTube video, Short or embed URL." });
      if (!title || description.length < 20) return res.status(400).json({ error: "bad_request", message: "Add a title and a description of at least 20 characters." });
      if (req.body?.rightsConfirmed !== true) return res.status(400).json({ error: "rights_required", message: "Confirm that you own the video or have permission to publish it here." });
      const creatorId = String(user._id);
      const existing = await req.app.locals.streamContentCollection.findOne({ creatorId, youtubeVideoId: videoId });
      if (existing) return res.status(409).json({ error: "already_submitted", message: "This YouTube video is already in your content manager." });
      const now = new Date();
      const record = { cloudflareUid: `youtube-${creatorId}-${videoId}`, contentSource: "youtube", youtubeVideoId: videoId, creatorId, creatorName: user.displayName || user.username || user.piUsername || "Creator", title, description, category, visibility, rightsConfirmed: true, rightsConfirmedAt: now, processingStatus: "ready", moderationStatus: "pending", playbackAllowed: false, thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`, createdAt: now, updatedAt: now };
      const result = await req.app.locals.streamContentCollection.insertOne(record);
      return res.status(201).json({ video: { ...record, _id: String(result.insertedId) } });
    } catch (error) {
      return res.status(500).json({ error: "youtube_publish_failed", message: error instanceof Error ? error.message : "Unable to publish YouTube video" });
    }
  });

  router.post("/creator/live-inputs", async (req, res) => {
    try {
      const user = await requireCreator(req, res); if (!user) return;
      const platformSettings = await req.app.locals.streamSettingsCollection?.findOne({ key: "platform" });
      if (platformSettings?.liveStreamingEnabled === false) return res.status(503).json({ error: "live_disabled", message: "Live streaming is temporarily disabled by an administrator." });
      if (!env.cloudflare_stream_account_id || !env.cloudflare_stream_api_token) return res.status(503).json({ error: "cloudflare_stream_not_configured", message: "Add Cloudflare Stream credentials to the backend environment." });
      const title = String(req.body?.title || "").trim().slice(0, 140);
      const chatMode = ["enabled", "followers", "disabled"].includes(req.body?.chatMode) ? req.body.chatMode : "enabled";
      if (title.length < 3) return res.status(400).json({ error: "invalid_title", message: "Live stream title must contain at least three characters." });
      const creatorId = String(user._id);
      const response = await axios.post<{ success: boolean; result?: { uid?: string; rtmps?: { url?: string; streamKey?: string }; srt?: { url?: string; streamId?: string }; created?: string }; errors?: Array<{ message?: string }> }>(`https://api.cloudflare.com/client/v4/accounts/${env.cloudflare_stream_account_id}/stream/live_inputs`, {
        defaultCreator: creatorId.slice(0, 64), enabled: true, preferLowLatency: true,
        meta: { name: title, smajCreatorId: creatorId },
        recording: { mode: "automatic", requireSignedURLs: false, hideLiveViewerCount: false, timeoutSeconds: 0 },
      }, { headers: { Authorization: `Bearer ${env.cloudflare_stream_api_token}`, "Content-Type": "application/json" }, timeout: 15_000 });
      const remote = response.data.result;
      if (!response.data.success || !remote?.uid || !remote.rtmps?.url || !remote.rtmps.streamKey) throw new Error(response.data.errors?.[0]?.message || "Cloudflare did not create live credentials.");
      const now = new Date();
      const record = { cloudflareUid: remote.uid, liveInputUid: remote.uid, contentSource: "cloudflare-live", contentType: "live", creatorId, creatorName: user.displayName || user.username || user.piUsername || "Creator", title, description: "Live broadcast", category: "Live", chatMode, visibility: "private", rightsConfirmed: true, rightsConfirmedAt: now, processingStatus: "idle", moderationStatus: "pending", playbackAllowed: false, createdAt: now, updatedAt: now };
      await req.app.locals.streamContentCollection.insertOne(record);
      return res.status(201).json({ live: { ...record, credentials: { rtmpsUrl: remote.rtmps.url, streamKey: remote.rtmps.streamKey, srtUrl: remote.srt?.url || null, srtStreamId: remote.srt?.streamId || null } } });
    } catch (error) {
      const message = axios.isAxiosError(error) ? String(error.response?.data?.errors?.[0]?.message || error.message) : error instanceof Error ? error.message : "Unable to create live input";
      return res.status(502).json({ error: "live_input_failed", message });
    }
  });

  router.get("/creator/live-inputs", async (req, res) => {
    const user = await requireCreator(req, res); if (!user) return;
    const live = await req.app.locals.streamContentCollection.find({ creatorId: String(user._id), contentType: "live" }).sort({ createdAt: -1 }).limit(50).toArray();
    return res.json({ live: live.map((item: Record<string, unknown>) => ({ ...item, _id: String(item._id) })) });
  });

  router.get("/creator/live-inputs/:uid/status", async (req, res) => {
    try {
      const user = await requireCreator(req, res); if (!user) return;
      const uid = String(req.params.uid || "");
      const live = await req.app.locals.streamContentCollection.findOne({ liveInputUid: uid, creatorId: String(user._id) });
      if (!live) return res.status(404).json({ error: "not_found", message: "Live input not found." });
      if (!env.cloudflare_stream_account_id || !env.cloudflare_stream_api_token) return res.status(503).json({ error: "cloudflare_stream_not_configured" });
      const response = await axios.get<{ success: boolean; result?: Array<{ uid?: string; status?: { state?: string }; playback?: { hls?: string; dash?: string }; preview?: string; thumbnail?: string }> }>(`https://api.cloudflare.com/client/v4/accounts/${env.cloudflare_stream_account_id}/stream/live_inputs/${encodeURIComponent(uid)}/videos`, { headers: { Authorization: `Bearer ${env.cloudflare_stream_api_token}` }, timeout: 12_000 });
      const active = (response.data.result || []).find(video => video.status?.state === "live-inprogress") || null;
      const processingStatus = active ? "live" : "idle";
      await req.app.locals.streamContentCollection.updateOne({ liveInputUid: uid }, { $set: { processingStatus, activeVideoUid: active?.uid || null, playback: active?.playback || null, thumbnailUrl: active?.thumbnail || live.thumbnailUrl || null, updatedAt: new Date() } });
      return res.json({ status: processingStatus, activeVideoUid: active?.uid || null, playback: active?.playback || null, preview: active?.preview || null });
    } catch (error) { return res.status(502).json({ error: "live_status_failed", message: error instanceof Error ? error.message : "Unable to refresh live status" }); }
  });

  router.post("/creator/videos/:uid/complete", async (req, res) => {
    const user = await requireCreator(req, res); if (!user) return;
    const uid = String(req.params.uid || "");
    const result = await req.app.locals.streamContentCollection.updateOne({ cloudflareUid: uid, creatorId: String(user._id) }, { $set: { processingStatus: "processing", updatedAt: new Date() } });
    if (!result.matchedCount) return res.status(404).json({ error: "not_found", message: "Video upload record not found." });
    return res.json({ uid, status: "processing", moderationStatus: "pending" });
  });

  router.get("/creator/videos", async (req, res) => {
    const user = await requireCreator(req, res); if (!user) return;
    const videos = await req.app.locals.streamContentCollection.find({ creatorId: String(user._id) }).sort({ createdAt: -1 }).limit(100).toArray();
    return res.json({ videos: videos.map((video: Record<string, unknown>) => ({ ...video, _id: String(video._id) })) });
  });

  router.get("/creator/overview", async (req, res) => {
    const user = await requireCreator(req, res); if (!user) return;
    const videos = await req.app.locals.streamContentCollection.find({ creatorId: String(user._id) }).sort({ createdAt: -1 }).limit(1000).toArray();
    const count = (predicate: (video: Record<string, any>) => boolean) => videos.filter(predicate).length;
    const totalViews = videos.reduce((total: number, video: Record<string, any>) => total + Math.max(0, Number(video.views) || 0), 0);
    const watchSeconds = videos.reduce((total: number, video: Record<string, any>) => total + Math.max(0, Number(video.watchSeconds) || 0), 0);
    return res.json({ stats: { totalVideos: videos.length, publishedVideos: count(video => video.visibility === "public" && video.moderationStatus === "approved" && video.playbackAllowed === true), pendingVideos: count(video => !video.moderationStatus || video.moderationStatus === "pending"), rejectedVideos: count(video => video.moderationStatus === "rejected"), liveStreams: count(video => video.contentType === "live"), totalViews, watchSeconds, averageViewSeconds: totalViews > 0 ? Math.round(watchSeconds / totalViews) : 0, latestUploadAt: videos[0]?.createdAt || null }, monetization: { enabled: false, reason: "Creator monetization and Pi payouts are not enabled yet." } });
  });

  router.post("/creator/posts", async (req, res) => {
    const user = await requireCreator(req, res); if (!user) return;
    if (!req.app.locals.streamPostCollection) return res.status(503).json({ error: "service_unavailable", message: "Stream posts storage is not ready." });
    const stored = await req.app.locals.userCollection.findOne({ _id: user._id });
    const profile = stored?.streamProfile || {};
    const handle = String(profile.channelHandle || "").trim();
    const body = String(req.body?.body || "").trim().slice(0, 800);
    const visibility = req.body?.visibility === "followers" ? "followers" : "public";
    if (!handle) return res.status(400).json({ error: "channel_required", message: "Set your channel handle before posting." });
    if (body.length < 2) return res.status(400).json({ error: "post_required", message: "Write something before posting." });
    const now = new Date();
    const post = {
      creatorId: String(user._id),
      creatorName: profile.channelName || user.displayName || user.username || "SMAJ Creator",
      channelHandle: handle,
      body,
      visibility,
      createdAt: now,
      updatedAt: now,
    };
    const result = await req.app.locals.streamPostCollection.insertOne(post);
    return res.status(201).json({ post: publicPost({ ...post, _id: result.insertedId }) });
  });

  router.get("/creator/posts", async (req, res) => {
    const user = await requireCreator(req, res); if (!user) return;
    if (!req.app.locals.streamPostCollection) return res.json({ posts: [] });
    const posts = await req.app.locals.streamPostCollection.find({ creatorId: String(user._id) }).sort({ createdAt: -1 }).limit(20).toArray();
    return res.json({ posts: posts.map(publicPost) });
  });

  router.get("/creator-content", async (req, res) => {
    if (!req.app.locals.streamContentCollection) return res.json({ videos: [] });
    const videos = await req.app.locals.streamContentCollection.find({ visibility: "public", moderationStatus: "approved", playbackAllowed: true }).sort({ createdAt: -1 }).limit(20).toArray();
    return res.json({ videos: videos.map((video: Record<string, unknown>) => ({ _id: String(video._id), title: video.title, creatorName: video.creatorName, category: video.category, thumbnailUrl: video.thumbnailUrl, youtubeVideoId: video.youtubeVideoId, cloudflareUid: video.cloudflareUid, contentSource: video.contentSource, createdAt: video.createdAt })) });
  });

  router.get("/creators", async (req, res) => {
    const users = await req.app.locals.userCollection
      .find({ "streamProfile.channelHandle": { $regex: ".+" } })
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(200)
      .toArray();
    const creators = await Promise.all(
      users.map(async (user: Record<string, unknown>) => {
        const creatorId = String(user._id);
        const profile = (user?.streamProfile || {}) as Record<string, unknown>;
        const handle = String(profile.channelHandle || "").trim();
        if (!handle) return null;
        const videos = req.app.locals.streamContentCollection
          ? await req.app.locals.streamContentCollection
              .find({ creatorId, visibility: "public", moderationStatus: "approved", playbackAllowed: true })
              .sort({ createdAt: -1 })
              .limit(12)
              .toArray()
          : [];
        const publicVideos = videos.filter((video: Record<string, unknown>) => video.contentType !== "live");
        const followers = await req.app.locals.userCollection.countDocuments({ "streamSubscriptions.handle": handle });
        return {
          creatorId,
          channel: {
            name: profile.channelName || user?.displayName || user?.username || "SMAJ Creator",
            handle,
            description: profile.channelDescription || "",
            avatarUrl: profile.avatarUrl || user?.avatarUrl || "",
            bannerUrl: profile.channelBannerUrl || "",
          },
          stats: {
            videos: publicVideos.length,
            live: videos.filter((video: Record<string, unknown>) => video.contentType === "live").length,
            latestAt: videos[0]?.createdAt || null,
            followers,
          },
          latestVideos: publicVideos.slice(0, 3).map((video: Record<string, unknown>) => ({ _id: String(video._id), title: video.title, category: video.category, thumbnailUrl: video.thumbnailUrl || null, youtubeVideoId: video.youtubeVideoId, cloudflareUid: video.cloudflareUid, createdAt: video.createdAt })),
        };
      })
    );
    const visibleCreators = creators.filter(Boolean);
    return res.json({ creators: visibleCreators });
  });

  router.get("/channels/:handle", async (req, res) => {
    const handle = String(req.params.handle || "").trim().replace(/^@/, "").slice(0, 40);
    if (!handle) return res.status(400).json({ error: "invalid_handle", message: "A channel handle is required." });
    const creator = await req.app.locals.userCollection.findOne({ "streamProfile.channelHandle": handle });
    if (!creator) return res.status(404).json({ error: "channel_not_found", message: "This creator channel does not exist." });
    const creatorId = String(creator._id);
    const videos = await req.app.locals.streamContentCollection.find({ creatorId, visibility: "public", moderationStatus: "approved", playbackAllowed: true }).sort({ createdAt: -1 }).limit(60).toArray();
    const posts = req.app.locals.streamPostCollection
      ? await req.app.locals.streamPostCollection.find({ creatorId, visibility: "public" }).sort({ createdAt: -1 }).limit(40).toArray()
      : [];
    const profile = creator.streamProfile || {};
    const followers = await req.app.locals.userCollection.countDocuments({ "streamSubscriptions.handle": handle });
    return res.json({
      channel: {
        name: profile.channelName || creator.displayName || creator.username || "SMAJ Creator",
        handle,
        description: profile.channelDescription || "",
        avatarUrl: profile.avatarUrl || creator.avatarUrl || "",
        bannerUrl: profile.channelBannerUrl || "",
      },
      posts: posts.map(publicPost),
      videos: videos.filter((video: Record<string, unknown>) => video.contentType !== "live").map((video: Record<string, unknown>) => ({ _id: String(video._id), title: video.title, description: video.description, category: video.category, thumbnailUrl: video.thumbnailUrl || null, youtubeVideoId: video.youtubeVideoId, cloudflareUid: video.cloudflareUid, contentSource: video.contentSource, createdAt: video.createdAt })),
      live: videos.filter((video: Record<string, unknown>) => video.contentType === "live").map((video: Record<string, unknown>) => ({ liveInputUid: video.liveInputUid, title: video.title, thumbnailUrl: video.thumbnailUrl || null, processingStatus: video.processingStatus })),
      stats: { followers, videos: videos.filter((video: Record<string, unknown>) => video.contentType !== "live").length, live: videos.filter((video: Record<string, unknown>) => video.contentType === "live").length, joinedAt: creator.createdAt || null },
    });
  });

  router.get("/subscriptions", async (req, res) => {
    const user = await requireViewer(req, res); if (!user) return;
    const stored = await req.app.locals.userCollection.findOne({ _id: user._id });
    const subscriptions = Array.isArray(stored?.streamSubscriptions) ? stored.streamSubscriptions.slice(0, 200) : [];
    const channels = (await Promise.all(subscriptions.map(async (subscription: { creatorId?: string; handle?: string; subscribedAt?: Date }) => {
      const handle = String(subscription.handle || "");
      const creator = handle ? await req.app.locals.userCollection.findOne({ "streamProfile.channelHandle": handle }) : null;
      if (!creator) return null;
      const creatorId = String(creator._id);
      const profile = creator.streamProfile || {};
      const videos = await req.app.locals.streamContentCollection.find({ creatorId, visibility: "public", moderationStatus: "approved", playbackAllowed: true }).sort({ createdAt: -1 }).limit(12).toArray();
      const posts = req.app.locals.streamPostCollection
        ? await req.app.locals.streamPostCollection.find({ creatorId, visibility: "public" }).sort({ createdAt: -1 }).limit(6).toArray()
        : [];
      return {
        creatorId,
        subscribedAt: subscription.subscribedAt || null,
        channel: { name: profile.channelName || creator.displayName || creator.username || "SMAJ Creator", handle, avatarUrl: profile.avatarUrl || creator.avatarUrl || "" },
        posts: posts.map(publicPost),
        videos: videos.map((video: Record<string, unknown>) => ({ _id: String(video._id), title: video.title, category: video.category, thumbnailUrl: video.thumbnailUrl || null, youtubeVideoId: video.youtubeVideoId, cloudflareUid: video.cloudflareUid, contentType: video.contentType, liveInputUid: video.liveInputUid, processingStatus: video.processingStatus, createdAt: video.createdAt })),
      };
    }))).filter(Boolean);
    return res.json({ channels });
  });

  router.get("/subscriptions/:handle/status", async (req, res) => {
    const user = await requireViewer(req, res); if (!user) return;
    const handle = String(req.params.handle || "").trim().replace(/^@/, "").slice(0, 40);
    const stored = await req.app.locals.userCollection.findOne({ _id: user._id });
    const subscribed = (Array.isArray(stored?.streamSubscriptions) ? stored.streamSubscriptions : []).some((item: { handle?: string }) => String(item.handle || "").toLowerCase() === handle.toLowerCase());
    return res.json({ subscribed });
  });

  router.post("/subscriptions/:handle", async (req, res) => {
    const user = await requireViewer(req, res); if (!user) return;
    const handle = String(req.params.handle || "").trim().replace(/^@/, "").slice(0, 40);
    if (!handle) return res.status(400).json({ error: "invalid_handle", message: "A channel handle is required." });
    const creator = await req.app.locals.userCollection.findOne({ "streamProfile.channelHandle": handle });
    if (!creator) return res.status(404).json({ error: "channel_not_found", message: "This creator channel does not exist." });
    if (String(creator._id) === String(user._id)) return res.status(400).json({ error: "self_subscription", message: "You cannot subscribe to your own channel." });
    await req.app.locals.userCollection.updateOne({ _id: user._id }, { $pull: { streamSubscriptions: { handle } } });
    await req.app.locals.userCollection.updateOne({ _id: user._id }, { $addToSet: { streamSubscriptions: { creatorId: String(creator._id), handle, subscribedAt: new Date() } } });
    return res.status(201).json({ subscribed: true });
  });

  router.delete("/subscriptions/:handle", async (req, res) => {
    const user = await requireViewer(req, res); if (!user) return;
    const handle = String(req.params.handle || "").trim().replace(/^@/, "").slice(0, 40);
    await req.app.locals.userCollection.updateOne({ _id: user._id }, { $pull: { streamSubscriptions: { handle } } });
    return res.json({ subscribed: false });
  });

  const publicReview = (review: Record<string, any>) => ({
    _id: String(review._id),
    mediaType: review.mediaType,
    tmdbId: review.tmdbId,
    title: review.title,
    posterUrl: review.posterUrl || null,
    rating: review.rating,
    body: review.body,
    likes: Array.isArray(review.likedBy) ? review.likedBy.length : Number(review.likes) || 0,
    comments: Number(review.comments) || 0,
    reviewer: review.reviewer,
    createdAt: review.createdAt,
    updatedAt: review.updatedAt,
  });

  router.get("/reviews/popular", async (req, res) => {
    if (!req.app.locals.streamReviewCollection) return res.json({ reviews: [] });
    const limit = Math.max(1, Math.min(20, Number(req.query.limit) || 10));
    const reviews = await req.app.locals.streamReviewCollection
      .find({ status: "approved" })
      .sort({ popularityScore: -1, createdAt: -1 })
      .limit(limit)
      .toArray();
    return res.json({ reviews: reviews.map(publicReview) });
  });

  router.get("/reviews/title/:type/:id", async (req, res) => {
    if (!req.app.locals.streamReviewCollection) return res.json({ reviews: [] });
    const mediaType = req.params.type === "tv" ? "tv" : "movie";
    const tmdbId = Number(req.params.id);
    if (!Number.isInteger(tmdbId) || tmdbId < 1) return res.status(400).json({ error: "invalid_title" });
    const reviews = await req.app.locals.streamReviewCollection
      .find({ mediaType, tmdbId, status: "approved" })
      .sort({ popularityScore: -1, createdAt: -1 })
      .limit(50)
      .toArray();
    return res.json({ reviews: reviews.map(publicReview) });
  });

  router.post("/reviews/title/:type/:id", async (req, res) => {
    const user = await requireViewer(req, res); if (!user) return;
    if (!req.app.locals.streamReviewCollection) return res.status(503).json({ error: "service_unavailable" });
    const mediaType = req.params.type === "tv" ? "tv" : "movie";
    const tmdbId = Number(req.params.id);
    const rating = Number(req.body?.rating);
    const body = String(req.body?.body || "").trim().slice(0, 1200);
    const title = String(req.body?.title || "").trim().slice(0, 180);
    const posterUrl = String(req.body?.posterUrl || "").trim().slice(0, 800);
    if (!Number.isInteger(tmdbId) || tmdbId < 1 || !Number.isInteger(rating) || rating < 1 || rating > 5 || body.length < 10 || !title)
      return res.status(400).json({ error: "invalid_review", message: "Choose 1–5 stars and write at least 10 characters." });
    const now = new Date();
    const reviewer = {
      id: String(user._id),
      name: user.displayName || user.username || user.piUsername || "SMAJ viewer",
      avatarUrl: user.avatar || "",
    };
    await req.app.locals.streamReviewCollection.updateOne(
      { userId: String(user._id), mediaType, tmdbId },
      { $set: { mediaType, tmdbId, title, posterUrl, rating, body, reviewer, status: "approved", updatedAt: now }, $setOnInsert: { userId: String(user._id), likedBy: [], comments: 0, popularityScore: 0, createdAt: now } },
      { upsert: true },
    );
    const review = await req.app.locals.streamReviewCollection.findOne({ userId: String(user._id), mediaType, tmdbId });
    return res.status(201).json({ review: publicReview(review) });
  });

  router.post("/reviews/:id/like", async (req, res) => {
    const user = await requireViewer(req, res); if (!user) return;
    if (!req.app.locals.streamReviewCollection || !ObjectId.isValid(req.params.id)) return res.status(404).json({ error: "review_not_found" });
    const _id = new ObjectId(req.params.id);
    const review = await req.app.locals.streamReviewCollection.findOne({ _id, status: "approved" });
    if (!review) return res.status(404).json({ error: "review_not_found" });
    const userId = String(user._id);
    const liked = Array.isArray(review.likedBy) && review.likedBy.includes(userId);
    await req.app.locals.streamReviewCollection.updateOne(
      { _id },
      liked ? { $pull: { likedBy: userId }, $inc: { popularityScore: -1 } } : { $addToSet: { likedBy: userId }, $inc: { popularityScore: 1 } },
    );
    return res.json({ liked: !liked, likes: Math.max(0, (review.likedBy?.length || 0) + (liked ? -1 : 1)) });
  });

  router.get("/live-content", async (req, res) => {
    delete req.headers["if-none-match"];
    delete req.headers["if-modified-since"];
    res.set({
      "Cache-Control": "no-store, no-cache, must-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    });
    const items = req.app.locals.streamContentCollection
      ? await req.app.locals.streamContentCollection.find({ contentType: "live", visibility: "public", moderationStatus: "approved", playbackAllowed: true }).sort({ updatedAt: -1 }).limit(50).toArray()
      : [];
    const creatorLive = items.map((item: Record<string, unknown>) => ({ liveInputUid: item.liveInputUid, title: item.title, creatorName: item.creatorName, processingStatus: item.processingStatus, thumbnailUrl: item.thumbnailUrl || null, chatMode: item.chatMode, contentSource: "cloudflare" }));
    const youtubeLive = cachedYoutubeLiveChannels();
    return res.json({ live: [...youtubeLive, ...creatorLive] });
  });

  router.post("/admin/live-content/refresh", async (req, res) => {
    const admin = await requireStreamAdmin(req, res); if (!admin) return;
    const now = Date.now();
    const retryAfterMs = YOUTUBE_MANUAL_REFRESH_COOLDOWN_MS - (now - lastManualYoutubeRefreshAt);
    if (retryAfterMs > 0) {
      res.set("Retry-After", String(Math.ceil(retryAfterMs / 1000)));
      return res.status(429).json({ error: "refresh_rate_limited", message: "YouTube live refresh is available once every five minutes.", retryAfterSeconds: Math.ceil(retryAfterMs / 1000) });
    }
    lastManualYoutubeRefreshAt = now;
    await refreshYoutubeLiveCache();
    const live = cachedYoutubeLiveChannels();
    return res.json({ refreshed: true, liveChannels: live.length, lastCheckedAt: new Date().toISOString() });
  });

  router.get("/creator/videos/:uid/status", async (req, res) => {
    try {
      const user = await requireCreator(req, res); if (!user) return;
      const uid = String(req.params.uid || "");
      const video = await req.app.locals.streamContentCollection.findOne({ cloudflareUid: uid, creatorId: String(user._id) });
      if (!video) return res.status(404).json({ error: "not_found", message: "Video not found." });
      if (!env.cloudflare_stream_account_id || !env.cloudflare_stream_api_token) return res.json({ video });
      const response = await axios.get<{ success: boolean; result?: { readyToStream?: boolean; status?: { state?: string; errorReasonText?: string }; playback?: { hls?: string; dash?: string }; thumbnail?: string; duration?: number } }>(`https://api.cloudflare.com/client/v4/accounts/${env.cloudflare_stream_account_id}/stream/${uid}`, { headers: { Authorization: `Bearer ${env.cloudflare_stream_api_token}` }, timeout: 12_000 });
      const remote = response.data.result;
      const processingStatus = remote?.readyToStream ? "ready" : remote?.status?.state || "processing";
      await req.app.locals.streamContentCollection.updateOne({ cloudflareUid: uid }, { $set: { processingStatus, playback: remote?.playback || null, thumbnailUrl: remote?.thumbnail || null, duration: remote?.duration || null, processingError: remote?.status?.errorReasonText || null, updatedAt: new Date() } });
      return res.json({ video: { ...video, processingStatus, playback: remote?.playback || null, thumbnailUrl: remote?.thumbnail || null, duration: remote?.duration || null } });
    } catch (error) {
      return res.status(502).json({ error: "status_failed", message: error instanceof Error ? error.message : "Unable to refresh video status" });
    }
  });

  router.get("/admin/videos", async (req, res) => {
    const admin = await requireStreamAdmin(req, res); if (!admin) return;
    const status = String(req.query.status || "all");
    const query = status === "all" ? {} : { moderationStatus: status };
    const videos = await req.app.locals.streamContentCollection.find(query).sort({ createdAt: -1 }).limit(200).toArray();
    return res.json({ videos: videos.map((video: Record<string, unknown>) => ({ ...video, _id: String(video._id), playback: undefined })) });
  });

  router.post("/admin/internet-archive/import", async (req, res) => {
    const admin = await requireStreamAdmin(req, res); if (!admin) return;
    const identifier = String(req.body?.identifier || "").trim();
    const tmdbId = Number(req.body?.tmdbId);
    const mediaType = req.body?.mediaType === "tv" ? "tv" : req.body?.mediaType === "movie" ? "movie" : null;
    const license = String(req.body?.license || "").trim().slice(0, 240);
    const rightsUrl = String(req.body?.rightsUrl || "").trim().slice(0, 800);
    const downloadAllowed = req.body?.downloadAllowed === true;
    if (!/^[A-Za-z0-9_.-]{1,160}$/.test(identifier) || !Number.isInteger(tmdbId) || tmdbId < 1 || !mediaType)
      return res.status(400).json({ error: "invalid_import", message: "Add a valid Archive identifier and TMDB title." });
    if (req.body?.rightsConfirmed !== true || license.length < 3 || !/^https:\/\//i.test(rightsUrl))
      return res.status(400).json({ error: "rights_required", message: "Confirm the rights and provide the license name and HTTPS evidence URL." });
    try {
      const response = await axios.get<{ metadata?: Record<string, unknown>; files?: Array<Record<string, unknown>> }>(`https://archive.org/metadata/${encodeURIComponent(identifier)}`, { timeout: 15_000 });
      const metadata = response.data.metadata || {};
      const files = response.data.files || [];
      const selected = selectPlayableArchiveFile(files);
      if (!selected?.name) return res.status(422).json({ error: "no_playable_source", message: NO_PLAYABLE_ARCHIVE_SOURCE_MESSAGE });
      const encodedName = String(selected.name).split("/").map(encodeURIComponent).join("/");
      const streamUrl = `https://archive.org/download/${encodeURIComponent(identifier)}/${encodedName}`;
      const now = new Date();
      const record = {
        cloudflareUid: `ia-${identifier}`,
        contentSource: "internet_archive",
        archiveIdentifier: identifier,
        title: String(metadata.title || req.body?.title || "Internet Archive film").slice(0, 180),
        description: String(metadata.description || "").replace(/<[^>]+>/g, " ").slice(0, 2000),
        creatorName: String(metadata.creator || "Internet Archive").slice(0, 120),
        thumbnailUrl: `https://archive.org/services/img/${encodeURIComponent(identifier)}`,
        playback: { mp4: streamUrl },
        downloadUrl: downloadAllowed ? streamUrl : null,
        downloadAllowed,
        license,
        rightsUrl,
        rightsConfirmed: true,
        rightsConfirmedAt: now,
        rightsConfirmedBy: String(admin._id),
        processingStatus: "ready",
        moderationStatus: "approved",
        visibility: "public",
        playbackAllowed: true,
        catalogAttachment: { tmdbId, mediaType, title: String(req.body?.title || metadata.title || "").slice(0, 140), attachedAt: now, attachedBy: String(admin._id) },
        updatedAt: now,
      };
      await req.app.locals.streamContentCollection.updateOne({ cloudflareUid: record.cloudflareUid }, { $set: record, $setOnInsert: { createdAt: now } }, { upsert: true });
      return res.status(201).json({ video: { ...record, playback: undefined } });
    } catch (error) {
      const status = Number((error as { response?: { status?: number } }).response?.status || 502);
      return res.status(status).json({ error: "archive_lookup_failed", message: "Internet Archive metadata could not be verified." });
    }
  });

  router.get("/admin/overview", async (req, res) => {
    const admin = await requireStreamAdmin(req, res); if (!admin) return;
    const videos = await req.app.locals.streamContentCollection.find({}).sort({ updatedAt: -1, createdAt: -1 }).limit(1000).toArray();
    const creators = new Map<string, { id: string; name: string; videos: number; approved: number; live: number; latestAt: unknown }>();
    videos.forEach((video: Record<string, any>) => {
      const id = String(video.creatorId || video.creatorName || "unknown");
      const current = creators.get(id) || { id, name: String(video.creatorName || "Unknown creator"), videos: 0, approved: 0, live: 0, latestAt: video.updatedAt || video.createdAt || null };
      current.videos += 1;
      if (video.moderationStatus === "approved") current.approved += 1;
      if (video.contentType === "live") current.live += 1;
      creators.set(id, current);
    });
    const count = (predicate: (video: Record<string, any>) => boolean) => videos.filter(predicate).length;
    return res.json({
      stats: {
        totalVideos: videos.length,
        pendingVideos: count(video => !video.moderationStatus || video.moderationStatus === "pending"),
        approvedVideos: count(video => video.moderationStatus === "approved"),
        rejectedVideos: count(video => video.moderationStatus === "rejected"),
        publishedVideos: count(video => video.visibility === "public" && video.moderationStatus === "approved" && video.playbackAllowed === true),
        liveStreams: count(video => video.contentType === "live"),
        readyVideos: count(video => video.processingStatus === "ready"),
        attachedTitles: count(video => Boolean(video.catalogAttachment)),
        creators: creators.size,
      },
      creators: [...creators.values()].sort((a, b) => b.videos - a.videos),
      recent: videos.slice(0, 12).map((video: Record<string, unknown>) => ({ ...video, _id: String(video._id), playback: undefined })),
      updatedAt: new Date().toISOString(),
    });
  });

  router.post('/upload-url', async (req, res) => {
    const admin = await requireStreamAdmin(req, res); if (!admin) return;
    if (!env.cloudflare_stream_account_id || !env.cloudflare_stream_api_token) return res.status(503).json({ error: 'cloudflare_stream_not_configured', message: 'Cloudflare Stream is not configured on the backend.' });
    const tmdbId = Number(req.body?.tmdbId); const fileSize = Number(req.body?.fileSize);
    const fileName = String(req.body?.fileName || 'movie.mp4').trim().slice(0, 180);
    const maxDurationSeconds = Math.max(60, Math.min(28_800, Number(req.body?.maxDurationSeconds) || 14_400));
    if (!Number.isInteger(tmdbId) || tmdbId < 1) return res.status(400).json({ error: 'invalid_movie', message: 'Choose a valid TMDB movie.' });
    if (!Number.isSafeInteger(fileSize) || fileSize < 1 || fileSize > 30 * 1024 * 1024 * 1024) return res.status(400).json({ error: 'invalid_file', message: 'Choose a video file smaller than 30 GB.' });
    try {
      const movie = await tmdbGet<TmdbMedia & { genres?: Array<{ id: number; name: string }> }>(`/movie/${tmdbId}`, { language: 'en-US' });
      const uploadMetadata = [['name', fileName], ['maxdurationseconds', String(maxDurationSeconds)], ['requiresignedurls', 'false']].map(([key, value]) => `${key} ${Buffer.from(value).toString('base64')}`).join(',');
      const cloudflare = await axios.post(`https://api.cloudflare.com/client/v4/accounts/${env.cloudflare_stream_account_id}/stream?direct_user=true`, null, {
        headers: { Authorization: `Bearer ${env.cloudflare_stream_api_token}`, 'Tus-Resumable': '1.0.0', 'Upload-Length': String(fileSize), 'Upload-Metadata': uploadMetadata },
        timeout: 15_000, maxRedirects: 0, validateStatus: status => status === 201,
      });
      const uploadURL = String(cloudflare.headers.location || ''); const uid = String(cloudflare.headers['stream-media-id'] || '');
      if (!uploadURL || !uid) throw new Error('Cloudflare created no TUS upload location or Stream UID.');
      const now = new Date(); const title = String(movie.title || 'TMDB movie').slice(0, 180);
      const record = { cloudflareUid: uid, contentSource: 'cloudflare_stream', contentType: 'movie', tmdbId, title, description: String(movie.overview || '').slice(0, 4000), overview: String(movie.overview || '').slice(0, 4000), posterPath: movie.poster_path || null, backdropPath: movie.backdrop_path || null, releaseDate: movie.release_date || null, year: movie.release_date ? Number(movie.release_date.slice(0, 4)) || null : null, genres: Array.isArray(movie.genres) ? movie.genres.map(genre => ({ id: genre.id, name: genre.name })) : [], rating: Number.isFinite(movie.vote_average) ? movie.vote_average : null, fileName, fileSize, uploadProtocol: 'tus', status: 'preparing', processingStatus: 'preparing', processingError: null, moderationStatus: 'approved', visibility: 'private', playbackAllowed: false, downloadAllowed: false, creatorName: 'SMAJ Stream', catalogAttachment: { tmdbId, mediaType: 'movie', title, attachedAt: now, attachedBy: String(admin._id) }, updatedAt: now, createdAt: now };
      await req.app.locals.streamContentCollection.insertOne(record);
      return res.status(201).json({ uid, uploadURL, protocol: 'tus', status: 'preparing' });
    } catch (error) {
      const responseData = axios.isAxiosError(error) ? error.response?.data as { errors?: Array<{ code?: number; message?: string }>; messages?: Array<{ code?: number; message?: string }> } | undefined : undefined;
      const diagnostics = { httpStatus: axios.isAxiosError(error) ? error.response?.status || null : null, errors: responseData?.errors || [], messages: responseData?.messages || [], errorCodes: [...(responseData?.errors || []), ...(responseData?.messages || [])].map(item => item.code).filter(code => code !== undefined) };
      console.error('[Cloudflare Stream TUS] upload URL request failed', diagnostics);
      const details = [...diagnostics.errors, ...diagnostics.messages].map(item => item.message).filter(Boolean).join(' ');
      const message = details || (error instanceof Error ? error.message : 'Cloudflare rejected the TUS upload request.');
      const status = diagnostics.httpStatus && diagnostics.httpStatus >= 400 && diagnostics.httpStatus < 500 ? diagnostics.httpStatus : 502;
      return res.status(status).json({ error: 'cloudflare_upload_url_failed', message, cloudflare: { httpStatus: diagnostics.httpStatus, errors: diagnostics.errors, messages: diagnostics.messages, errorCodes: diagnostics.errorCodes } });
    }
  });

  router.post('/admin/cloudflare/movies/:uid/complete', async (req, res) => {
    const admin = await requireStreamAdmin(req, res); if (!admin) return;
    const uid = String(req.params.uid || '').slice(0, 180);
    const result = await req.app.locals.streamContentCollection.updateOne({ cloudflareUid: uid, contentSource: 'cloudflare_stream' }, { $set: { status: 'processing', processingStatus: 'processing', updatedAt: new Date() } });
    if (!result.matchedCount) return res.status(404).json({ error: 'upload_not_found' });
    return res.json({ uid, status: 'processing' });
  });

  router.get('/admin/cloudflare/movies/:uid/status', async (req, res) => {
    const admin = await requireStreamAdmin(req, res); if (!admin) return;
    const uid = String(req.params.uid || '').slice(0, 180);
    const movie = await req.app.locals.streamContentCollection.findOne({ cloudflareUid: uid, contentSource: 'cloudflare_stream' });
    if (!movie) return res.status(404).json({ error: 'not_found', message: 'Movie upload not found.' });
    try {
      const response = await axios.get<{ success: boolean; result?: { readyToStream?: boolean; status?: { state?: string; errorReasonText?: string }; playback?: { hls?: string; dash?: string }; thumbnail?: string; duration?: number } }>(`https://api.cloudflare.com/client/v4/accounts/${env.cloudflare_stream_account_id}/stream/${encodeURIComponent(uid)}`, { headers: { Authorization: `Bearer ${env.cloudflare_stream_api_token}` }, timeout: 12_000 });
      const remote = response.data.result; const failed = remote?.status?.state === 'error'; const ready = remote?.readyToStream === true && Boolean(remote.playback?.hls);
      const updates = ready ? { status: 'ready', processingStatus: 'ready', processingError: null, visibility: 'private', moderationStatus: 'approved', playbackAllowed: false, playback: remote?.playback, thumbnailUrl: remote?.thumbnail || movie.thumbnailUrl || null, duration: remote?.duration || movie.duration || null, updatedAt: new Date() } : failed ? { status: 'failed', processingStatus: 'error', processingError: remote?.status?.errorReasonText || 'Cloudflare could not process this video.', visibility: 'private', playbackAllowed: false, updatedAt: new Date() } : { status: 'processing', processingStatus: 'processing', updatedAt: new Date() };
      await req.app.locals.streamContentCollection.updateOne({ cloudflareUid: uid }, { $set: updates });
      return res.json({ uid, ready, status: updates.processingStatus, error: failed ? updates.processingError : null });
    } catch (error) {
      const data = axios.isAxiosError(error) ? error.response?.data as { errors?: unknown[]; messages?: unknown[] } | undefined : undefined;
      console.error('[Cloudflare Stream] status request failed', { httpStatus: axios.isAxiosError(error) ? error.response?.status || null : null, errors: data?.errors || [], messages: data?.messages || [] });
      return res.status(502).json({ error: 'cloudflare_status_failed', message: error instanceof Error ? error.message : 'Could not check Cloudflare Stream processing.' });
    }
  });

  router.post('/admin/cloudflare/movies/:uid/publish', async (req, res) => {
    const admin = await requireStreamAdmin(req, res); if (!admin) return;
    const uid = String(req.params.uid || '').slice(0, 180);
    const movie = await req.app.locals.streamContentCollection.findOne({ cloudflareUid: uid, contentSource: 'cloudflare_stream' });
    if (!movie) return res.status(404).json({ error: 'not_found', message: 'Movie upload not found.' });
    if (movie.processingStatus !== 'ready' || !movie.playback?.hls) return res.status(409).json({ error: 'not_ready', message: 'Cloudflare is still processing this movie.' });
    await req.app.locals.streamContentCollection.updateOne({ cloudflareUid: uid }, { $set: { status: 'published', visibility: 'public', moderationStatus: 'approved', playbackAllowed: true, publishedAt: new Date(), updatedAt: new Date() } });
    await req.app.locals.streamContentCollection.deleteMany({ 'catalogAttachment.tmdbId': movie.catalogAttachment?.tmdbId, 'catalogAttachment.mediaType': 'movie', contentSource: 'cloudflare_stream', cloudflareUid: { $ne: uid } });
    return res.json({ uid, status: 'published', playbackAllowed: true });
  });

  const defaultStreamSettings = {
    uploadsEnabled: true,
    liveStreamingEnabled: true,
    piSupportEnabled: true,
    automaticModerationEnabled: true,
  };

  router.get("/admin/settings", async (req, res) => {
    const admin = await requireStreamAdmin(req, res); if (!admin) return;
    const stored = await req.app.locals.streamSettingsCollection?.findOne({ key: "platform" });
    return res.json({ settings: { ...defaultStreamSettings, ...(stored || {}), _id: undefined, key: undefined } });
  });

  router.put("/admin/settings", async (req, res) => {
    const admin = await requireStreamAdmin(req, res); if (!admin) return;
    const settings = Object.fromEntries(
      Object.keys(defaultStreamSettings).map(key => [key, req.body?.[key] === true]),
    );
    await req.app.locals.streamSettingsCollection.updateOne(
      { key: "platform" },
      { $set: { ...settings, key: "platform", updatedAt: new Date(), updatedBy: String(admin._id) } },
      { upsert: true },
    );
    return res.json({ settings });
  });

  router.patch("/admin/videos/:uid", async (req, res) => {
    const admin = await requireStreamAdmin(req, res); if (!admin) return;
    const uid = String(req.params.uid || "").slice(0, 180);
    const video = await req.app.locals.streamContentCollection.findOne({ cloudflareUid: uid });
    if (!video) return res.status(404).json({ error: "not_found", message: "Stream video was not found." });
    const action = String(req.body?.action || "");
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (action === "approve") {
      if (video.rightsConfirmed !== true) return res.status(409).json({ error: "rights_missing", message: "The creator has not confirmed distribution rights." });
      updates.moderationStatus = "approved"; updates.moderationReason = "";
    } else if (action === "reject") {
      const reason = String(req.body?.reason || "").trim().slice(0, 500);
      if (reason.length < 5) return res.status(400).json({ error: "reason_required", message: "Add a clear rejection reason." });
      updates.moderationStatus = "rejected"; updates.moderationReason = reason; updates.playbackAllowed = false;
    } else if (action === "playback") {
      if (req.body?.enabled === true && video.moderationStatus !== "approved") return res.status(409).json({ error: "approval_required", message: "Approve this video before enabling playback." });
      updates.playbackAllowed = req.body?.enabled === true;
    } else if (action === "visibility") {
      if (!["public", "unlisted", "private"].includes(req.body?.visibility)) return res.status(400).json({ error: "invalid_visibility" });
      updates.visibility = req.body.visibility;
    } else if (action === "attach") {
      const tmdbId = Number(req.body?.tmdbId);
      const mediaType = req.body?.mediaType === "tv" ? "tv" : req.body?.mediaType === "movie" ? "movie" : null;
      if (!Number.isInteger(tmdbId) || tmdbId <= 0 || !mediaType) return res.status(400).json({ error: "invalid_title", message: "Choose a valid TMDB movie or series." });
      updates.catalogAttachment = { tmdbId, mediaType, title: String(req.body?.title || "").slice(0, 140), attachedAt: new Date(), attachedBy: String(admin._id) };
    } else if (action === "detach") updates.catalogAttachment = null;
    else return res.status(400).json({ error: "invalid_action", message: "Choose a valid moderation action." });
    const auditEntry = { action, reason: updates.moderationReason || null, adminId: String(admin._id), adminName: admin.piUsername || admin.username || "Admin", createdAt: new Date() };
    const moderationHistory = [...(Array.isArray(video.moderationHistory) ? video.moderationHistory : []), auditEntry].slice(-100);
    await req.app.locals.streamContentCollection.updateOne({ cloudflareUid: uid }, { $set: { ...updates, moderationHistory } });
    const updated = await req.app.locals.streamContentCollection.findOne({ cloudflareUid: uid });
    return res.json({ video: { ...updated, _id: String(updated?._id), playback: undefined } });
  });

  router.get("/availability/:type(movie|tv)/:id", async (req, res) => {
    const user = await requireViewer(req, res); if (!user) return;
    if (!req.app.locals.streamContentCollection) return res.json({ available: false });
    const filter = { "catalogAttachment.tmdbId": Number(req.params.id), "catalogAttachment.mediaType": req.params.type };
    let video = await req.app.locals.streamContentCollection.findOne({ ...filter, visibility: "public", moderationStatus: "approved", playbackAllowed: true, processingStatus: "ready" }, { sort: { updatedAt: -1 } }) || await req.app.locals.streamContentCollection.findOne(filter, { sort: { updatedAt: -1 } });
    if (video?.contentSource === "cloudflare_stream" && video.processingStatus !== "ready" && env.cloudflare_stream_account_id && env.cloudflare_stream_api_token) {
      try {
        const response = await axios.get<{ result?: { readyToStream?: boolean; status?: { state?: string; errorReasonText?: string }; playback?: { hls?: string; dash?: string }; thumbnail?: string; duration?: number } }>(`https://api.cloudflare.com/client/v4/accounts/${env.cloudflare_stream_account_id}/stream/${encodeURIComponent(String(video.cloudflareUid))}`, { headers: { Authorization: `Bearer ${env.cloudflare_stream_api_token}` }, timeout: 12_000 });
        const remote = response.data.result;
        if (remote?.readyToStream && remote.playback?.hls) {
          const updates = { status: "ready", processingStatus: "ready", processingError: null, visibility: "private", moderationStatus: "approved", playbackAllowed: false, playback: remote.playback, thumbnailUrl: remote.thumbnail || video.thumbnailUrl || null, duration: remote.duration || video.duration || null, updatedAt: new Date() };
          await req.app.locals.streamContentCollection.updateOne({ cloudflareUid: video.cloudflareUid }, { $set: updates });
          video = { ...video, ...updates };
        } else if (remote?.status?.state === "error") {
          await req.app.locals.streamContentCollection.updateOne({ cloudflareUid: video.cloudflareUid }, { $set: { status: "failed", processingStatus: "error", processingError: remote.status.errorReasonText || "Cloudflare could not process this video.", visibility: "private", playbackAllowed: false, updatedAt: new Date() } });
        }
      } catch { /* Keep the safe unavailable state while Cloudflare is unreachable. */ }
    }
    if (!video || video.visibility !== "public" || video.moderationStatus !== "approved" || video.playbackAllowed !== true || video.processingStatus !== "ready") return res.json({ available: false, downloadAllowed: false });
    if (video.contentSource === "internet_archive" && !/^https:\/\/archive\.org\/download\//i.test(String(video.playback?.mp4 || ""))) return res.json({ available: false, downloadAllowed: false, message: NO_PLAYABLE_ARCHIVE_SOURCE_MESSAGE });
    const storedViewer = await req.app.locals.userCollection.findOne({ _id: user._id });
    const subscription = normalizeStreamSubscription(storedViewer?.streamSubscription);
    const paidDownloads = subscription.status === "active" && (subscription.plan === "plus" || subscription.plan === "family");
    const sourceAllowsDownload = video.contentSource === "cloudflare_stream" || video.downloadAllowed === true;
    return res.json({ available: true, playbackId: video.cloudflareUid, title: video.title, downloadAllowed: paidDownloads && sourceAllowsDownload });
  });

  router.get("/live/:uid/playback", async (req, res) => {
    const user = await requireViewer(req, res); if (!user) return;
    if (!req.app.locals.streamContentCollection) return res.status(503).json({ error: "service_unavailable" });
    const uid = String(req.params.uid || "");
    const live = await req.app.locals.streamContentCollection.findOne({ liveInputUid: uid, contentType: "live", visibility: "public", moderationStatus: "approved", playbackAllowed: true });
    if (!live) return res.status(404).json({ error: "not_available", message: "This live stream is not published." });
    if (!env.cloudflare_stream_account_id || !env.cloudflare_stream_api_token) return res.status(503).json({ error: "cloudflare_stream_not_configured" });
    try {
      const response = await axios.get<{ result?: Array<{ uid?: string; status?: { state?: string }; playback?: { hls?: string; dash?: string }; thumbnail?: string }> }>(`https://api.cloudflare.com/client/v4/accounts/${env.cloudflare_stream_account_id}/stream/live_inputs/${encodeURIComponent(uid)}/videos`, { headers: { Authorization: `Bearer ${env.cloudflare_stream_api_token}` }, timeout: 12_000 });
      const active = (response.data.result || []).find(video => video.status?.state === "live-inprogress");
      if (!active?.playback?.hls) return res.status(409).json({ error: "not_live", message: "This broadcast has not started yet." });
      return res.json({ live: { id: uid, title: live.title, creatorName: live.creatorName, chatMode: live.chatMode, playbackUrl: active.playback.hls, thumbnailUrl: active.thumbnail || live.thumbnailUrl || null } });
    } catch (error) { return res.status(502).json({ error: "live_playback_failed", message: error instanceof Error ? error.message : "Unable to load live playback" }); }
  });

  // Streams Internet Archive video bytes through our own domain instead of the browser
  // hitting archive.org directly, since embedded/sandboxed webviews (e.g. the Pi Browser
  // sandbox) can silently block or mis-handle a cross-origin third-party media source.
  router.get("/archive-media/:uid", async (req, res) => {
    const uid = String(req.params.uid || "").slice(0, 180);
    if (!req.app.locals.streamContentCollection) return res.status(503).json({ error: "service_unavailable" });
    const video = await req.app.locals.streamContentCollection.findOne({ cloudflareUid: uid, contentSource: "internet_archive" });
    if (!video || video.visibility !== "public" || video.moderationStatus !== "approved" || video.playbackAllowed !== true)
      return res.status(404).json({ error: "not_available", message: "This video is not published or licensed for playback." });
    const archiveUrl = String(video.playback?.mp4 || "");
    if (!/^https:\/\/archive\.org\/download\//i.test(archiveUrl))
      return res.status(422).json({ error: "no_playable_source", message: NO_PLAYABLE_ARCHIVE_SOURCE_MESSAGE });
    try {
      const upstream = await axios.get<NodeJS.ReadableStream>(archiveUrl, {
        responseType: "stream",
        timeout: 20_000,
        maxRedirects: 5,
        headers: {
          ...(req.headers.range ? { Range: req.headers.range } : {}),
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        },
        validateStatus: status => status === 200 || status === 206,
      });
      res.status(upstream.status);
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Accept-Ranges", "bytes");
      ["content-type", "content-length", "content-range", "cache-control", "etag", "last-modified"].forEach(header => {
        const value = upstream.headers[header];
        if (value) res.setHeader(header, value);
      });
      upstream.data.on("error", () => res.end());
      upstream.data.pipe(res);
    } catch (error) {
      const axiosError = error as { response?: { status?: number; statusText?: string }; code?: string; message?: string };
      console.error("[archive-media]", uid, axiosError.response?.status, axiosError.response?.statusText, axiosError.code, axiosError.message);
      const status = Number(axiosError.response?.status || 502);
      if (!res.headersSent) return res.status(status).json({ error: "archive_stream_failed", message: "Unable to stream this video.", detail: `${axiosError.code || ""} ${axiosError.response?.status || ""} ${axiosError.message || ""}`.trim() });
      res.end();
    }
  });

  router.get("/playback/:uid", async (req, res) => {
    const user = await requireViewer(req, res); if (!user) return;
    const requestedUid = String(req.params.uid || "").slice(0, 180);
    const uid = requestedUid.replace(/^yt-/, "");
    if (requestedUid.startsWith("yt-")) {
      const officialLive = cachedYoutubeLiveChannels().find(item => item.youtubeVideoId === uid);
      if (officialLive) return res.json({ video: { id: requestedUid, sourceType: "youtube", youtubeVideoId: uid, title: officialLive.title, creatorName: officialLive.creatorName, thumbnailUrl: officialLive.thumbnailUrl, duration: null } });
    }
    if (!req.app.locals.streamContentCollection) return res.status(503).json({ error: "service_unavailable", message: "Stream playback is not ready." });
    let video = await req.app.locals.streamContentCollection.findOne({ cloudflareUid: uid });
    if (!video) video = await req.app.locals.streamContentCollection.findOne({ youtubeVideoId: uid });
    if (!video || video.visibility !== "public" || video.moderationStatus !== "approved" || video.playbackAllowed !== true) return res.status(404).json({ error: "not_available", message: "This video is not published or licensed for playback." });
    if (video.contentSource === "internet_archive") {
      const archivePlaybackUrl = String(video.playback?.mp4 || "");
      if (!/^https:\/\/archive\.org\/download\//i.test(archivePlaybackUrl))
        return res.status(422).json({ error: "no_playable_source", message: NO_PLAYABLE_ARCHIVE_SOURCE_MESSAGE });
      const proxyUrl = `${req.protocol}://${req.get("host")}/stream/archive-media/${encodeURIComponent(String(video.cloudflareUid))}`;
      return res.json({ video: { id: String(video.cloudflareUid), sourceType: "mp4", playbackUrl: proxyUrl, downloadUrl: video.downloadAllowed === true ? video.downloadUrl : null, downloadAllowed: video.downloadAllowed === true, title: video.title, description: video.description, creatorName: video.creatorName, thumbnailUrl: video.thumbnailUrl || null, duration: video.duration || null, license: video.license, rightsUrl: video.rightsUrl } });
    }
    if (video.contentSource === "youtube" && video.youtubeVideoId) return res.json({ video: { id: String(video.cloudflareUid), sourceType: "youtube", youtubeVideoId: video.youtubeVideoId, title: video.title, description: video.description, creatorName: video.creatorName, thumbnailUrl: video.thumbnailUrl, duration: video.duration || null } });
    let playback = video.playback as { hls?: string; dash?: string } | undefined;
    if ((!playback?.hls || video.processingStatus !== "ready") && env.cloudflare_stream_account_id && env.cloudflare_stream_api_token) {
      try {
        const remoteResponse = await axios.get<{ success: boolean; result?: { readyToStream?: boolean; playback?: { hls?: string; dash?: string }; thumbnail?: string; duration?: number } }>(`https://api.cloudflare.com/client/v4/accounts/${env.cloudflare_stream_account_id}/stream/${encodeURIComponent(String(video.cloudflareUid))}`, { headers: { Authorization: `Bearer ${env.cloudflare_stream_api_token}` }, timeout: 12_000 });
        const remote = remoteResponse.data.result;
        if (remote?.readyToStream && remote.playback?.hls) {
          playback = remote.playback;
          await req.app.locals.streamContentCollection.updateOne({ cloudflareUid: video.cloudflareUid }, { $set: { processingStatus: "ready", playback, thumbnailUrl: remote.thumbnail || video.thumbnailUrl || null, duration: remote.duration || video.duration || null, updatedAt: new Date() } });
          video = { ...video, playback, thumbnailUrl: remote.thumbnail || video.thumbnailUrl, duration: remote.duration || video.duration };
        }
      } catch { /* Return the safe unavailable state below. */ }
    }
    if (!playback?.hls || !/^https:\/\//i.test(playback.hls)) return res.status(409).json({ error: "processing", message: "This licensed video is still processing. Try again shortly." });
    if (!env.cloudflare_stream_account_id || !env.cloudflare_stream_api_token)
      return res.status(503).json({ error: "cloudflare_playback_not_configured", message: "Secure movie playback is temporarily unavailable." });
    try {
      const tokenResponse = await axios.post<{ success: boolean; result?: { token?: string }; errors?: Array<{ code?: number; message?: string }>; messages?: Array<{ code?: number; message?: string }> }>(
        `https://api.cloudflare.com/client/v4/accounts/${env.cloudflare_stream_account_id}/stream/${encodeURIComponent(String(video.cloudflareUid))}/token`,
        { exp: Math.floor(Date.now() / 1000) + 2 * 60 * 60 },
        { headers: { Authorization: `Bearer ${env.cloudflare_stream_api_token}`, "Content-Type": "application/json" }, timeout: 12_000 }
      );
      const playbackToken = String(tokenResponse.data.result?.token || "");
      if (!tokenResponse.data.success || !playbackToken) throw new Error(tokenResponse.data.errors?.[0]?.message || "Cloudflare returned no playback token.");
      const manifestUrl = new URL(playback.hls);
      const signedPlaybackUrl = `${manifestUrl.origin}/${encodeURIComponent(playbackToken)}/manifest/video.m3u8`;
      return res.json({ video: { id: String(video.cloudflareUid), sourceType: "hls", playbackUrl: signedPlaybackUrl, title: video.title, description: video.description, creatorName: video.creatorName, thumbnailUrl: video.thumbnailUrl || null, duration: video.duration || null } });
    } catch (error) {
      const response = axios.isAxiosError(error) ? error.response : undefined;
      const data = response?.data as { errors?: Array<{ code?: number; message?: string }>; messages?: Array<{ code?: number; message?: string }> } | undefined;
      console.error("[Cloudflare Stream playback token] failed", { uid: String(video.cloudflareUid), httpStatus: response?.status || null, errors: data?.errors || [], messages: data?.messages || [] });
      return res.status(502).json({ error: "cloudflare_playback_authorization_failed", message: "Cloudflare could not authorize this movie for playback. Please try again." });
    }
  });

  router.post("/download/:uid", async (req, res) => {
    const user = await requireViewer(req, res); if (!user) return;
    const uid = String(req.params.uid || "").slice(0, 180);
    const storedViewer = await req.app.locals.userCollection.findOne({ _id: user._id });
    const subscription = normalizeStreamSubscription(storedViewer?.streamSubscription);
    if (subscription.status !== "active" || (subscription.plan !== "plus" && subscription.plan !== "family"))
      return res.status(403).json({ error: "download_plan_required", message: "Downloads require an active Plus or Family plan." });
    const video = await req.app.locals.streamContentCollection?.findOne({ cloudflareUid: uid, contentSource: "cloudflare_stream", visibility: "public", moderationStatus: "approved", playbackAllowed: true, processingStatus: "ready" });
    if (!video) return res.status(404).json({ error: "download_not_available", message: "This movie is not available for download." });
    if (!env.cloudflare_stream_account_id || !env.cloudflare_stream_api_token)
      return res.status(503).json({ error: "cloudflare_download_not_configured", message: "Movie downloads are temporarily unavailable." });
    const apiUrl = `https://api.cloudflare.com/client/v4/accounts/${env.cloudflare_stream_account_id}/stream/${encodeURIComponent(uid)}`;
    const headers = { Authorization: `Bearer ${env.cloudflare_stream_api_token}`, "Content-Type": "application/json" };
    try {
      let downloads = await axios.get<{ result?: { default?: { status?: string; url?: string; percentComplete?: number } } }>(`${apiUrl}/downloads`, { headers, timeout: 12_000 });
      if (!downloads.data.result?.default) {
        downloads = await axios.post(`${apiUrl}/downloads`, null, { headers, timeout: 12_000 });
        await req.app.locals.streamContentCollection.updateOne({ cloudflareUid: uid }, { $set: { downloadAllowed: true, downloadStatus: "processing", updatedAt: new Date() } });
      }
      const generated = downloads.data.result?.default;
      if (generated?.status !== "ready" || !generated.url)
        return res.status(202).json({ status: "processing", percentComplete: Number(generated?.percentComplete) || 0, message: "Cloudflare is preparing the MP4. Try again shortly." });
      const tokenResponse = await axios.post<{ success: boolean; result?: { token?: string }; errors?: Array<{ message?: string }> }>(`${apiUrl}/token`, { exp: Math.floor(Date.now() / 1000) + 60 * 60, downloadable: true }, { headers, timeout: 12_000 });
      const token = String(tokenResponse.data.result?.token || "");
      if (!tokenResponse.data.success || !token) throw new Error(tokenResponse.data.errors?.[0]?.message || "Cloudflare returned no download token.");
      const remoteUrl = new URL(generated.url);
      const safeName = String(video.title || "SMAJ-movie").replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100) || "SMAJ-movie";
      const downloadUrl = `${remoteUrl.origin}/${encodeURIComponent(token)}/downloads/default.mp4?filename=${encodeURIComponent(safeName)}`;
      await req.app.locals.streamContentCollection.updateOne({ cloudflareUid: uid }, { $set: { downloadAllowed: true, downloadStatus: "ready", updatedAt: new Date() } });
      return res.json({ status: "ready", downloadUrl, expiresIn: 3600 });
    } catch (error) {
      const response = axios.isAxiosError(error) ? error.response : undefined;
      const data = response?.data as { errors?: unknown[]; messages?: unknown[] } | undefined;
      console.error("[Cloudflare Stream download] failed", { uid, httpStatus: response?.status || null, errors: data?.errors || [], messages: data?.messages || [] });
      return res.status(502).json({ error: "cloudflare_download_failed", message: "Cloudflare could not prepare this download. Please try again." });
    }
  });
  router.get("/progress/:uid", async (req, res) => {
    const user = await requireViewer(req, res); if (!user) return;
    const uid = String(req.params.uid || "").slice(0, 180);
    const stored = await req.app.locals.userCollection.findOne({ _id: user._id });
    const progress = (Array.isArray(stored?.streamWatchProgress) ? stored.streamWatchProgress : []).find((item: { videoId?: string }) => item.videoId === uid) || null;
    return res.json({ progress });
  });

  router.put("/progress/:uid", async (req, res) => {
    const user = await requireViewer(req, res); if (!user) return;
    const videoId = String(req.params.uid || "").slice(0, 180);
    const position = Math.max(0, Math.min(86_400, Number(req.body?.position) || 0));
    const duration = Math.max(0, Math.min(86_400, Number(req.body?.duration) || 0));
    const completed = duration > 0 && (position / duration >= 0.92 || req.body?.completed === true);
    const progress = { videoId, title: String(req.body?.title || "Video").slice(0, 140), thumbnailUrl: req.body?.thumbnailUrl ? String(req.body.thumbnailUrl).slice(0, 500) : null, position: completed ? 0 : position, duration, completed, updatedAt: new Date() };
    await req.app.locals.userCollection.updateOne({ _id: user._id }, { $pull: { streamWatchProgress: { videoId } } });
    await req.app.locals.userCollection.updateOne({ _id: user._id }, { $addToSet: { streamWatchProgress: progress } });
    return res.json({ progress });
  });

  router.get("/watch-history", async (req, res) => {
    const user = await requireViewer(req, res); if (!user) return;
    const stored = await req.app.locals.userCollection.findOne({ _id: user._id });
    const items = (Array.isArray(stored?.streamWatchProgress) ? stored.streamWatchProgress : []).sort((a: { updatedAt?: Date }, b: { updatedAt?: Date }) => Number(new Date(b.updatedAt || 0)) - Number(new Date(a.updatedAt || 0))).slice(0, 50);
    return res.json({ items });
  });

  const list = (path: string, fallbackType: "movie" | "tv") => async (req: Request, res: Response) => {
    try {
      const page = Math.max(1, Math.min(100, Number(req.query.page) || 1));
      const requestedSort = req.query.sort ? String(req.query.sort) : undefined;
      const sort = fallbackType === "tv" && requestedSort === "primary_release_date.desc" ? "first_air_date.desc" : requestedSort;
      const data = await tmdbGet<{ page: number; total_pages: number; total_results: number; results: TmdbMedia[] }>(path, { page, language: String(req.query.language || "en-US"), include_adult: false, sort_by: sort, with_genres: req.query.genre ? String(req.query.genre) : undefined });
      res.json({ ...data, results: data.results.filter((item) => item.media_type !== "person").map((item) => normalizeMedia(item, fallbackType)), source: "TMDB" });
    } catch (error) {
      const status = Number((error as { status?: number; response?: { status?: number } }).status || (error as { response?: { status?: number } }).response?.status || 502);
      res.status(status).json({ error: error instanceof Error ? error.message : "Unable to load entertainment catalogue" });
    }
  };

  router.get("/trending", list("/trending/all/week", "movie"));
  router.get("/movies", list("/discover/movie", "movie"));
  router.get("/series", list("/discover/tv", "tv"));
  const categoryDefinitions: Record<string, { title: string; type: "movie" | "tv"; params: Record<string, string | number | boolean> }> = {
    "tv-channels": { title: "TV Channels", type: "tv", params: { sort_by: "popularity.desc" } },
    hollywood: { title: "Hollywood", type: "movie", params: { with_origin_country: "US", with_original_language: "en" } },
    bollywood: { title: "Bollywood", type: "movie", params: { with_origin_country: "IN", with_original_language: "hi" } },
    nollywood: { title: "Nollywood", type: "movie", params: { with_origin_country: "NG" } },
    kannywood: { title: "Kannywood", type: "movie", params: { with_origin_country: "NG", with_original_language: "ha" } },
    anime: { title: "Anime", type: "tv", params: { with_origin_country: "JP", with_original_language: "ja", with_genres: 16 } },
    "k-drama": { title: "K-Drama", type: "tv", params: { with_origin_country: "KR", with_original_language: "ko" } },
    "chinese-drama": { title: "Chinese Drama", type: "tv", params: { with_origin_country: "CN", with_original_language: "zh" } },
    "african-movies": { title: "African Movies", type: "movie", params: { with_origin_country: "NG|ZA|GH|KE" } },
    documentaries: { title: "Documentaries", type: "movie", params: { with_genres: 99 } },
    kids: { title: "Kids & Family", type: "movie", params: { with_genres: 10751 } },
    action: { title: "Action", type: "movie", params: { with_genres: 28 } },
    animation: { title: "Animation", type: "movie", params: { with_genres: 16 } },
    comedy: { title: "Comedy", type: "movie", params: { with_genres: 35 } },
    crime: { title: "Crime", type: "movie", params: { with_genres: 80 } },
    drama: { title: "Drama", type: "movie", params: { with_genres: 18 } },
    family: { title: "Family", type: "movie", params: { with_genres: 10751 } },
    fantasy: { title: "Fantasy", type: "movie", params: { with_genres: 14 } },
    history: { title: "History", type: "movie", params: { with_genres: 36 } },
    romance: { title: "Romance", type: "movie", params: { with_genres: 10749 } },
    horror: { title: "Horror", type: "movie", params: { with_genres: 27 } },
    music: { title: "Music", type: "movie", params: { with_genres: 10402 } },
    mystery: { title: "Mystery", type: "movie", params: { with_genres: 9648 } },
    "science-fiction": { title: "Science Fiction", type: "movie", params: { with_genres: 878 } },
    thriller: { title: "Thriller", type: "movie", params: { with_genres: 53 } },
    western: { title: "Western", type: "movie", params: { with_genres: 37 } },
    sports: { title: "Sports", type: "tv", params: { with_genres: 10767 } },
    wwe: { title: "WWE / Wrestling", type: "tv", params: { with_genres: 10767, with_original_language: "en" } },
  };
  router.get("/category/:slug", async (req, res) => {
    const definition = categoryDefinitions[String(req.params.slug || "").toLowerCase()];
    if (!definition) return res.status(404).json({ error: "category_not_found", message: "This Stream category is not available." });
    try {
      const page = Math.max(1, Math.min(100, Number(req.query.page) || 1));
      const requestedSort = String(req.query.sort || "popularity.desc");
      const sort = definition.type === "tv" && requestedSort === "primary_release_date.desc" ? "first_air_date.desc" : requestedSort;
      const data = await tmdbGet<{ page: number; total_pages: number; total_results: number; results: TmdbMedia[] }>(`/discover/${definition.type}`, { ...definition.params, page, language: String(req.query.language || "en-US"), include_adult: false, sort_by: sort, with_genres: req.query.genre ? String(req.query.genre) : definition.params.with_genres });
      return res.json({ ...data, category: { slug: req.params.slug, title: definition.title, mediaType: definition.type }, results: data.results.map((item) => normalizeMedia(item, definition.type)), source: "TMDB" });
    } catch (error) {
      const status = Number((error as { response?: { status?: number } }).response?.status || 502);
      return res.status(status).json({ error: error instanceof Error ? error.message : "Unable to load category" });
    }
  });
  router.get("/search", async (req, res) => {
    const query = String(req.query.q || "").trim().slice(0, 120);
    if (!query) return res.json({ page: 1, total_pages: 0, total_results: 0, results: [], source: "TMDB" });
    try {
      const page = Math.max(1, Math.min(500, Number(req.query.page) || 1));
      const data = await tmdbGet<{ page: number; total_pages: number; total_results: number; results: TmdbMedia[] }>("/search/multi", { query, page, language: String(req.query.language || "en-US"), include_adult: false });
      return res.json({ ...data, results: data.results.filter((item) => item.media_type !== "person").map((item) => normalizeMedia(item)), source: "TMDB" });
    } catch (error) {
      const status = Number((error as { status?: number; response?: { status?: number } }).status || (error as { response?: { status?: number } }).response?.status || 502);
      return res.status(status).json({ error: error instanceof Error ? error.message : "Unable to search entertainment catalogue" });
    }
  });
  router.get("/:type(movie|tv)/:id", async (req, res) => {
    try {
      const type = req.params.type as "movie" | "tv";
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid TMDB title ID" });
      const language = String(req.query.language || "en-US");
      const requestedLanguage = language.split("-")[0].toLowerCase();
      const data = await tmdbGet<TmdbMedia & { genres?: Array<{ id: number; name: string }>; runtime?: number; episode_run_time?: number[]; videos?: { results?: TmdbVideo[] } }>(`/${type}/${id}`, { language, append_to_response: "credits,recommendations,external_ids,videos" });
      const trailerVideo = (data.videos?.results || [])
        .filter(video => video.site === "YouTube" && /^[A-Za-z0-9_-]{11}$/.test(String(video.key || "")) && (video.type === "Trailer" || video.type === "Teaser" || video.type === "Clip"))
        .sort((left, right) => {
          const score = (video: TmdbVideo) => (video.type === "Trailer" ? 100 : video.type === "Teaser" ? 50 : 10) + (video.official ? 25 : 0) + (video.iso_639_1?.toLowerCase() === requestedLanguage ? 10 : 0);
          return score(right) - score(left) || String(right.published_at || "").localeCompare(String(left.published_at || ""));
        })[0];
      const trailer = trailerVideo ? { youtubeVideoId: trailerVideo.key!, name: trailerVideo.name || "Official trailer", official: Boolean(trailerVideo.official), type: trailerVideo.type || "Trailer" } : null;
      return res.json({ ...normalizeMedia(data, type), genres: data.genres || [], runtime: data.runtime || data.episode_run_time?.[0] || null, trailer, source: "TMDB", raw: data });
    } catch (error) {
      const status = Number((error as { status?: number; response?: { status?: number } }).status || (error as { response?: { status?: number } }).response?.status || 502);
      return res.status(status).json({ error: error instanceof Error ? error.message : "Unable to load title" });
    }
  });
};

export default mountStreamEndpoints;
