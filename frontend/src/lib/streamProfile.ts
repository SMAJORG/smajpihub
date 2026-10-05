import { axiosClient } from "./axiosClient";

export type StreamProfile = { displayName: string; avatarUrl: string; country: string; language: string; subtitleLanguage: string; favoriteGenres: string[]; preferredRegions: string[]; maturityLevel: "kids" | "13" | "16" | "18"; videoQuality: "auto" | "data-saver" | "hd" | "full-hd"; autoplay: boolean; dataSaver: boolean; showActivity: boolean; emailNotifications: boolean; channelName: string; channelHandle: string; channelDescription: string; channelBannerUrl: string };
export type StreamProfileResponse = { profile: StreamProfile; completion: number; username?: string };

export const getStreamProfile = async () => (await axiosClient.get<StreamProfileResponse>("/stream/profile")).data;
export const saveStreamProfile = async (profile: StreamProfile) => {
  const { data } = await axiosClient.put<StreamProfileResponse>("/stream/profile", profile);
  window.dispatchEvent(new CustomEvent("smaj:profile-avatar-updated", { detail: { avatar: data.profile.avatarUrl } }));
  return data;
};
