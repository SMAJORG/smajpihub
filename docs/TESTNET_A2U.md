# Testnet admin payout

`POST /admin/testnet/a2u` accepts JSON `{ "uid": "<Pi app-specific UID>" }` and an `Authorization: Bearer <admin hub_access token>` header. Existing admin middleware and a second handler authorization check protect the endpoint. Cookie-only requests and Pi-token headers are rejected. The Hub token is validated independently of cookies and the shared authentication cache, including signature, expiry, device revocation, and current database admin role/configured admin username. The recipient must exist, be unblocked, and have server-verified Pi identity and wallet-sharing evidence. Fresh `/v2/me` responses establish or refresh that evidence; a saved verified login can survive recipient OAuth expiry. Pi payment creation remains authoritative for current UID, consent and wallet address before signing. The amount is always 0.01 Test-Pi; other body fields are rejected. One payout is allowed per UID across all administrators, including when a caller changes credentials or retries.

Only the official published `pi-backend@0.1.3` SDK is used. Its createPayment → getPayment → submitPayment → completePayment flow is isolated from existing U2A payments, Mainnet configuration, UI, settlement, and services. The authoritative payment must have network `Pi Testnet`, the expected UID, amount, direction, and recipient address before blockchain submission. Completion requires a matching verified txid and both completion flags.

## Prerequisites

- Render must redeploy this backend commit and install the updated dependency locks. The existing Docker build uses Yarn; both npm and Yarn locks include the SDK. Existing Node 20 deployment meets runtime requirements.
- `PI_TESTNET_API_KEY` must belong to the same Testnet app used by the recipient. `PI_TESTNET_WALLET_SEED` must be its connected wallet's **56-character Stellar secret seed starting with S**, not a 24-word passphrase. Credentials are read only server-side; no default or Mainnet credentials are used.
- The connected Testnet app wallet must be activated and funded for 0.01 Test-Pi plus network fees and minimum reserve. Its public address must match the payment's sender (also checked by the SDK).
- Recipient needs an activated Testnet wallet and wallet-address sharing consent for this app, a verified Pi login with wallet-sharing evidence saved on the server, and an app-specific UID from verified authentication. A profile verification badge alone is insufficient. Existing login flows are unchanged.
- MongoDB must be writable. Payout collection uses majority, journaled writes; its built-in unique `_id` index reserves each recipient and the wallet operation across processes.

No real payout was attempted during local tests: no recipient UID was supplied, and Render credentials/balance were not accessed. Presence, correctness, funding, consent, and successful deployment must be confirmed in that runtime before a live test.

## Storage and failures

`testnet_a2u_payments` stores recipient UID, initiating admin UID, fixed amount/network, payment ID, recipient wallet address, txid, Pi completion flags, status and timestamps. IDs and address are saved before advancing to the next irreversible step. Tokens and seeds are never stored in this collection, logged, or returned by the handler. Completed retries return the saved record.

A separate `_id: "wallet-lock"` record serializes this wallet's operations. Only successful completion releases it. SDK errors, rejected network details, database failures, and process crashes leave reservations intact. There is deliberately no automatic expiry, recreation, or blockchain resubmission; a timed-out submit may already have transferred funds. A failed operation returns a sanitized error. Inspect the recipient record and lock rather than retrying with another UID.

For reconciliation, use the official SDK's `getPayment` and `getIncompleteServerPayments`, matching metadata.testnetPayoutId and the payment ID with the database. If a txid was saved (or independently confirmed on Testnet), verify it and call only `completePayment(paymentId, txid)`; never submit the payment again merely because completion timed out. Record verified completion and address in the original recipient record before removing the matching lock. If create/submit outcome is unknown, inspect Pi's records and the wallet's Testnet transaction history first. Do not delete reservations to bypass uncertainty. This version intentionally requires operator reconciliation rather than offering a force-resend endpoint.

Run `npm run test:testnet-a2u --prefix backend`. Tests use a mocked SDK and in-memory Mongo collection stand-in; they do not prove credentials, actual Mongo durability, wallet balance, Pi consent or live blockchain success.

