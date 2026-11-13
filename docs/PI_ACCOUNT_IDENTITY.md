# Returning Pi account identity

## Confirmed code defects and investigation limits

The old `/user/signin` flow verified the Pi token with `/v2/me`, then looked up `users.uid`. Any unrecognized UID immediately created a blank buyer account. A local HTTP reproduction demonstrated that a different app UID with the same username created a second incomplete account, while the original UID still returned the complete seller profile. An ordinary returning login also replaced the saved roles array with a single role.

Pi documents UID as app-specific. Creating a paired Mainnet app can therefore be relevant, but pairing does not authorize matching users by name. Login scopes and wallet addresses are not cross-app ownership proof. The exact production cause and duplicate count remain unverified: no production MongoDB connection, affected verified UID pair, or original/paired Developer Portal app IDs were available during this work. A wrong backend database selection can produce the same missing-account symptom and must also be checked.

Configuration inspection found `.env.public` and the Pages workflow using Sandbox, `.env.production` using non-Sandbox, and separate OAuth client configuration for SoloHost/native flows. The previous SDK helper could override an explicit false setting based on the referrer. Explicit configuration now takes precedence and the fallback checks the exact Sandbox hostname. The Pages workflow honors an explicit repository Sandbox setting while retaining its previous true default. No repository variables, production credentials, app registrations or network settings were changed.

## Resolution rules

- The incoming UID and username must be verified by Pi's server. Browser roles, usernames, wallet addresses and app/environment hints cannot select another account.
- A unique existing UID returns the same canonical account. Login updates authentication metadata, not saved profiles, verification, seller flags, settings or roles. Existing additional roles are preserved; the existing configured-admin promotion remains supported.
- A new UID colliding with a saved username stops with `pi_account_recovery_required`. The username is only a reason to stop signup, never a reason to link or merge.
- A remembered account UID is a refusal-only continuity hint. It cannot grant access or override a verified existing UID or approved binding. A missing remembered account stops instead of provisioning a replacement; check the database and app identity. Explicit sign-out clears the browser hint for intentional account switching.
- Duplicate UID records stop rather than selecting an arbitrary profile. A canonical target must itself have a unique UID before a new session can be issued.
- New users without conflicts can still register. The frontend never fabricates a local buyer profile after backend failure or an unconfirmed response.

## Approved cross-app bindings

Login reads `pi_account_identity_links`. The admin recovery endpoint can insert a binding only after record inspection, separate Pi verification of both UIDs and explicit admin approval. No bindings were applied in production from this workspace. A privileged operator must verify ownership of both identities and obtain explicit migration/reconnection approval first. Matching usernames, matching wallets, client Sandbox flags and client IDs alone are insufficient.

An approved binding has this schema, using real IDs only in the private database after review:

- `_id`: incoming UID freshly verified by Pi.
- `canonicalUserId`: original MongoDB account ObjectId as a 24-character string.
- `canonicalUid`: original account UID, retained unchanged.
- `originalAppId`, `incomingAppId`: reviewed Developer Portal app identifiers.
- `status: approved`, `approvedBy`, `approvedAt`, `proofReference`: auditable authorization and ownership evidence.
- If the incoming UID already has separate account records: `duplicatesReviewed: true` and `reviewedDuplicateAccountIds` containing every affected account ID.

An approved binding reconnects authentication to the original account without copying, merging or deleting either profile. It never replaces the original UID, Testnet Pi token or wallet-verification evidence with the paired app's credentials. Original seller tools and order ownership continue using the original canonical UID. Data belonging to an existing duplicate remains untouched and may require a separate, explicitly approved migration. Review duplicate sessions as part of that plan; do not silently migrate payment receipts or enable Mainnet payments.

`/me` does not attest a Developer Portal project ID. `lastPiLogin` records the server-verified UID, server configuration and explicitly labelled client hints for investigation; hints are not used as ownership proof. Optional `PI_LOGIN_APP_ID` only labels the configured entry app for diagnostics. Public OAuth client IDs and Developer Portal app IDs must be checked separately.

## Read-only production audit

After building, run in the existing backend environment with its existing MongoDB settings:

```
node build/scripts/auditPiAccounts.js --uid VERIFIED_ORIGINAL_UID --uid VERIFIED_INCOMING_UID --username CANDIDATE_NAME
```

The report only reads. It reports the selected database, candidate account IDs, verified UID/context evidence, profile-presence flags, roles/verification, timestamps and reference counts for orders, products, messages and device sessions. It omits tokens, connection strings, profile text, phone numbers and images. Username search only gathers review candidates.

Compare the report with controlled Pi logins in the original and paired app, Developer Portal URLs/network/client IDs, and historical account/order records. Confirm the current MongoDB database matches the original deployment. Take backups and approve the exact canonical account and duplicate-data plan before creating a binding or changing records. Do not reset MongoDB or create a unique UID index blindly when historical duplicates may exist.

