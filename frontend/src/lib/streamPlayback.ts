import { axiosClient } from "./axiosClient";

export type StreamPlaybackVideo = {
  id: string;
  sourceType: "cloudflare" | "hls" | "youtube" | "mp4";
  playbackUrl?: string;
  iframeUrl?: string;
  youtubeVideoId?: string;
  title: string;
  description?: string;
  creatorName?: string;
  thumbnailUrl?: string | null;
  duration?: number | null;
  downloadUrl?: string | null;
  downloadAllowed?: boolean;
  license?: string;
  rightsUrl?: string;
};

export type StreamWatchProgress = { videoId: string; title: string; thumbnailUrl: string | null; position: number; duration: number; completed: boolean; updatedAt: string };

export const getStreamPlayback = async (id: string) => (await axiosClient.get<{ video: StreamPlaybackVideo }>(`/stream/playback/${encodeURIComponent(id)}`)).data.video;
export const getStreamProgress = async (id: string) => (await axiosClient.get<{ progress: StreamWatchProgress | null }>(`/stream/progress/${encodeURIComponent(id)}`)).data.progress;
export const saveStreamProgress = async (id: string, progress: Pick<StreamWatchProgress, "title" | "thumbnailUrl" | "position" | "duration" | "completed">) => (await axiosClient.put<{ progress: StreamWatchProgress }>(`/stream/progress/${encodeURIComponent(id)}`, progress)).data.progress;
export const getStreamWatchHistory = async () => (await axiosClient.get<{ items: StreamWatchProgress[] }>("/stream/watch-history")).data.items;
export const requestStreamDownload = async (id: string) => {
  for (let attempt = 0; ; attempt += 1) {
    try { return (await axiosClient.post<{ status: "processing" | "ready"; downloadUrl?: string; message?: string; percentComplete?: number }>(`/stream/download/${encodeURIComponent(id)}`)).data; }
    catch (error) {
      const status = (error as { response?: { status?: number } }).response?.status;
      if (attempt >= 2 || (status && status < 500 && status !== 429)) throw error;
      await new Promise(resolve => window.setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }
};
