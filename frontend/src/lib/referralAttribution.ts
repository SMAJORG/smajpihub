import { axiosClient } from "./axiosClient";

const STORAGE_KEY = "smaj_referral_attribution_v1";
const REFERRAL_CODE_PATTERN = /^[A-Za-z0-9_-]{20,32}$/;
const ATTRIBUTION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

type StoredAttribution = { code: string; token?: string; expiresAt: number };
type VisitResponse = { tracked: boolean; attribution?: string };

const readStoredAttribution = (): StoredAttribution | null => {
  try {
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null") as StoredAttribution | null;
    if (!stored || !REFERRAL_CODE_PATTERN.test(stored.code) || stored.expiresAt <= Date.now()) {
      window.localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return stored;
  } catch {
    return null;
  }
};

const storeAttribution = (value: StoredAttribution) => {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
};

const issueAttributionToken = async (value: StoredAttribution) => {
  try {
    const { data } = await axiosClient.post<VisitResponse>("/referrals/visit", { code: value.code });
    if (!data.tracked || typeof data.attribution !== "string") return null;
    const updated = { ...value, token: data.attribution };
    storeAttribution(updated);
    return updated.token;
  } catch (error) {
    console.warn("Could not confirm referral attribution with the server.", error);
    return null;
  }
};

export const captureReferralAttributionFromLocation = async () => {
  const code = new URLSearchParams(window.location.search).get("invite");
  if (!code || !REFERRAL_CODE_PATTERN.test(code)) return;
  const existing = readStoredAttribution();
  if (existing) return;
  const value = { code, expiresAt: Date.now() + ATTRIBUTION_LIFETIME_MS };
  try {
    storeAttribution(value);
  } catch (error) {
    console.warn("Could not save referral attribution in this browser.", error);
    return;
  }
  await issueAttributionToken(value);
};

export const getReferralAttributionToken = async () => {
  const value = readStoredAttribution();
  if (!value) return undefined;
  if (value.token) return value.token;
  return (await issueAttributionToken(value)) || undefined;
};

export const clearReferralAttribution = () => {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.warn("Could not clear referral attribution after sign-in.", error);
  }
};
