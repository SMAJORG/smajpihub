import { Upload } from "tus-js-client";
import { axiosClient } from "./axiosClient";

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
  const response = await axiosClient.post<{ video: CreatorVideo }>("/stream/creator/youtube", metadata);
  return response.data.video;
};

export const uploadCreatorVideo = async (file: File, metadata: CreatorVideoMetadata, onProgress?: (progress: number) => void) => {
  const session = await axiosClient.post<{ upload: { uid: string; uploadURL: string; protocol: "tus" } }>("/stream/creator/uploads", { ...metadata, fileName: file.name, fileSize: file.size, maxDurationSeconds: 14_400 });
  await new Promise<void>((resolve, reject) => {
    const upload = new Upload(file, {
      uploadUrl: session.data.upload.uploadURL,
      chunkSize: 50 * 1024 * 1024,
      retryDelays: [0, 3_000, 5_000, 10_000, 20_000],
      removeFingerprintOnSuccess: true,
      metadata: { filename: file.name, filetype: file.type || "application/octet-stream" },
      onError: error => reject(error),
      onProgress: (uploaded, total) => onProgress?.(total ? Math.round((uploaded / total) * 100) : 0),
      onSuccess: () => resolve(),
    });
    upload.start();
  });
  onProgress?.(100);
  await axiosClient.post(`/stream/creator/videos/${session.data.upload.uid}/complete`);
  return session.data.upload;
};
export const getCreatorVideos = async () => {
  const response = await axiosClient.get<{ videos: CreatorVideo[] }>("/stream/creator/videos");
  return response.data.videos;
};

export const refreshCreatorVideoStatus = async (uid: string) =>
  (await axiosClient.get<{ video: CreatorVideo }>(`/stream/creator/videos/${encodeURIComponent(uid)}/status`)).data.video;

export type CreatorOverview = {
  stats: {
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
export const getCreatorOverview = async () => (await axiosClient.get<CreatorOverview>("/stream/creator/overview")).data;

export const getPublishedCreatorVideos = async () => {
  const response = await axiosClient.get<{ videos: Array<Pick<CreatorVideo, "_id" | "title" | "thumbnailUrl" | "youtubeVideoId" | "cloudflareUid" | "contentSource"> & { creatorName?: string; category?: string }> }>("/stream/creator-content");
  return response.data.videos;
};
