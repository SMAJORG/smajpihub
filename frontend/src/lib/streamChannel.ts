import { axiosClient } from "./axiosClient";

export type PublicChannelVideo = {
  _id: string;
  title: string;
  description?: string;
  category?: string;
  downloadAllowed?: boolean;
  thumbnailUrl?: string | null;
  youtubeVideoId?: string;
  cloudflareUid: string;
  contentSource?: string;
  createdAt?: string;
};
export type PublicChannelLive = {
  description?: string;
  category?: string;
  liveInputUid: string;
  title: string;
  thumbnailUrl?: string | null;
  processingStatus?: string;
};
export type PublicChannelPost = {
  _id: string;
  body: string;
  visibility?: "public" | "followers";
  createdAt?: string;
  updatedAt?: string;
};
export type PublicStreamChannel = {
  isOwner?: boolean;
  channel: { name: string; handle: string; description: string; avatarUrl: string; bannerUrl: string };
  posts: PublicChannelPost[];
  videos: PublicChannelVideo[];
  live: PublicChannelLive[];
  stats: { followers: number; videos: number; live: number; joinedAt: string | null };
};
export type StreamSubscription = {
  creatorId: string;
  subscribedAt: string | null;
  channel: { name: string; handle: string; avatarUrl: string };
  posts: PublicChannelPost[];
  videos: Array<PublicChannelVideo & { contentType?: string; liveInputUid?: string; processingStatus?: string }>;
};
export type StreamCreatorDirectoryItem = {
  isOwner?: boolean;
  creatorId: string;
  channel: { name: string; handle: string; description: string; avatarUrl: string; bannerUrl: string };
  stats: { videos: number; live: number; followers: number; latestAt: string | null };
  latestVideos: PublicChannelVideo[];
};

export const getPublicStreamChannel = async (handle: string) =>
  (await axiosClient.get<PublicStreamChannel>(`/stream/channels/${encodeURIComponent(handle)}`)).data;
export const getStreamCreators = async () =>
  (await axiosClient.get<{ creators: StreamCreatorDirectoryItem[] }>("/stream/creators")).data.creators;
export const getStreamSubscriptions = async () =>
  (await axiosClient.get<{ channels: StreamSubscription[] }>("/stream/subscriptions")).data.channels;
export const createStreamChannelPost = async (body: string, visibility: "public" | "followers" = "public") =>
  (await axiosClient.post<{ post: PublicChannelPost }>("/stream/creator/posts", { body, visibility })).data.post;
export const getMyStreamChannelPosts = async () =>
  (await axiosClient.get<{ posts: PublicChannelPost[] }>("/stream/creator/posts")).data.posts;
export const getStreamSubscriptionStatus = async (handle: string) =>
  (await axiosClient.get<{ subscribed: boolean }>(`/stream/subscriptions/${encodeURIComponent(handle)}/status`)).data
    .subscribed;
export const subscribeToStreamChannel = async (handle: string) =>
  (await axiosClient.post<{ subscribed: true }>(`/stream/subscriptions/${encodeURIComponent(handle)}`)).data;
export const unsubscribeFromStreamChannel = async (handle: string) =>
  (await axiosClient.delete<{ subscribed: false }>(`/stream/subscriptions/${encodeURIComponent(handle)}`)).data;
