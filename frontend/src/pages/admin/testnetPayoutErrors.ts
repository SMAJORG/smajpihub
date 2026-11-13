import { isAxiosError } from "axios";
export function payoutErrorMessage(error: unknown): string {
  if (!isAxiosError<{ message?: string; code?: string; error?: string }>(error)) return error instanceof Error ? error.message : "The payout service is unavailable.";
  const status = error.response?.status;
  const supplied = error.response?.data?.message;
  if (supplied) return supplied;
  if (status === 401) return "Your admin session expired. Sign in again; no access token needs to be copied.";
  if (status === 403) return "This account is not authorized for Testnet Payouts, or its browser origin is blocked.";
  if (status === 404) return "The Testnet payout API route was not found. Confirm the backend deployment and API address.";
  if (status === 429) return "Pi or the backend is rate limiting requests. Wait before refreshing.";
  if (status && status >= 500) return `The backend returned HTTP ${status}. Check the deployed backend and its Testnet configuration.`;
  if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") return "The payout API timed out. Refresh its status; do not resend a payment whose result is unknown.";
  return "The browser could not reach the payout API. Check your connection and whether cross-site requests are blocked. No response was received; a send must be reconciled before retrying.";
}
