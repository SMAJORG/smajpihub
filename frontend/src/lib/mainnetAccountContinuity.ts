type Options = {
  accessToken: string;
  originalAccessToken: string;
  originalRefreshToken: string;
  post: (path: string, body: Record<string, unknown>) => Promise<{ data: any }>;
  confirm: (message: string) => boolean;
};
// Run before normal signin replaces/revokes the browser's existing device session.
// The server checks both credentials; names are displayed only for informed consent.
export async function linkFromExistingSession(options: Options) {
  if (!options.originalAccessToken && !options.originalRefreshToken) return false;
  let challenge: any;
  try {
    challenge = (await options.post("/user/pi-identities/session-start", {
      accessToken: options.accessToken,
      originalAccountAccessToken: options.originalAccessToken,
      originalAccountRefreshToken: options.originalRefreshToken,
    })).data;
  } catch (error: any) {
    // Invalid/absent old credentials or a backend without this feature must not
    // prevent normal signin and genuinely new registrations.
    if ([401, 403, 404, 405, 409].includes(error?.response?.status)) return false;
    throw error;
  }
  const review = (await options.post("/user/pi-identities/preview", { accessToken: options.accessToken, code: challenge.code })).data;
  if (!options.confirm(`Connect Pi identity ${review.incoming.username || review.incoming.uid} (${review.incoming.uid}) to your existing SMAJ account ${review.original.username} (${review.original.uid})? Your original profile, roles and history will be preserved. Cancel keeps the accounts separate and continues normal login.`)) return false;
  await options.post("/user/pi-identities/complete", { accessToken: options.accessToken, code: challenge.code, confirmedOriginalUid: review.original.uid });
  return true;
}
