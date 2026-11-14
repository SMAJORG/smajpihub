# Connect paired Pi app identities

The user must control both Pi identities. A shared username, wallet address,
payment network setting, or administrator assertion is never sufficient proof.
There are no preapproved production mappings in this feature.

1. Open `/account-link` through the original SMAJ PI HUB Pi app in Pi Browser.
   Choose **Verify original identity** and approve username access. The server
   verifies the token with Pi `/v2/me` and locates the original account by UID.
2. Copy the private code into `/account-link` through the paired app. Do not send
   it to support or paste it into a chat. Codes expire after ten minutes.
3. Choose **Verify second identity**. Review both UIDs and the original profile
   and role. Confirm only if both identities and the original account are yours.
4. Sign in with Pi again. Both verified identities now resolve to the original
   account. Repeat the procedure for another identity if needed.

Open each page through its actual registered Pi app context. This workflow does
not switch SDK sandbox settings or infer an app ID from a payment network.
Both apps must reach the same backend and MongoDB database. If Pi returns the
same UID for both proofs, no binding is necessary; the workflow refuses that
redundant connection. If the original app can no longer authenticate its UID,
restore access to that app or seek authoritative identity evidence from Pi.

New users continue through ordinary Pi sign-in. Existing users should connect
their identities before signing in from their other app. A username collision
can prevent duplicate registration, but can never grant access to an account.

## Data and security behavior

- Original MongoDB `_id`, canonical UID, profile, roles, seller state, products,
  orders, messages and history remain unchanged. No user document is deleted.
- Existing newer account records remain stored; their separate data is not
  merged. Future authentication for their verified UID resolves to the primary
  account. Support must review any separate newer activity independently.
- Pi payment tokens, wallet consent and recipient UIDs are not copied between
  apps. Linking authenticates account access; it does not migrate payment rights.
- Codes are 256-bit secrets stored only as SHA-256 hashes. Pi access tokens and
  raw codes are never stored in link records, URLs, browser storage or logs.
- Preview requires the second Pi proof; completion requires explicit confirmation
  of the original UID. Code consumption and binding insertion are one MongoDB
  transaction with majority write concern. Linking fails closed without MongoDB
  transactions. TTL cleanup is supplemental; expiry is checked on every request.
- Existing secondary device sessions are revoked at completion. Neither account
  may be blocked, a newer existing account cannot replace an older one, identities
  cannot be rebound, and bindings cannot form chains. No role is taken from the
  second app's username or client-provided user fields.
- Original-app verification and second-app verification are recorded with times
  and their canonical account references in `pi_account_identity_links`. They
  attest possession of two Pi `/me` credentials, not a Pi developer app ID.

`POST /user/pi-identities/start`, `/preview`, and `/complete` accept explicit Pi
proofs and do not authorize via browser cookies. They return no-store responses,
apply a bounded per-process attempt limit, and return sanitized errors.
The frontend route is public because an identity conflict can prevent sign-in.

## Validation

Run `npm run test:pi-identity` in `backend`, and the frontend build, theme check
and account-link browser checks before release. Use a transaction-capable MongoDB
replica set in production. No automatic user migration runs on deployment.
