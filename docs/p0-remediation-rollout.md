# P0 remediation implementation and rollout prerequisites

This change is a local implementation and commit. No production migration, credential change, deployment, wallet transfer, or push was performed.

## Implemented safeguards

- Paid Store and Jobs receipts cannot be downgraded by client cancellation/failure callbacks. Such callbacks are observations, not authoritative financial outcomes.
- Store approval and Jobs billing validate authoritative payer, amount, intent metadata, direction and deployment network. Jobs activation occurs transactionally and retains its original activation date on replay.
- Shared `pi_payments` records use deterministic MongoDB `_id` claims for payment identity, transaction identity and one credited receipt per economic intent. These use the built-in unique `_id` index; no historical backfill or new index build was executed.
- Order creation uses a buyer-scoped idempotency key and MongoDB transactions for price snapshot, stock decrement, order and internal notices. Cancellation and stock release use the same session. An expiry worker releases only reservations with no bound payment.
- CV access is centrally filtered by ownership, current visibility, employer application relationship and blocking. Historical public URLs are withheld from employers. New CVs require signed authenticated Cloudinary uploads registered to their owner; downloads are authorized server-side. Sensitive Jobs responses do not enter offline cache.
- Verified Store receipts create held merchant payable records. Administrative settlement accepts only an authoritatively verified app-to-user transfer for the order, seller and amount. Refund completion likewise requires a verified return payment, not arbitrary reference text. Settlement and refunds serialize against the order.
- Reconciliation APIs expose held settlements and payment exceptions. Seller payment notices explicitly distinguish app receipt from merchant settlement.
- Jobs server recovery resumes bound submitted billing transfers; Jobs checkout remains locked until a terminal SDK callback and resumes existing attempts before creating a wallet payment.
- MongoDB root initialization credentials are separate from application credentials in both Compose recipes. The root recipe no longer publishes MongoDB on a host port. Production rejects standalone MongoDB. Production preview-origin access is restricted, device validation fails closed, and bearer tokens are checked against Pi and revoked on signout/device revocation.
- Public production Jobs reads do not run demo seed/backfill routines.

## Required before any deployment

1. Confirm the target MongoDB is a replica set or supported sharded deployment. Transactions intentionally fail closed on unsupported deployments; no unsafe standalone fallback is implemented. The existing standalone Compose MongoDB is therefore insufficient for a production rollout without separately approved topology preparation.
2. Set `PI_NETWORK` explicitly to the exact provider value: `Pi Testnet` or `Pi Network`. When omitted, startup retains the existing `Pi Testnet` default; invalid explicit values still fail validation. Render declares this variable as externally managed (`sync: false`) to preserve the actual app network. Mainnet payments require `Pi Network`; the fallback does not weaken payment network matching. Validate app/key/network alignment in sandbox first. Existing seven-decimal Store comparison semantics are preserved; valuation and pricing policies were not changed.
3. Provision a database-scoped application user out of band. `MONGODB_USERNAME`/`MONGODB_PASSWORD` are application credentials; `MONGO_ROOT_USERNAME`/`MONGO_ROOT_PASSWORD` initialize the database administrator. Changing Docker environment variables does not rotate existing users or create an application user in an existing volume. No user provisioning was executed.
4. Review actual firewall/Atlas allowlists, remote TLS, backups, restore procedures and application privileges. Existing startup index creation and connect-mongo session index requirements must be accounted for during role preparation.
5. Configure `CLOUDINARY_API_KEY` and `CLOUDINARY_API_SECRET` on the backend for protected CV uploads/downloads. Test authenticated raw PDF delivery with the actual Cloudinary account. Existing public files require an approved cleanup/re-upload operation; this commit cannot revoke already downloaded documents or already disclosed URLs.
6. Run the real transaction test on an isolated local replica set with `NODE_ENV=test` and `P0_TEST_MONGODB_URI`. It generates and removes a disposable `p0_test_*` database and accepts only a loopback URI. This test is skipped when that variable is absent. No local MongoDB server or Docker executable was available during this implementation.
7. Perform read-only historical reconciliation before considering backfills. Older receipts do not automatically become merchant payable records; duplicate transfer bindings, cancelled-but-paid orders and inconsistent stock must not be repaired by assumptions.
8. Add supporting nonunique query indexes through a reviewed, separately approved schema operation: `orders(status,paymentId,reservationExpiresAt)`, `merchant_settlements(sellerUid,createdAt)`, `merchant_settlements(status,createdAt)`, `cv_assets(ownerId,url)`. Existing Jobs billing status indexes support recovery. No new index migration was executed.
9. Exercise sandbox flows: interruption after Pi approval/completion, backend restart, duplicate browser callbacks, CV download with changing permissions, reservation expiry, cancellation during payment and verified payout/refund recording.

## Settlement activation boundary

This implementation records and verifies existing outbound Pi payments; it does not initiate payouts or add a wallet signer. The app's outbound capability, funded wallet, signing custody, payout approval/release policy and operating procedure must be verified and approved before automated transfers are implemented or enabled. Full-order settlement/refund is supported; partial allocations and merchant-recovery refunds remain held for explicit reconciliation.

Administrative endpoints:

- `GET /admin/financial-reconciliation`
- `GET /admin/settlements`
- `POST /admin/orders/:id/settlement` with `paymentId` for a completed, verified outbound payment carrying matching `orderId` metadata.
- `PATCH /admin/orders/:id/refund`: completion uses `reference` as a Pi payment ID and requires matching `refundOrderId` metadata.
- `GET /marketplace/seller/settlements`: authenticated seller's records only.

The notification system remains advisory. A held payable or an incoming receipt is not represented as a completed merchant transfer.

## Validation and remaining limits

Local automated tests cover payment mismatches, cross-domain claims, late callbacks, CV redaction, billing replay, stable checkout identity, one-time stock expiry/release and verified settlement recipients. Existing Store recovery and SDK tests are retained. Live Pi/Cloudinary behavior and real MongoDB crash/concurrency behavior remain deployment gates, not claims established by mocks.

The audit's pre-existing Jobs UI text assertion and storage validation fixture assertion are outside this financial change. This is not a claim that every repository test is green.

## Rollback

Do not redeploy the previous payment writers after accepting new financial records: they can downgrade paid states and bypass the shared ledger. If a rollout fails, hold new checkout/payout operations while preserving read and same-payment recovery paths, and deploy a forward fix. Retain verified receipts and exception records. No data deletion, stock recomputation or ledger rollback should be performed without a reviewed reconciliation operation.

## Technical references

The existing Pi Platform API supplies authoritative payment details and outbound payment lookup: [Pi Platform API](https://github.com/pi-apps/pi-platform-docs/blob/master/platform_API.md).

Protected document delivery uses the existing asset provider's signed authenticated access: [Cloudinary access control](https://cloudinary.com/documentation/control_access_to_media).
