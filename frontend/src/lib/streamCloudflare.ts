import { axiosClient } from "./axiosClient";

type CloudflareUploadSession = { uid: string; uploadURL: string; protocol: "tus"; status: string };
export type CloudflareMovieStatus = { uid: string; ready: boolean; status: string; error?: string | null };
export type CloudflareUploadStage = "preparing" | "uploading" | "processing" | "ready" | "failed";

const wait = (milliseconds: number) => new Promise(resolve => window.setTimeout(resolve, milliseconds));

const uploadChunk = (uploadURL: string, chunk: Blob, offset: number, total: number, onProgress: (percent: number) => void) =>
  new Promise<number>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PATCH", uploadURL);
    request.setRequestHeader("Tus-Resumable", "1.0.0");
    request.setRequestHeader("Upload-Offset", String(offset));
    request.setRequestHeader("Content-Type", "application/offset+octet-stream");
    request.upload.onprogress = event => {
      if (event.lengthComputable) onProgress(Math.min(99, Math.round(((offset + event.loaded) / total) * 100)));
    };
    request.onerror = () => reject(new Error("The upload connection was interrupted."));
    request.ontimeout = () => reject(new Error("The upload connection timed out."));
    request.onload = () => {
      if (request.status < 200 || request.status >= 300) {
        reject(new Error(`Cloudflare rejected the upload chunk (${request.status}).`));
        return;
      }
      const returnedOffset = Number(request.getResponseHeader("Upload-Offset"));
      resolve(Number.isFinite(returnedOffset) && returnedOffset > offset ? returnedOffset : offset + chunk.size);
    };
    request.send(chunk);
  });

export const uploadWithTus = async (file: File, uploadURL: string, onProgress: (percent: number) => void) => {
  const chunkSize = 25 * 1024 * 1024;
  const retryDelays = [0, 3_000, 5_000, 10_000, 20_000];
  let offset = 0;
  while (offset < file.size) {
    const chunk = file.slice(offset, Math.min(file.size, offset + chunkSize));
    let lastError: unknown;
    let nextOffset = offset;
    for (const delay of retryDelays) {
      if (delay) await wait(delay);
      try {
        nextOffset = await uploadChunk(uploadURL, chunk, offset, file.size, onProgress);
        lastError = undefined;
        break;
      } catch (error) {
        lastError = error;
      }
    }
    if (lastError) throw new Error(`${lastError instanceof Error ? lastError.message : "Upload failed"} Please try again.`);
    offset = nextOffset;
    onProgress(Math.min(99, Math.round((offset / file.size) * 100)));
  }
  onProgress(100);
};

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
