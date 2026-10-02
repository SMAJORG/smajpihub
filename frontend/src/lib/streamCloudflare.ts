import { Upload } from "tus-js-client";
import { axiosClient } from "./axiosClient";

type CloudflareUploadSession = { uid: string; uploadURL: string; protocol: "tus"; status: string };
export type CloudflareMovieStatus = { uid: string; ready: boolean; status: string; error?: string | null };
export type CloudflareUploadStage = "preparing" | "uploading" | "processing" | "ready" | "failed";

const wait = (milliseconds: number) => new Promise(resolve => window.setTimeout(resolve, milliseconds));

export const uploadWithTus = (file: File, uploadURL: string, onProgress: (percent: number) => void) => new Promise<void>((resolve, reject) => {
  const upload = new Upload(file, {
    uploadUrl: uploadURL,
    chunkSize: 50 * 1024 * 1024,
    retryDelays: [0, 3_000, 5_000, 10_000, 20_000],
    removeFingerprintOnSuccess: true,
    metadata: { filename: file.name, filetype: file.type || "application/octet-stream" },
    onError: error => {
      const response = (error as unknown as { originalResponse?: { getBody?: () => string } }).originalResponse;
      const detail = response?.getBody?.();
      reject(new Error(detail ? `${error.message}: ${detail}` : error.message));
    },
    onProgress: (uploaded, total) => onProgress(total ? Math.round((uploaded / total) * 100) : 0),
    onSuccess: () => resolve(),
  });
  upload.start();
});

export const uploadCloudflareMovie = async (
  tmdbId: number,
  file: File,
  onProgress: (percent: number) => void,
  onStage: (stage: CloudflareUploadStage) => void,
) => {
  onStage("preparing");
  const session = (await axiosClient.post<CloudflareUploadSession>("/api/stream/upload-url", {
    tmdbId,
    fileName: file.name,
    fileSize: file.size,
    maxDurationSeconds: 14_400,
  })).data;
  onStage("uploading");
  await uploadWithTus(file, session.uploadURL, onProgress);
  onProgress(100);
  await axiosClient.post(`/stream/admin/cloudflare/movies/${encodeURIComponent(session.uid)}/complete`);
  onStage("processing");
  for (let attempt = 0; attempt < 180; attempt += 1) {
    const status = (await axiosClient.get<CloudflareMovieStatus>(`/stream/admin/cloudflare/movies/${encodeURIComponent(session.uid)}/status`)).data;
    if (status.ready) { onStage("ready"); return status; }
    if (status.status === "error" || status.status === "failed") {
      onStage("failed");
      throw new Error(status.error || "Cloudflare could not process this video.");
    }
    await wait(10_000);
  }
  return { uid: session.uid, ready: false, status: "processing" } satisfies CloudflareMovieStatus;
};

export const publishCloudflareMovie = async (uid: string) =>
  (await axiosClient.post<{ uid: string; status: string; playbackAllowed: boolean }>(`/stream/admin/cloudflare/movies/${encodeURIComponent(uid)}/publish`)).data;
