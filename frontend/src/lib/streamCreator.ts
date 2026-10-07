import { axiosClient } from "./axiosClient";
import { uploadWithTus } from "./streamCloudflare";

export type CreatorVideo = {
  _id: string;
  cloudflareUid: string;
  title: string;
  description: string;
  category: string;
  visibility: "public" | "unlisted" | "private";
  processingStatus: string;
  moderationStatus: string;
  thumbnailUrl?: string | null;
  posterUrl?: string | null;
  createdAt: string;
  contentSource?: "youtube" | "cloudflare";
  youtubeVideoId?: string;
};

export type CreatorVideoMetadata = {
  title: string;
  description: string;
  category: string;
  visibility: string;
  rightsConfirmed: boolean;
  uploadedBy?: string;
  tmdbId?: number;
  mediaType?: "movie" | "tv";
  tmdbTitle?: string;
  posterUrl?: string | null;
  backdropUrl?: string | null;
};

export const publishCreatorYoutubeVideo = async (metadata: CreatorVideoMetadata & { youtubeUrl: string }) => {
  const response = await axiosClient.post<{ video: CreatorVideo }>("/stream/creator/youtube", metadata, { headers: { "X-SMAJ-Silent": "true" } });
  return response.data.video;
};

export const uploadCreatorVideo = async (file: File, metadata: CreatorVideoMetadata, onProgress?: (progress: number) => void) => {
  const session = await axiosClient.post<{ upload: { uid: string; uploadURL: string; protocol: "tus" } }>("/stream/creator/uploads", { ...metadata, fileName: file.name, fileSize: file.size, maxDurationSeconds: 14_400 }, { headers: { "X-SMAJ-Silent": "true" } });
  await uploadWithTus(file, session.data.upload.uploadURL, progress => onProgress?.(progress));
  onProgress?.(100);
  await axiosClient.post(`/stream/creator/videos/${session.data.upload.uid}/complete`, undefined, { headers: { "X-SMAJ-Silent": "true" } });
  return session.data.upload;
};
export const getCreatorVideos = async () => {
  const response = await axiosClient.get<{ videos: CreatorVideo[] }>("/stream/creator/videos");
  return response.data.videos;
};

export const refreshCreatorVideoStatus = async (uid: string) =>
  (await axiosClient.get<{ video: CreatorVideo }>(`/stream/creator/videos/${encodeURIComponent(uid)}/status`, { headers: { "X-SMAJ-Silent": "true" } })).data.video;

export type CreatorOverview = {
  stats: {
    followers?: number;
    posts?: number;
    totalVideos: number;
    publishedVideos: number;
    pendingVideos: number;
    rejectedVideos: number;
    liveStreams: number;
    totalViews: number;
    watchSeconds: number;
    averageViewSeconds: number;
    latestUploadAt: string | null;
  };
  monetization: {
    enabled: boolean;
    eligible?: boolean;
    eligibility?: {
      channelProfile: boolean;
      rightsConfirmed: boolean;
      publishedVideo: boolean;
      minimumViews: boolean;
      minimumWatchSeconds: boolean;
      goodStanding: boolean;
    };
    reason: string;
  };
};
export const getCreatorOverview = async (signal?: AbortSignal) => (await axiosClient.get<CreatorOverview>("/stream/creator/overview", { signal, headers: { "X-SMAJ-Silent": "true", "Cache-Control": "no-cache" } })).data;

export const getPublishedCreatorVideos = async () => {
  const response = await axiosClient.get<{ videos: Array<Pick<CreatorVideo, "_id" | "title" | "thumbnailUrl" | "youtubeVideoId" | "cloudflareUid" | "contentSource"> & { creatorName?: string; category?: string }> }>("/stream/creator-content");
  return response.data.videos;
};
