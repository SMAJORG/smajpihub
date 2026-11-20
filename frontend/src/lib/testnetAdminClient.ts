import axios from "axios";
import { getBaseURL } from "./axiosClient";

export const TESTNET_ADMIN_SESSION_ENDED = "smaj:testnet-admin-session-ended";
let token = "";
export const setTestnetAdminToken = (value: string) => { token = value; };
export const testnetAdminClient = axios.create({ baseURL: getBaseURL(), withCredentials: false, timeout: 90000 });
testnetAdminClient.interceptors.request.use(config => {
  config.withCredentials = false;
  if (token) config.headers.set("Authorization", `Bearer ${token}`);
  return config;
});
testnetAdminClient.interceptors.response.use(response => response, error => {
  if (error.response?.status === 401 && token) {
    token = "";
    window.dispatchEvent(new Event(TESTNET_ADMIN_SESSION_ENDED));
  }
  return Promise.reject(error);
});
