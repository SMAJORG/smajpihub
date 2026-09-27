import { registerPlugin } from "@capacitor/core";

export type SmajMediaPlugin = {
  enterLandscape(): Promise<void>;
  exitLandscape(): Promise<void>;
  enterPictureInPicture(): Promise<{ entered: boolean }>;
  startDownload(options: { url: string; fileName: string; title: string; location: "app" | "downloads" }): Promise<{ downloadId: number }>;
  getDownloadStatus(options: { downloadId: number }): Promise<{ status: "pending" | "running" | "paused" | "complete" | "failed"; progress: number; downloadedBytes: number; totalBytes: number; localUri?: string; reason?: number }>;
};

export const SmajMedia = registerPlugin<SmajMediaPlugin>("SmajMedia");
