import { axiosClient } from "./axiosClient";

export const STREAM_DOWNLOADS_CHANGED_EVENT = "smaj:stream-downloads-changed";

const notifyDownloadsChanged = () => {
  window.dispatchEvent(new Event(STREAM_DOWNLOADS_CHANGED_EVENT));
};

export type StreamCatalogTitle = {
  id: string;
  tmdbId: number;
  mediaType: "movie" | "tv";
  title: string;
  overview: string;
  posterUrl: string | null;
  backdropUrl: string | null;
  releaseDate: string | null;
  rating: number | null;
  voteCount: number;
  genreIds: number[];
};

export type StreamTrailer = {
  youtubeVideoId: string;
  name: string;
  official: boolean;
  type: string;
};

export type StreamDownloadTitle = StreamCatalogTitle & {
  downloadStatus?: "pending" | "downloading" | "ready" | "failed";
  downloadedAt?: string;
};

type CatalogResponse = {
  page: number;
  total_pages: number;
  total_results: number;
  results: StreamCatalogTitle[];
  source: "TMDB";
};

export const getStreamCatalog = async (kind: "trending" | "movies" | "series", page = 1, sort?: string, genre?: number) => {
  const response = await axiosClient.get<CatalogResponse>(`/stream/${kind}`, { params: { page, sort, genre } });
  return response.data;
};

export const searchStreamCatalog = async (query: string, page = 1) => {
  const response = await axiosClient.get<CatalogResponse>("/stream/search", { params: { q: query, page } });
  return response.data;
};

export const getStreamCategory = async (slug: string, page = 1, sort = "popularity.desc", genre?: number) => {
  const response = await axiosClient.get<CatalogResponse & { category: { slug: string; title: string; mediaType: "movie" | "tv" } }>(`/stream/category/${encodeURIComponent(slug)}`, { params: { page, sort, genre } });
  return response.data;
};

export const getStreamTitle = async (type: "movie" | "tv", id: string) => {
  const response = await axiosClient.get<StreamCatalogTitle & { genres: Array<{ id: number; name: string }>; runtime: number | null; trailer: StreamTrailer | null; raw: unknown }>(`/stream/${type}/${id}`);
  return response.data;
};

export const getStreamMyList = async () => {
  const response = await axiosClient.get<{ items: StreamCatalogTitle[] }>("/stream/my-list");
  return response.data.items;
};

export const getStreamMyListStatus = async (type: "movie" | "tv", id: string) => {
  const response = await axiosClient.get<{ saved: boolean }>(`/stream/my-list/${type}/${id}`);
  return response.data.saved;
};

export const saveStreamTitle = async (title: StreamCatalogTitle) => {
  const response = await axiosClient.post<{ saved: true }>("/stream/my-list", title);
  return response.data;
};

export const removeStreamTitle = async (type: "movie" | "tv", id: string) => {
  const response = await axiosClient.delete<{ saved: false }>(`/stream/my-list/${type}/${id}`);
  return response.data;
};

export const getStreamDownloads = async () => {
  const response = await axiosClient.get<{ items: StreamDownloadTitle[] }>("/stream/downloads");
  return response.data.items;
};

export const getStreamDownloadStatus = async (type: "movie" | "tv", id: string) => {
  const response = await axiosClient.get<{ downloaded: boolean }>(`/stream/downloads/${type}/${id}`);
  return response.data.downloaded;
};

export const saveStreamDownload = async (title: StreamCatalogTitle, downloadStatus: "downloading" | "ready" | "failed" = "ready") => {
  const response = await axiosClient.post<{ downloaded: true; item: StreamDownloadTitle }>("/stream/downloads", { ...title, downloadStatus });
  notifyDownloadsChanged();
  return response.data;
};
export const removeStreamDownload = async (type: "movie" | "tv", id: string) => {
  const response = await axiosClient.delete<{ downloaded: false }>(`/stream/downloads/${type}/${id}`);
  notifyDownloadsChanged();
  return response.data;
};

// Rank fresh catalog results using the viewer's downloaded and saved genres.
export const getStreamDownloadRecommendations = async (page = 1) => {
  const [downloadsResult, savedResult] = await Promise.allSettled([getStreamDownloads(), getStreamMyList()]);
  const downloads = downloadsResult.status === "fulfilled" ? downloadsResult.value : [];
  const saved = savedResult.status === "fulfilled" ? savedResult.value : [];
  // Older saved records do not include genres; resolve their catalog metadata.
  const seeds = [...downloads.slice().reverse(), ...saved.slice().reverse()].filter((item, index, items) => items.findIndex(other => other.mediaType === item.mediaType && other.id === item.id) === index).slice(0, 8);
  const metadata = new Map<string, number[]>();
  await Promise.allSettled(seeds.map(async item => {
    if (item.genreIds?.length) return;
    const detail = await getStreamTitle(item.mediaType, String(item.tmdbId || item.id));
    metadata.set(item.mediaType + ":" + item.id, detail.genres.map(genre => genre.id));
  }));
  const preferences = new Map<string, { mediaType: "movie" | "tv"; genre: number; weight: number }>();
  for (const [items, weight] of [[downloads, 3], [saved, 1]] as const) {
    for (const item of items) for (const genre of item.genreIds?.length ? item.genreIds : metadata.get(item.mediaType + ":" + item.id) || []) {
      const key = item.mediaType + ":" + genre;
      const previous = preferences.get(key);
      preferences.set(key, { mediaType: item.mediaType, genre, weight: (previous?.weight || 0) + weight });
    }
  }
  const top = [...preferences.values()].sort((a, b) => b.weight - a.weight).slice(0, 3);
  const responses = await Promise.allSettled(top.length
    ? top.map(item => getStreamCatalog(item.mediaType === "tv" ? "series" : "movies", page, "popularity.desc", item.genre))
    : [getStreamCatalog("trending", page)]);
  const downloaded = new Set(downloads.map(item => item.mediaType + ":" + item.id));
  const candidates = new Map<string, StreamCatalogTitle>();
  for (const response of responses) if (response.status === "fulfilled") for (const item of response.value.results) {
    const key = item.mediaType + ":" + item.id;
    if (item.posterUrl && !downloaded.has(key)) candidates.set(key, item);
  }
  if (!responses.some(result => result.status === "fulfilled")) throw new Error("Recommendations unavailable");
  const score = (item: StreamCatalogTitle) => (item.genreIds || []).reduce((total, genre) => total + (preferences.get(item.mediaType + ":" + genre)?.weight || 0), 0);
  return [...candidates.values()].sort((a, b) => score(b) - score(a));
};
