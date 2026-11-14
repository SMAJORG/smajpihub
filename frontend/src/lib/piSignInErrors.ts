import { isAxiosError } from "axios";

export class PiSignInResponseError extends Error {}

export function piSignInErrorMessage(error: unknown): string {
  if (!isAxiosError<{ message?: string; requestId?: string }>(error)) return error instanceof Error ? error.message : "Pi sign-in could not be completed.";
  if (!error.response) return "The account server could not be reached. Please retry shortly.";
  const body = error.response.data;
  const supplied = typeof body?.message === "string" && body.message.trim() ? body.message : "";
  const status = error.response.status;
  const message = supplied || (status >= 500 ? "The account server is temporarily unable to sign you in. Please retry shortly." : status === 401 ? "Pi did not accept this sign-in token. Please authenticate with Pi again." : status === 403 ? "This sign-in is not permitted. Check the app permissions or contact the administrator." : "The account server could not complete sign-in. Please retry.");
  const reference = typeof body?.requestId === "string" && /^[a-f0-9-]{36}$/i.test(body.requestId) ? ` Reference: ${body.requestId}.` : "";
  return message + reference;
}