Sources: [official Node SDK](https://github.com/pi-apps/pi-nodejs), [advanced payments](https://developers.minepi.com/docs/accept-payment/PaymentsAdvanced), [Platform API](https://developers.minepi.com/docs/api-reference/PlatformAPI).


## Read-only preflight and first payout

`GET /admin/testnet/a2u/preflight?uid=<UID>` uses the same strict Hub bearer authentication. It performs only external GET requests: `/v2/me`, `/v2/payments/incomplete_server_payments`, and Testnet Horizon account/ledger reads. It never invokes create, submit, cancel, or complete. It checks recipient identity and wallet-address consent, valid seed format, API key acceptance, activated sender/recipient wallets, spendable balance after reserve/fee, and existing recipient/lock records. It returns public wallet addresses and booleans, never credentials. The POST performs these checks again before reserving a new payout. Completed payouts retain idempotent responses.

An accepted API key on the read-only endpoint alone does **not** prove it belongs to the intended Testnet app or that the seed wallet is connected to that app. Compare `senderWalletAddress` against the connected Testnet App Wallet in Pi Developer Portal and confirm this API key belongs to that same app. The payment response's network is still checked before submission. Preflight also cannot guarantee future network fees/balances or outcomes.

Normal Pi Browser login now requests `wallet_address` alongside `username` only when the existing SDK runs in sandbox/Testnet mode. Mainnet login scopes and SDK initialization are unchanged. Existing users must sign out and sign in again through the same Testnet app and approve wallet sharing; a persistent Hub session does not refresh an expired upstream Pi token. A UID from another app (or before revoked permissions) must not be reused.

1. Wait until `https://smajpihub.onrender.com/health` reports the new commit and MongoDB, and GitHub Pages has deployed the login change.
2. Recipient signs in freshly on the Testnet app and approves wallet sharing. Obtain **only** `user.uid` from the successful backend `/user/signin` response or authenticated `/user` response. Never trust a guessed UID or a profile badge. For a first payout to your own admin account, the helper below obtains your UID through authenticated `/user` automatically.
3. Sign in as admin. Privately obtain the current `session.accessToken` (`hub_access.…`) from your own sign-in response or the `accessToken` field of your browser's `smaj_hub_session` storage entry. Do not share/copy the full response, seed, API key, or refresh token into chat, screenshots, shell commands, or repository files.
4. In a trusted terminal at the repository root, run `python3 scripts/testnet-a2u.py`. Paste the admin Hub token at its hidden prompt. Enter the recipient UID, or press Enter to use your own verified admin UID. This command **cannot send a payment**; it only runs preflight. Compare its public sender address with the connected Testnet wallet in Pi Developer Portal. Confirm the key belongs to that app and both wallets are Testnet wallets.
5. Only when ready to approve the payment, run `python3 scripts/testnet-a2u.py --send`. It repeats preflight, asks you to confirm the wallet mapping, then requires the exact typed approval `SEND 0.01 TEST-PI TO <UID>`. It sends one POST only after that approval.
6. Expect `status: completed`, amount `0.01`, network `Pi Testnet`, paymentId, txid, and recipientWalletAddress; confirm receipt in Pi Wallet's Testnet view. On timeout/409, stop and reconcile. Never clear a lock to try again.

The helper uses only Python's standard library, never saves credentials, and defaults to a read-only check. Render access and an authenticated admin session are required to verify private runtime prerequisites; a public health response cannot verify the secret values or wallet connection.


## Admin website dashboard

Open **Admin Dashboard → Pi Payments → Testnet Payouts**, or `/admin/testnet-payouts`. Existing admin authentication is attached automatically by the shared API client; there is no token-entry flow. The page never reads, renders, or persists credentials itself. All payout APIs remain restricted to a valid admin Hub session, with credentials excluded from response projections and caching disabled.

The dashboard shows the configured Testnet wallet address, balance, available balance after reserve, API readiness, and any unresolved wallet lock. A read-only API cannot establish the Developer Portal app-to-wallet mapping: compare the displayed address with the connected Testnet app wallet before confirming a payout. Wallet seeds and API keys remain on the backend.

The recipient directory freshly verifies Pi `/me` identity and wallet sharing on the server, in batches of four across pages of twenty recent logged-in accounts. Search names, usernames or UID to find older accounts. Only users with verified identity and wallet consent are listed; previously reserved/paid users or wallets are disabled. No stored user token is returned. An empty page may require signing in again, granting wallet consent, searching, or moving to the next page.

Selecting a user runs preflight. **Send 0.01 Test-Pi** opens a native confirmation dialog showing recipient and sender addresses. Confirm the Developer Portal mapping and explicitly confirm the transfer. Cancellation sends no payment. New sends repeat server preflight and use the existing SDK flow. The page disables repeated clicks and does not retry uncertain transfers; a failed/unknown result requires checking the persisted history and reconciliation.

Each UID and wallet address can receive only once. `_id: wallet:<address>` reservations are acquired inside the existing serialized wallet operation before submission and retained after completion or uncertainty. Legacy completed/submitted records are also checked, so an alternate UID sharing an already paid wallet cannot bypass the protection. Never delete these reservations to force a resend.

The five-wallet progress indicator counts distinct recipient addresses only from Testnet records with completed status, a txid, and both Pi verification/completion flags. Reserved, pending, failed, cancelled or duplicate-wallet records do not count. History displays persisted IDs and addresses for all Testnet payout attempts, with pagination.

New read-only APIs: `GET /admin/testnet/a2u/dashboard?page=1` and `GET /admin/testnet/a2u/recipients?page=1&search=...`. Neither creates or submits a payment. Run backend checks with `npm run test:testnet-a2u --prefix backend` and mocked mobile/desktop browser checks with `npm run test:testnet-payouts --prefix frontend` (or append `-- --browser firefox`). The three browser checks passed in Firefox at 390px and 1280px, including cancel, confirm, history/progress, and uncertain-result behavior. Chromium could not launch in this execution environment. No real payment or production admin credential is used in these tests.

Deployment: both the GitHub Pages frontend and Render backend must serve this commit. A healthy `/health` on an older revision is not a completed backend deployment. Render must contain `PI_TESTNET_API_KEY` and `PI_TESTNET_WALLET_SEED`; the admin must have authorized access; recipient and sender wallets must be activated and funded appropriately. Mainnet and other service endpoints/configuration are unchanged.

Dashboard confirmations bind both displayed wallet addresses to the POST request. If either address changes, the server rejects before creation; the SDK payment addresses are checked against preflight again before submission. The optional `recipientWalletAddress` and `senderWalletAddress` fields are accepted for this purpose; existing UID-only clients remain compatible.


## Dashboard request/search investigation and fixes

Public production inspection confirmed backend `86a3a5f` was live with MongoDB and `/health` HTTP 200. Anonymous payout endpoints correctly returned HTTP 401; the `smajpihub.com` CORS preflight succeeded. The same preflight from `https://sandbox.minepi.com` was rejected. Sandbox CORS is now permitted only for Testnet payout and identity/session paths when the Testnet app key is configured. Mainnet payment and unrelated service routes retain their existing policy.

Confirmed source defects:

- Search used only username/name/UID and treated `@` literally. Wallet addresses were not indexed by verified login, so wallet lookup could not work. Search now normalizes `@username` and queries UID/name or locally known wallet addresses. This is not global discovery of arbitrary Pi wallets; a user must first authenticate with this app. Search by username can verify/backfill a legacy login's wallet; a subsequent wallet lookup then works.
- `/user/signin` discarded the wallet address returned by Pi's server. It now saves `piVerifiedUid`, `piIdentityVerifiedAt`, `piWalletAddress`, and `piWalletVerifiedAt` exclusively from the server's `/me` response, rejects missing authoritative UID/username, and never trusts a browser-supplied wallet address. Signup/signin failure logs no longer dump Axios headers/tokens.
- The directory silently discarded every upstream verification failure and required a live recipient OAuth token even though A2U itself uses app credentials and UID. Previously saved, server-verified consent may now survive OAuth expiry. A fresh identity mismatch, missing consent or denied permission removes eligibility and invalidates saved wallet evidence. Blocked/revoked local access remains rejected. Pi's payment DTO still must match the confirmed wallets, UID, network and amount before submission.
- The shared API client selected the cached profile token even when the canonical `smaj_hub_session` held a newer Hub token. Only payout requests now prefer the existing canonical Hub credential; no user copy/paste or weaker admin authentication is introduced.
- A generic shared admin check could intercept requests before payout-specific JSON errors. Payout routes now run their existing strict Hub/admin handler directly before the unrelated admin middleware. Session, role, API route, network/CORS, timeout and server errors receive distinct messages. Search errors and missing consent/API-outage counts are shown separately from a genuine no-match result.

The reported `[pi-payment-recovery]` 401 loop belongs to `storePaymentRecovery.ts`, which retries using **PI_API_KEY** through `platformAPIKeyClient`. Testnet A2U uses **PI_TESTNET_API_KEY**. Those log entries alone do not demonstrate failure of the A2U key. The Store worker, its credentials, Mainnet and other services were not rerouted or changed. Production access is needed to determine whether its separate key is missing, invalid, or belongs to a different app/payment history.

Readiness now distinguishes absent/invalid seed, missing Testnet app key, Pi HTTP 401, Pi HTTP 403, API outage, incomplete payment, unactivated wallet and insufficient spendable funds. Only configured booleans, HTTP status, public wallet address, balances and safe messages leave the server. Backend revision is displayed. Public health and anonymous checks cannot verify the private seed/key, connected-app mapping, or an authenticated admin's exact failing response; none of those are claimed verified without access.

The mobile test fixture now renders AuthProvider, BrowserRouter and the full AdminLayout, with the complete application CSS. Payout-specific mobile styles reserve space beneath the fixed admin header and constrain the SPI logo. Browser checks assert logo/header/title separation and inspect both light and dark confirmation dialogs.

Validation includes a real local HTTP Express login/session/admin-router flow with in-memory database and mocked Pi/Horizon responses. It checks server wallet evidence against spoofed client input, `@username`, UID and wallet searches, OAuth expiry, revoked consent, admin access and read-only readiness. External mutation calls are forbidden in that integration test. Browser send tests use mocked responses, never production payment credentials.

Sandbox identity requests cannot exchange cookie-only sessions for credentials: login verifies its own Pi token, refresh requires an explicit Hub refresh header, and allowed identity reads/presence/signout require a verified Hub bearer. Profile editing and Mainnet payment paths are not added to the Sandbox CORS allowance. Full-layout dark-theme inspection also exposed shared root input tokens overriding the admin theme; payout search now bridges semantic control tokens to the selected admin theme without adding global overrides or new !important declarations.
