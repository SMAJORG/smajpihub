import { axiosClient } from "./axiosClient";
import type { AvatarFrameId } from "../components/UserAvatarFrame";

export type CommunityIdentity = {
  uid: string;
  username: string;
  piUsername: string;
  displayName: string;
  country: string;
  bio: string;
  avatar: string;
  coverImage: string;
  role: string;
  sellerActive: boolean;
  openToWork: boolean;
  activeAvatarFrame: AvatarFrameId | null;
  verificationLevel: string;
  verificationStatus: string;
  allowContact: boolean;
  createdAt: string | null;
};
export type CommunityMedia = { type: "image" | "video"; url: string };
export type CommunityPost = {
  _id: string;
  authorId: string;
  content: string;
  media: CommunityMedia[];
  type: "post" | "repost";
  repostOf?: string;
  originalPost?: {
    _id: string;
    author: CommunityIdentity;
    content: string;
    media: CommunityMedia[];
    createdAt: string;
  } | null;
  author: CommunityIdentity;
  likedByMe: boolean;
  likeCount: number;
  commentCount: number;
  repostCount: number;
  createdAt: string;
};
export type CommunityComment = {
  _id: string;
  content: string;
  author: { uid: string; displayName: string; avatar: string; activeAvatarFrame?: AvatarFrameId | null };
  createdAt: string;
};
export type PublicProfileResponse = {
  profile: CommunityIdentity;
  stats: { followers: number; following: number; posts: number };
  viewer: { isSelf: boolean; following: boolean };
  isPublic: boolean;
  professional: { headline: string; skills: string[]; company: { name: string; logoUrl: string } | null };
  activities: {
    marketplaceListings: Array<{ id: string; title: string; image: string; pricePi?: number; createdAt?: string }>;
    jobs: number;
    streamVideos: number;
  };
};

export const getCommunityFeed = async (params: { scope?: "all" | "following"; authorId?: string; page?: number } = {}) =>
  (await axiosClient.get<{ posts: CommunityPost[]; hasMore: boolean }>("/community/feed", { params })).data;
export const getPublicProfile = async (uid: string) =>
  (await axiosClient.get<PublicProfileResponse>(`/community/profiles/${encodeURIComponent(uid)}`)).data;
export const getCommunityComments = async (postId: string) =>
  (await axiosClient.get<{ comments: CommunityComment[] }>(`/community/posts/${encodeURIComponent(postId)}/comments`)).data.comments;
export const createCommunityPost = async (content: string, media: CommunityMedia[]) =>
  (await axiosClient.post<{ post: CommunityPost }>("/community/posts", { content, media })).data.post;
export const toggleCommunityLike = async (postId: string) =>
  (await axiosClient.post<{ liked: boolean; likeCount: number }>(`/community/posts/${encodeURIComponent(postId)}/like`)).data;
export const createCommunityComment = async (postId: string, content: string) =>
  (await axiosClient.post<{ comment: CommunityComment }>(`/community/posts/${encodeURIComponent(postId)}/comments`, { content })).data.comment;
export const repostCommunityPost = async (postId: string) =>
  (await axiosClient.post<{ post: CommunityPost }>(`/community/posts/${encodeURIComponent(postId)}/repost`)).data.post;
export const reportCommunityPost = async (postId: string, reason: string) =>
  axiosClient.post(`/community/posts/${encodeURIComponent(postId)}/report`, { reason });
export const deleteCommunityPost = async (postId: string) =>
  axiosClient.delete(`/community/posts/${encodeURIComponent(postId)}`);
export const toggleCommunityFollow = async (uid: string) =>
  (await axiosClient.post<{ following: boolean }>(`/community/follow/${encodeURIComponent(uid)}`)).data.following;
