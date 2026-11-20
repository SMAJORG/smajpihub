# Testnet A2U qualification payouts

Reviewed 17 November 2026 against the official Pi [Advanced Payments](https://developers.minepi.com/docs/accept-payment/PaymentsAdvanced), [Platform API](https://developers.minepi.com/docs/api-reference/PlatformAPI), and [Node.js backend SDK](https://github.com/pi-apps/pi-nodejs). The public documentation describes A2U; confirm the particular five-recipient qualification checklist and paired-app relationship in your Developer Portal. Code cannot approve a Mainnet App Wallet.

## Current investigation

The connected Render workspace has a Mainnet SMAJ backend, but no separate Testnet backend service was found. The Mainnet backend deliberately returns HTTP 410 for Testnet payout routes. Keep that boundary. No live keys or seed were available in the local configuration, so app-key ownership, wallet funding and portal pairing cannot be certified here. Do not send credentials in chat.

No payout records were found in the existing qualification collections during this investigation. No payment has been created, signed, submitted or completed by Codex. Five confirmed transaction IDs cannot be reported until the five approved transfers actually complete.

## Safety and approval

### Separate Testnet administrator sign-in

The Testnet build's `/admin/testnet-payouts` route provides a server-verified username/password login independent of Pi SDK and Pi domain verification. It uses the same configured administrator name already authorized by `ADMIN_PI_USERNAMES`. It neither creates nor modifies a Pi/Hub user account. Its audit identity is explicitly `testnet-admin:<username>`, not a Pi UID.

On the isolated Testnet API service only, configure:

```dotenv
PI_TESTNET_ADMIN_AUTH_ENABLED=true
PI_TESTNET_ADMIN_USERNAME=smalaajimi36
PI_TESTNET_ADMIN_PASSWORD_HASH=GENERATE_LOCALLY_DO_NOT_USE_THIS_PLACEHOLDER
```

Keep the existing `ADMIN_PI_USERNAMES` list; the selected username must be in that list. Generate a random password and matching scrypt hash in your private terminal:

```sh
node backend/scripts/create-testnet-admin-credentials.cjs
```

Store the displayed password in your password manager. Enter only the generated `PI_TESTNET_ADMIN_PASSWORD_HASH` value directly in Render's backend Environment page. Do not put it in `VITE_*` variables, source, screenshots, or chat. Save and deploy the backend. No OAuth client ID or callback is needed for this administrator login. Keep these settings absent or disabled on Mainnet.

Login requires `PI_NETWORK=Pi Testnet`, `PI_COMMERCE_MODE=testnet-development`, a persistent isolated `*_testnet_a2u` database, and an enabled administrator-auth flag. It remains usable while payout sending is disabled. To inspect the wallet or send through the existing payout handlers, also enable `PI_TESTNET_PAYOUTS_ENABLED=true` after configuring the existing Testnet app wallet credentials. `PI_PAYMENTS_ENABLED=false` continues to disable unrelated user-to-app checkout.

Only a hash of the random session token is stored in `testnet_admin_sessions`. Sessions expire after 30 minutes, are revocable on logout, and become invalid when credentials, the administrator allowlist, or the deployment's network configuration changes. The browser keeps the token only in memory and requires another login after reload. Login attempts are limited to 10 per 15-minute window in persistent storage shared across replicas; this limit also applies to incorrect usernames. This narrow session is accepted only by the Testnet payout endpoints, never by the normal Hub user or general administrator authentication paths. Account roles and production accounts are unchanged.

This administrator login does not waive recipient consent or Pi payment checks. Recipients must still have verified identities and wallet-sharing evidence in the isolated Testnet database. Sender wallet funding, Testnet API-key validity, the SDK submit/complete sequence, and matching ledger proof remain required. A login or a dashboard view never sends a payment.

- Only the official pinned `pi-backend@0.1.3` SDK creates/submits/completes payments. Amount is fixed at **0.01 Test-Pi**. Five recipients total means **0.05 Test-Pi plus network fees**, preserving the sender's reserve.
- Payouts require `PI_NETWORK=Pi Testnet`, `PI_COMMERCE_MODE=testnet-development`, no fresh-Mainnet account mode, an explicit enable flag, and a separate database ending in `_testnet_a2u`. The production `smajpihub` database is rejected.
- Every recipient authenticates through the **existing paired Testnet app**, shares `wallet_address`, and is verified server-side with Pi `/v2/me`. No username matching, copied Mainnet UID, manually supplied wallet, original-profile update or account migration is involved. Qualification users and wallet evidence live only in the isolated Testnet database.
- The administrator must have a current Testnet Hub bearer session. Preflight returns a five-minute signed approval binding administrator, recipient UID, amount, network and both wallets. Sending requires that approval plus `approved: true` after the confirmation dialog. A read-only preflight never creates a payment.
- A persistent sender lock serializes requests across replicas. UID and recipient-wallet reservations never expire automatically. Retries do not create another transfer. After five ledger-verified completions, further qualification payouts are refused before creating a payment.
- Before submission, the authoritative Pi payment must match Testnet, UID, amount, direction and both confirmed wallets. After completion, both Pi flags and the exact transaction ID must match. The Testnet Horizon transaction and its single native-payment operation must also match sender, recipient, amount and the SDK's payment-ID memo. Only then does progress count.
- Uncertain outcomes remain locked. **Verify existing transfer (no resend)** uses only Pi/chain GET requests and updates isolated local evidence if Pi already confirms completion. It never creates, submits or completes a remote payment. Missing payment IDs or incomplete Pi completion still require operator investigation; do not remove locks or resend.

## Isolated deployment (owner setup required)

Do not change the current Mainnet service, MongoDB accounts, wallet, domain or login configuration. Deploy a separate copy of the existing backend/frontend for the existing paired Testnet app. No new Pi Developer Portal app is needed.

Backend settings on that separate service:

| Setting | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `PI_NETWORK` | `Pi Testnet` |
| `PI_COMMERCE_MODE` | `testnet-development` |
| `PI_MAINNET_ACCOUNT_MODE` | unset |
| `PI_PAYMENTS_ENABLED` | `false` (unrelated U2A remains disabled) |
| `PI_TESTNET_PAYOUTS_ENABLED` | `true` only when ready to use explicit admin approvals |
| `MONGODB_DATABASE_NAME` | `smajpihub_testnet_a2u` |
| `PI_TESTNET_PAYOUT_DATABASE_NAME` | same isolated database name |
| `MONGODB_URI` | secure connection using a database user restricted to the isolated database |
| `SESSION_SECRET` | a new strong secret unique to this Testnet service |
| `FRONTEND_URL` | the separate Testnet frontend HTTPS origin |
| `ADMIN_PI_USERNAMES` | your existing authorized administrator's verified Pi username |
| `PI_TESTNET_API_KEY` | server API key from the existing paired **Testnet** app |
| `PI_TESTNET_WALLET_SEED` | that connected Testnet app wallet's 56-character Stellar secret seed beginning with S |

Keep existing required non-payment deployment settings (such as Cloudinary public configuration) appropriate to the isolated copy. Never copy Mainnet secrets. The payout SDK does not fall back to `PI_API_KEY` or Mainnet credentials. It rejects a Testnet key equal to `PI_MAINNET_API_KEY`.

Frontend build settings for the separate Testnet site:

- `VITE_TESTNET_PAYOUT_TOOLS=true` exposes `/testnet-wallet` and `/admin/testnet-payouts` only in this build. It is absent by default in Mainnet builds.
- `VITE_API_BASE_URL` and `VITE_BACKEND_URL`: the isolated backend HTTPS URL.
- `VITE_SANDBOX_SDK=false` for the registered Testnet app's normal production URL. Testnet app registration selects Testnet; Sandbox is a development-preview mode, not a synonym for Testnet. No Run in Sandbox step is needed.
- `VITE_PI_PAYMENTS_ENABLED=false`; `VITE_PI_ADS_ENABLED=false`.
- Build using `npm run build --prefix frontend`, publish `frontend/dist`, and configure SPA fallback. Register/verify that separate URL on the **existing paired Testnet app**. The Mainnet app keeps `https://smajpihub.com`.

Credentials belong only in the hosting provider's protected environment settings, not in source, frontend variables, screenshots or chat. No new service or production configuration was changed by this code task.

## Complete the five transfers

1. In Pi Browser **Develop**, open the existing paired Testnet app. Confirm its server API key and connected App Wallet correspond to the isolated server settings. Compare the public sender address shown on `/admin/testnet-payouts` with the portal. Activate/fund that wallet on **Testnet**; do not fund a different network.
2. Ask five distinct recipients to activate their Testnet wallets in Pi Wallet, then open the **same Testnet app**, sign in normally and visit `/testnet-wallet`. Each chooses **Verify my Testnet wallet sharing** and approves wallet sharing. This writes only isolated qualification evidence and sends no payment.
3. Sign in as the authorized administrator on that Testnet site, open `/admin/testnet-payouts`, select one eligible recipient and run readiness checks. Review the exact recipient and sender addresses. Each recipient wallet must differ from the app wallet and the other four recipients.
4. For each transfer you approve, open **Send 0.01 Test-Pi**, check the wallet confirmation and click **Confirm and send 0.01 Test-Pi** within five minutes of preflight. Nothing sends merely by opening the page, searching, refreshing or running preflight.
5. Wait for **completed** and record the displayed **Transaction ID**, not just the Pi payment ID. Progress must reach **5 / 5** unique verified wallets. If a timeout occurs, inspect history and use **Verify existing transfer (no resend)** when appropriate. Do not automatically retry an uncertain payment.
6. Return to the Mainnet app's wallet application checklist in the Pi Developer Portal, refresh the paired Testnet payment requirement, and complete the remaining owner-only wallet/application steps shown there. If the portal does not count five verified transactions, confirm pairing and ask Pi support with the five public transaction IDs. Do not repeat payments or switch wallets blindly.

Optional CLI: `python scripts/testnet-a2u.py --base-url https://YOUR-ISOLATED-TESTNET-BACKEND` is read-only preflight. Adding `--send` asks for an exact typed approval and sends one payment only after confirmation. The CLI now refuses the existing Mainnet backend URL and forwards both confirmed wallets and signed approval. Use only in a trusted local terminal; never paste its token into chat.

## Tests

`npm run test:testnet-a2u --prefix backend` covers approval binding/expiry, environment isolation, ledger proof, five-payout cap, duplicate wallets/UIDs, concurrency, uncertain submission and read-only reconciliation. `npm run test:testnet-payouts --prefix frontend` exercises the existing admin interface with mocked endpoints in light/dark mobile/desktop scenarios. Automated tests never contact a live payment-writing endpoint. Live credentials, five recipient consents, each explicit payment approval and portal acceptance remain owner-controlled steps.