## Regression checks

- `npm run test:pi-identity --prefix backend`
- `npm run test:testnet-a2u --prefix backend`
- `npm run test:pi-environments --prefix frontend`
- `npm run test:pi-accounts --prefix frontend -- --browser firefox`

Tests cover existing/new identities, both app environments, profile/role/history preservation, mismatched identities, approved binding, duplicate review, read-only audit, explicit environment selection, and browser preservation during recovery/outages. Database/Pi responses in the integration tests are local fixtures, not production ownership verification.

Official references: https://developers.minepi.com/docs/use-native-features/PiSignIn and https://developers.minepi.com/docs/api-reference/PlatformAPI.

## Persistent-session recovery follow-up

Previously, Hub access/refresh and cookie authentication looked up the incoming UID directly, bypassing approved recovery bindings. The browser also rejected a canonical UID returned by renewal, and a stale continuity hint could veto an approved binding at sign-in. These paths now use the same identity resolver. A validated refresh credential can reconnect its device session through an approved, duplicate-reviewed binding; the original account UID, profile, roles, verification and history remain unchanged. The device document records the prior UID and binding reference. Old alias access tokens require renewal. The browser accepts a UID transition only with matching server-issued recovery metadata.

An incomplete existing UID with a conflicting username stops for identity review instead of silently opening the incomplete profile. This collision is only a refusal signal and never grants access to another account.

For the reported users, gather candidates using the read-only audit in the production backend environment:

```
node build/scripts/auditPiAccounts.js --username alisha314159
node build/scripts/auditPiAccounts.js --username socialswithkime
```

Neither username is an identity binding. Production ownership, UID pairs and bindings for these users have not been verified from this workspace. Their recovery still requires the ownership evidence and privileged binding review described above. No production accounts were merged, deleted, reset or claimed restored. No additional test runs were performed for this follow-up at the user's request.

## Admin-assisted recovery

Open **Admin Dashboard → Users & Identity → Account Recovery** (`/admin/account-recovery`). Existing admin authentication applies; no access-token copying is required.

1. Inspect the affected username, including `alisha314159` and `socialswithkime`. This reads the deployed backend's current MongoDB database, saved UIDs, original/new account IDs, profile flags, roles, verification and order/product/message/session counts. Names only find candidates. Confirm this is the original production database; the workspace has no production MongoDB access.
2. Select the original account from verified historical evidence. Enter the incoming UID and both Developer Portal app IDs. Inspect **both UIDs together**, review every newer record, and confirm the records checkbox. Opening a request adds a recovery case only. The server checks the inspection fingerprint and original UID uniqueness.
3. Privately give the owner the expiring recovery code/link. They open `/account-recovery` through the **original Pi app**, verify the original identity, then repeat through the **incoming Pi app** with the same code. Both registrations must remain accessible and serve the recovery page. On Sandbox, navigate within the correct app preview. Use the Sandbox checkbox only for a confirmed Sandbox registration; Testnet alone is not Sandbox. No global Pi/payment configuration is changed.
4. Each proof requires owner consent and a server `/v2/me` verification of the exact expected UID. The random code is stored as a hash, expires after 24 hours and permits 30 verification attempts. Pi access tokens remain in request memory; only credential hashes, consent timestamps, UIDs and verification timestamps are retained. Proof never grants access. Pi `/me` does not attest app IDs or prove both identities belong to the same person: the admin independently verifies the registrations, owner and historical account evidence.
5. Refresh requests, select **Review**, inspect current records, record a private evidence reference and explicitly confirm ownership/app verification. **Approve identity reconnection** asks for confirmation. Approval inserts an immutable incoming-UID → original-account binding with reviewed duplicate IDs, proofs, reviewer and timestamps. Existing bindings cannot be overwritten. If records changed, open a new reviewed request. No profile, account, order or duplicate records are copied, updated, deleted or merged by these endpoints.
6. The owner signs in again. The original UID/profile, saved roles, verification, seller status and account history are used. Existing refresh sessions can reconnect through the approved binding. Newer records remain intact; moving their content requires a separate approval.

Blocked users can access the recovery page/proof endpoint without a Hub login. Inspection, case creation and approval remain admin-only. Sandbox CORS extends only to proof submission, which does not consume cookies or issue sessions. A recovery code authorizes proof submission only, never account access.

Collisions now say **"We found an existing account. Please complete account recovery to continue."** Authentication requests suppress duplicate global error notifications. The native welcome screen remains the sole native sign-in error display. Unaffected exact-UID logins keep their existing flow.

Deployment and production recovery remain unverified here. Production inspection, ownership checks, app-registration review and each final binding approval must be performed by an authorized administrator. No additional test suites were run at the user's request; static compilation/theme checks do not verify runtime behavior or production ownership.

Official Pi token verification/app-specific UID contract: https://developers.minepi.com/docs/api-reference/PlatformAPI .
