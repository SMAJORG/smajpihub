import { createSmajApiClient } from "@smaj/api-client";
import { config } from "@/constants/config";
import { authStorage } from "@/lib/auth-storage";

export const api = createSmajApiClient({
  baseUrl: config.apiBaseUrl,
  getAccessToken: authStorage.getAccessToken,
  getRefreshToken: authStorage.getRefreshToken,
  onSession: async session => { await Promise.all([authStorage.setAccessToken(session.accessToken), authStorage.setRefreshToken(session.refreshToken)]); },
  onSessionExpired: authStorage.clear
});