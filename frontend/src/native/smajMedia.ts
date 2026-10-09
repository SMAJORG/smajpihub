import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";

export type SmajMediaPlugin = {
  enterLandscape(): Promise<void>;
  exitLandscape(): Promise<void>;
  enterPictureInPicture(): Promise<{ entered: boolean }>;
  startDownload(options: { url: string; fileName: string; title: string; location: "app" | "downloads" }): Promise<{ downloadId: number | string }>;
  deleteDownload(options: { downloadId: number }): Promise<{ deleted: boolean }>;
  getDownloadStatus(options: { downloadId: number }): Promise<{ status: "pending" | "running" | "paused" | "complete" | "failed"; progress: number; downloadedBytes: number; totalBytes: number; localUri?: string; reason?: number }>;
  saveDownloadToPhone(options: { downloadId: number; fileName: string }): Promise<{ saved: boolean; uri: string }>;
  addListener(eventName: "saveProgress", listener: (event: { progress: number }) => void): Promise<PluginListenerHandle>;
};

export const SmajMedia = registerPlugin<SmajMediaPlugin>("SmajMedia");
