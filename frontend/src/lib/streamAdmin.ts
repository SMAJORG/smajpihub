import { axiosClient } from "./axiosClient";
import type { CreatorVideo } from "./streamCreator";

export type ModerationVideo = CreatorVideo & { creatorName?: string; rightsConfirmed?: boolean; moderationReason?: string; playbackAllowed?: boolean; status?: string; processingStatus?: string; processingError?: string; catalogAttachment?: { tmdbId: number; mediaType: "movie" | "tv"; title?: string } | null };
export type StreamAdminStats = { totalVideos: number; pendingVideos: number; approvedVideos: number; rejectedVideos: number; publishedVideos: number; liveStreams: number; readyVideos: number; attachedTitles: number; creators: number };
export type StreamAdminCreator = { id: string; name: string; videos: number; approved: number; live: number; latestAt?: string | null };
export type StreamAdminOverview = { stats: StreamAdminStats; creators: StreamAdminCreator[]; recent: ModerationVideo[]; updatedAt: string };
export type StreamAdminSettings = { uploadsEnabled: boolean; liveStreamingEnabled: boolean; piSupportEnabled: boolean; automaticModerationEnabled: boolean };

export const getModerationVideos = async (status = "all") => (await axiosClient.get<{ videos: ModerationVideo[] }>("/stream/admin/videos", { params: { status } })).data.videos;
export const updateModerationVideo = async (uid: string, body: Record<string, unknown>) => (await axiosClient.patch<{ video: ModerationVideo }>(`/stream/admin/videos/${encodeURIComponent(uid)}`, body)).data.video;
export const getStreamAdminOverview = async () => (await axiosClient.get<StreamAdminOverview>("/stream/admin/overview")).data;
export const getStreamAdminSettings = async () => (await axiosClient.get<{ settings: StreamAdminSettings }>("/stream/admin/settings")).data.settings;
export const saveStreamAdminSettings = async (settings: StreamAdminSettings) => (await axiosClient.put<{ settings: StreamAdminSettings }>("/stream/admin/settings", settings)).data.settings;
export type StreamTitleAvailability = { available: boolean; playbackId?: string; title?: string; creatorName?: string; downloadAllowed: boolean; message?: string };
export const getTitleAvailability = async (type: "movie" | "tv", id: string) => (await axiosClient.get<StreamTitleAvailability>(`/stream/availability/${type}/${id}`)).data;

export const importInternetArchiveTitle = async (input: { identifier: string; tmdbId: number; mediaType: "movie" | "tv"; title: string; license: string; rightsUrl: string; rightsConfirmed: boolean; downloadAllowed: boolean }) =>
  (await axiosClient.post("/stream/admin/internet-archive/import", input)).data;

export const deleteModerationVideo = async (uid: string) => (await axiosClient.delete<{ deleted: boolean; cloudflareDeleted: boolean }>(`/stream/admin/videos/${encodeURIComponent(uid)}`)).data;
