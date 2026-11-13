# Testnet admin payout

`POST /admin/testnet/a2u` accepts JSON `{ "uid": "<Pi app-specific UID>" }` and an `Authorization: Bearer <admin access token>` header. Existing admin middleware and a second handler authorization check protect the endpoint. Cookie-only requests are rejected. The recipient must exist, be unblocked, and pass a fresh official `/v2/me` token check. The amount is always 0.01 Test-Pi; other body fields are rejected. One payout is allowed per UID across all administrators, including when a caller changes credentials or retries.

Only the official published `pi-backend@0.1.3` SDK is used. Its createPayment → getPayment → submitPayment → completePayment flow is isolated from existing U2A payments, Mainnet configuration, UI, settlement, and services. The authoritative payment must have network `Pi Testnet`, the expected UID, amount, direction, and recipient address before blockchain submission. Completion requires a matching verified txid and both completion flags.

## Prerequisites

- Render must redeploy this backend commit and install the updated dependency locks. The existing Docker build uses Yarn; both npm and Yarn locks include the SDK. Existing Node 20 deployment meets runtime requirements.
- `PI_TESTNET_API_KEY` must belong to the same Testnet app used by the recipient. `PI_TESTNET_WALLET_SEED` must be its connected wallet's **56-character Stellar secret seed starting with S**, not a 24-word passphrase. Credentials are read only server-side; no default or Mainnet credentials are used.
- The connected Testnet app wallet must be activated and funded for 0.01 Test-Pi plus network fees and minimum reserve. Its public address must match the payment's sender (also checked by the SDK).
- Recipient needs an activated Testnet wallet and wallet-address sharing consent for this app, a valid stored Pi token, and an app-specific UID from verified authentication. A profile verification badge alone is insufficient. Existing login flows are unchanged.
- MongoDB must be writable. Payout collection uses majority, journaled writes; its built-in unique `_id` index reserves each recipient and the wallet operation across processes.

No real payout was attempted during local tests: no recipient UID was supplied, and Render credentials/balance were not accessed. Presence, correctness, funding, consent, and successful deployment must be confirmed in that runtime before a live test.

## Storage and failures

`testnet_a2u_payments` stores recipient UID, initiating admin UID, fixed amount/network, payment ID, recipient wallet address, txid, Pi completion flags, status and timestamps. IDs and address are saved before advancing to the next irreversible step. Tokens and seeds are never stored in this collection, logged, or returned by the handler. Completed retries return the saved record.

A separate `_id: "wallet-lock"` record serializes this wallet's operations. Only successful completion releases it. SDK errors, rejected network details, database failures, and process crashes leave reservations intact. There is deliberately no automatic expiry, recreation, or blockchain resubmission; a timed-out submit may already have transferred funds. A failed operation returns a sanitized error. Inspect the recipient record and lock rather than retrying with another UID.

For reconciliation, use the official SDK's `getPayment` and `getIncompleteServerPayments`, matching metadata.testnetPayoutId and the payment ID with the database. If a txid was saved (or independently confirmed on Testnet), verify it and call only `completePayment(paymentId, txid)`; never submit the payment again merely because completion timed out. Record verified completion and address in the original recipient record before removing the matching lock. If create/submit outcome is unknown, inspect Pi's records and the wallet's Testnet transaction history first. Do not delete reservations to bypass uncertainty. This version intentionally requires operator reconciliation rather than offering a force-resend endpoint.

Run `npm run test:testnet-a2u --prefix backend`. Tests use a mocked SDK and in-memory Mongo collection stand-in; they do not prove credentials, actual Mongo durability, wallet balance, Pi consent or live blockchain success.

Sources: [official Node SDK](https://github.com/pi-apps/pi-nodejs), [advanced payments](https://developers.minepi.com/docs/accept-payment/PaymentsAdvanced), [Platform API](https://developers.minepi.com/docs/api-reference/PlatformAPI).
