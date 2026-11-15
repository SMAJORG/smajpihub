# SMAJ PI HUB Mainnet cutover

Status: code prepared; **production migration and backup have not been performed**.
The connected Atlas AI client is read-only and exposes no backup/export tool.
This checkout has no MongoDB credential, no MongoDB Database Tools, and no
Mainnet app key. Do not interpret a successful build as permission to skip backup.

## 1. Back up before changing production

On a trusted operator host with MongoDB Database Tools, pause application writes
(including payment/inventory recovery). Keep the existing production configuration
until the backup and isolated restore finish. Inject these protected environment
variables through a secret manager, never through chat or command-line URI flags:

- `MONGODB_URI`: existing database connection, with backup/read and isolated restore permissions.
- `MONGODB_DATABASE_NAME=smajpihub`.
- `BACKUP_ENCRYPTION_KEY`: base64-encoded 32-byte AES key, retained separately in a secret manager.
- `BACKUP_WRITES_QUIESCED=true`: attest that every application writer is stopped.
- `BACKUP_DIRECTORY`: durable, private storage outside the repository and Render's ephemeral filesystem.

Run `npm run backup:mainnet --prefix backend`. It invokes mongodump with its URI in
a private temporary config file, encrypts the gzip BSON archive using AES-256-GCM,
hashes it, restores into a new `smajpihub_restorecheck_*` namespace, and compares
document counts and index definitions. It never drops or restores over originals.
The restore-check database remains for operator review; nothing is auto-deleted.
Keep the encrypted archive, JSON receipt (IV, authentication tag, inventory and
checksum), and encryption key in separate protected durable storage. A failed
restore or missing `restoreVerified:true` prohibits cutover. Rehearse this tooling
on a nonproduction database first. Encryption-key loss makes the archive unusable.

For Atlas-managed snapshots, use Atlas Backup if available on the cluster, then
restore a snapshot into an isolated cluster and verify it before recording an
equivalent backup checksum/receipt. Never manufacture a backup attestation.

## 2. Register two separate application addresses

Screenshots confirm both Pi apps currently list `https://smajpihub.com`; only the
Mainnet screenshot shows ownership verified. Keep this as Mainnet production.
Host Testnet separately (for example a provisioned `testnet.smajpihub.com`), with
its own frontend/backend deployment and verify that address in the original
Testnet Developer Portal app. A DNS name in this document is not a provisioned
deployment. Do not redirect the Testnet address to the Mainnet address.

Preserve the existing Testnet Developer Portal app registration: it is needed to
prove the original Pi UID. In its Sandbox, the original production frontend can
still perform the two-proof linking workflow. Changing a payment network or
pairing the apps is not proof that two UIDs belong to the same person.

## 3. Protected production configuration

Render service: `smajpihub` (`srv-d93ogkflk1mc739mn8k0`), confirmed workspace
`tea-d93od0u7r5hc73dfg980`. Existing service environment is managed in Render;
this change does not rewrite the legacy multi-service Blueprint.

After backup/restore verification, configure these settings in Render Environment:

