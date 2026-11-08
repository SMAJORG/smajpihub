import * as SecureStore from "expo-secure-store";

const REFRESH_TOKEN_KEY = "smaj_mobile_refresh_token";
const ACCESS_TOKEN_KEY = "smaj_mobile_access_token";
const OAUTH_STATE_KEY = "smaj_mobile_pi_oauth_state";
const secureOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY } as const;

export const authStorage = {
  getRefreshToken: () => SecureStore.getItemAsync(REFRESH_TOKEN_KEY),
  setRefreshToken: (value: string) => SecureStore.setItemAsync(REFRESH_TOKEN_KEY, value, secureOptions),
  getAccessToken: () => SecureStore.getItemAsync(ACCESS_TOKEN_KEY),
  setAccessToken: (value: string) => SecureStore.setItemAsync(ACCESS_TOKEN_KEY, value, secureOptions),
  getOAuthState: () => SecureStore.getItemAsync(OAUTH_STATE_KEY),
  setOAuthState: (value: string) => SecureStore.setItemAsync(OAUTH_STATE_KEY, value, secureOptions),
  clearOAuthState: () => SecureStore.deleteItemAsync(OAUTH_STATE_KEY),
  clear: () => Promise.all([
    SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
    SecureStore.deleteItemAsync(OAUTH_STATE_KEY)
  ]).then(() => undefined)
};