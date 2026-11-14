# Pi login rollback

The original direct-UID Pi login and session lookup are restored. The backend verifies the token through Pi `/v2/me`, loads the saved MongoDB user by that verified UID, and issues the existing Hub session. Saved profile fields, roles, verification, seller state and account history are preserved. The original SDK Sandbox selection and Pages build setting are restored from the version before the identity changes.

Account-recovery resolvers, continuity hints, cross-UID session migration, recovery login warnings, recovery endpoints, screens and navigation have been removed. Existing recovery/identity documents in MongoDB are left untouched and are no longer consulted by login. No database migration, deletion, reset or automatic account linking is performed.

Pi authentication remains mandatory. A known username with an unknown verified UID cannot authorize the saved account or provision a duplicate; it uses the existing generic Pi login failure response. Genuine new users can register normally. Backend-confirmed account data remains required; failures do not fabricate a local account. Existing Testnet payout fixes and unrelated services are retained.

The existing read-only account audit script remains available for offline investigation. Source rollback does not verify deployment or production-user login.

## Sign-in failure investigation

Live inspection on 2026-11-14 confirmed both Pages and Render were serving `b882d86`, with MongoDB health HTTP 200. Public runtime configuration has `sandbox: true`, no OAuth client ID and the expected Render API address. The Developer Portal original/paired app configuration, production MongoDB account UIDs, a real failing user's token and private Render logs were not available. A healthy service does not establish that an individual login succeeded. No SDK environment flip or Pi credential change was made without those identity/configuration facts.

Source defects corrected: the backend required and compared untrusted SDK user fields in addition to token verification, falsely rejecting stale/renamed presentation data. It now accepts the token alone and uses only Pi's `/v2/me` identity for account selection. Returning users can retain their saved username when Pi verifies the exact UID without returning a username; new registrations still need a server-verified username. Admin promotion only uses the Pi-returned username; saved roles are preserved.

`PLATFORM_API_URL` may be the root `https://api.minepi.com` or end in `/v2`; user-identity requests normalize it so `/v2/me` is requested once. Payment API clients are unchanged. Upstream 401, 403, 404/configuration failure, 429, outage and timeout now have distinct status/error codes. Database and session failures identify their backend stage. Responses and sanitized `[pi-signin]` logs include a request ID, stage and safe status, never a token, API key, user identity or database connection string. Login requests have a 45-second frontend budget so Pi verification plus session persistence is not cut off at the shared 20-second timeout.

The frontend shows the actual backend error and request reference instead of translating every HTTP 400/401 into a Pi Browser failure. A malformed successful backend response is also identified as a server response problem. No recovery resolver, screen or continuity restriction was added. If Pi verifies a previously unseen UID whose username already exists, the server now accurately reports `signin_account_identity_conflict` at `account_lookup`, rather than falsely claiming the Pi token was invalid. It neither creates a duplicate nor authorizes another account by username. That condition cannot be securely resolved by guessing an app ID or merging accounts.