| Setting | Mainnet production |
| --- | --- |
| `PI_COMMERCE_MODE` | `mainnet` |
| `PI_NETWORK` | `Pi Network` (Pi API's exact Mainnet network identifier) |
| `PI_MAINNET_APP_ID` | Public ID from the verified Mainnet app |
| `PI_MAINNET_API_KEY` | That Mainnet app's private API key; enter directly in Render |
| `PLATFORM_API_URL` | `https://api.minepi.com` |
| `MAINNET_BACKUP_SHA256` | SHA-256 from the protected backup receipt |
| `MAINNET_BACKUP_RESTORE_VERIFIED` | `true`, only after a successful isolated restore |
| `PI_PAYMENTS_ENABLED` | `false` until Pi wallet approval and payment smoke tests are ready |
| `PI_MAINNET_INCOMING_WALLET_APPROVED` | `true` only after the Pi-approved incoming app wallet is connected |
| `MONGODB_URI` / database | Existing database; do not replace it with an empty database |
| `SESSION_SECRET` | Dedicated production secret, different from development |
| `FRONTEND_URL` | `https://smajpihub.com` |

Mainnet startup refuses legacy collections, a missing backup attestation,
unconfigured Mainnet credentials, a reused legacy API key or an unapproved wallet
when payments are enabled. It selects only `PI_MAINNET_API_KEY` in Mainnet mode;
the old `PI_API_KEY` remains available for the separate Testnet deployment.
These are operator attestations, not independent evidence of Pi approval or backup.
Do not enable them merely to bypass startup checks.

University payment completion additionally requires a server-bound Pi payment ID
and matching `universityPaymentId` metadata; manually supplied transaction hashes
cannot mark an application as paid. A university checkout that cannot provide this
binding remains unavailable for real payments rather than accepting an unverified receipt.

For development, use `PI_COMMERCE_MODE=testnet-development`, `PI_NETWORK=Pi Testnet`,
the original Testnet app's `PI_API_KEY`, a separate session secret and its separate
frontend URL. Identity collections remain shared. Commerce and credentials use
`testnet_dev_*` collections, so development cannot modify archived Testnet orders.
Never keep an old `legacy` instance writing to original commerce collections after
cutover. Restrict its database permissions or retire it after the replacement is ready.

## 4. Storage and account behavior

Original `users`, identity proofs/links, profile verification and seller/admin
roles remain in place. Mainnet does not copy users or relabel original accounts.
Mainnet commerce, prices, listings, orders, receipts, settlements and sessions
start in new `mainnet_*` collections. No legacy balance or transaction is converted
to real Pi. Existing unconfigured deployments remain `legacy` until explicit cutover.

The `/account-link` workflow verifies both identities through Pi `/v2/me`. The
original account stays primary, links are consumed transactionally, and future
login resolves either UID to the original account. Username alone never authorizes
linking. New usernames register normally; a colliding original username requires
ownership verification rather than creating a duplicate. The operator cannot
approve Pi authentication on a user's behalf. Keep private codes out of chat.

Payment checks retain Pi's actual payer UID and resolve only a verified link for
account ownership. The receipt stores `payerUid` and canonical `accountUid`.
Network, amount, direction, intent ID, transfer ID and completion checks still apply.
Stream paid subscription state uses network-specific fields; original Testnet
subscriptions remain untouched. Testnet enrollment and commerce data is not
promoted into Mainnet subscriptions or balances.

Authenticated history APIs are GET/HEAD only:
`/history/testnet/orders`, `/products`, `/jobs`, `/education`, `/university`,
and `/transport` under the same prefix. They return only the current original
account's records, bounded to 100 per page (`?offset=100`), with `readOnly:true`.
Only safe receipt/listing fields are returned; there are no archive mutation routes.
The legacy Testnet transaction feed serves its archived verified snapshot without
running Pi API refreshes under Mainnet credentials.

## 5. Activate and verify

Deploy the backend and check `/health` for the expected revision, `commerceMode:
mainnet`, `paymentNetwork:Pi Network`, and payments disabled initially. Confirm
Mainnet catalog/orders are fresh and the original Testnet history remains readable.
Prove/link one original administrator and one seller from both registered Pi apps,
then verify their original MongoDB IDs, roles, usernames and profile verification.
Confirm a genuinely new user can register. No pre-mapping by username is allowed.

Only after backend readiness, set GitHub Actions repository variable
`PI_MAINNET_READY=true` and rerun the Pages workflow. That builds production with
`VITE_SANDBOX_SDK=false`; the Sandbox iframe still initializes Sandbox explicitly.
The variable remains unset during this preparatory commit, so pushing cannot
prematurely switch the public application to Mainnet. Testnet development must
use its own build with `VITE_SANDBOX_SDK=true` for Sandbox testing.

Before enabling real payments, verify a controlled low-value U2A payment and its
approve/complete/retry flow under the Mainnet app. Never send real Pi merely to
test configuration without the payer's explicit approval. Pi requires an approved
Incoming Multisig Wallet for U2A; Mainnet A2U payouts also need Outgoing Wallet
approval. Identity linking does not grant wallet or outgoing-payment approval.

Rollback before any real payment: restore previous deployment settings and Pages
variable; no user or commerce data is rolled back or deleted. After real payments,
disable new payments and reconcile pending receipts before any environment change.

References: [Pi Mainnet launch](https://developers.minepi.com/docs/build-first-app/Launch),
[MongoDB backup/restore](https://www.mongodb.com/docs/atlas/backup-restore-cluster/),
[Render environment settings](https://render.com/docs/configure-environment-variables).
