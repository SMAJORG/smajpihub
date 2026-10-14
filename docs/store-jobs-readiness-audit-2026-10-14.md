# SMAJ PI HUB — 1.3 Store + Jobs Readiness Audit

Date: 14 October 2026, Asia/Dubai. Phase 1: audit only.

Repository revision inspected: `879d11d945b16f3eba159041821a22f4691181e4`.

## Readiness decision

**SMAJ Store: PARTIAL; not ready for trusted, repeatable real-world commerce.** Catalog management, buyer/seller communication, orders, Pi payment completion, recovery, reviews, and administrative dispute/refund records exist. Several isolated payment and order behaviors passed tests. However, payment callbacks can corrupt paid records, inventory updates are not crash-safe across collections, and no merchant payout/settlement implementation was found.

**SMAJ PI Jobs: PARTIAL as a recruitment service; not ready as a funded freelance contracting marketplace.** Employer enrollment, company management, moderated posting, applications, profiles, interviews, offers, and manually acknowledged salary records exist. Fixed-price project contracts, milestones, funding, delivery submissions, approval, and project completion are missing. Billing payment verification and candidate CV access contain P0 defects.

**Production readiness: UNVERIFIED.** No production database, deployment, actual wallet transfer, or live Pi API was contacted. Production database permissions, installed indexes, network controls, backups, and mainnet configuration cannot be certified from repository files.

The first approved implementation should repair payment binding/state integrity and candidate privacy, followed by inventory integrity and merchant settlement. Homepage redesign and expansion features should not precede these controls.

## Scope and evidence standard

Reviewed frontend Store and Jobs pages, API clients, SDK hooks, Express handlers, MongoDB collection/index initialization, authentication/session services, payment/recovery services, deployment configuration, and relevant tests. The separate native application's Store order screen was also inspected; it displays shared orders but does not establish complete web/native workflow parity.

All execution used isolated tests, local mocks, or in-memory collections. The application server was not started against a configured database. Migration, cleanup, seed, upload, payment, and deployment scripts were not executed against external systems. Temporary audit reproductions ran from standard input and created no source/test files.

Status meanings:

- **WORKING:** the stated, bounded behavior was verified through code and passing executed tests. This does not certify the broader feature or live infrastructure.
- **PARTIAL:** implementation exists, but a concrete gap or defect prevents readiness.
- **MISSING:** no implementation found for the requested behavior in the inspected repository.
- **UNVERIFIED:** implementation or configuration needs runtime evidence; code presence alone is insufficient.

Source references below are repository-relative paths with line numbers. They refer to the inspected revision.

## Actual technology stack

| Layer | Repository evidence | Assessment |
|---|---|---|
| Web frontend | `frontend/package.json`; React 19, TypeScript, Vite 7, React Router, Axios | Identified; frontend TypeScript check passed |
| Backend | `backend/package.json`; Express 4, TypeScript, Axios | Identified; backend TypeScript check passed |
| Database library | `mongodb` native driver, declared `^6.12.0`; `backend/src/index.ts:10` | MongoDB, with direct collection operations; no Mongoose model layer |
| Sessions | `express-session`, `connect-mongo`; `backend/src/index.ts:179` | MongoDB `user_sessions`; HTTP-only cookies; TTL configured |
| Pi authentication | `/v2/me` request using user bearer token; `backend/src/handlers/users.ts:159` | Server validation exists; live identity behavior unverified |
| Pi payments | Browser SDK v2; backend API-key client; `frontend/src/lib/piSdk.ts`, `backend/src/services/platformAPIClient.ts` | Store completion substantially stronger than Jobs billing |
| Asset storage | Existing Cloudinary upload implementation | Deployment credentials and document delivery privacy unverified |
| Native clients | Capacitor web app and separate Expo application | Additional client paths require independent runtime checks |
| Deployment | Docker, reverse proxy, Render configuration | Configuration inspected; deployment not tested |

MongoDB remains the database. This report proposes no database migration, Supabase integration, new service, token, or change to Pi valuation/pricing policy.

## SMAJ Store feature assessment

| Requested feature | Status | Evidence and limitation |
|---|---|---|
| Seller registration | PARTIAL | Profile update can activate seller tools; `users.ts:339`. Activation is distinct from approved merchant verification. No complete identity-to-settlement onboarding was found. |
| Seller onboarding and verification | PARTIAL | Listing agreement, profile completeness, verification requests, listing/sales thresholds, admin review, and badges exist; `users.ts:428`, `marketplace.ts:151`. Settlement account verification and merchant payment readiness are missing. |
| Product creation | UNVERIFIED | Seller authorization, validation, image handling, draft/moderation states exist; `marketplace.ts:257`, `AddProductPage.tsx`. Full create/upload/moderate/list journey was not exercised. |
| Product editing and listings | UNVERIFIED | Owner-scoped edit/delete, availability, public approved-product filters, search, and pagination exist; `marketplace.ts:191,684,712,726`. Runtime ownership and moderation tests are still needed. |
| Pricing in Pi | PARTIAL | Pi price fields and existing conversion policy exist. Checkout derives its amount from server product data. Order pricing uses JavaScript numbers and seven-decimal rounding while listing inputs allow finer precision. Variant prices are stored but checkout does not bind a selected variant. |
| Buyer/seller communication | UNVERIFIED | Participant-scoped conversations, messaging, read state, attachments, and notifications exist; `messages.ts`. Persistence, abuse controls, attachment safety, and concurrent message behavior lack complete tests. |
| SDK initialization and duplicate-click protection | WORKING, isolated | `piPayment.test.mjs` passed initialization ordering, timeout, duplicate-click, and completion checks with a mocked SDK. Actual Pi Browser remains unverified. |
| Payment completion verification | WORKING, isolated | `storePayments.ts:28` checks payment identity, direction, payer, order metadata, amount, cancellation, and transaction/completion flags. Tests reject mismatches and unverified completion. This does not certify payment approval or all callback routes. |
| Complete payment workflow | PARTIAL | Approval does not first validate the Pi payment against the order; failure/cancellation routes can downgrade paid records; no unique payment binding across Store/Jobs. |
| Incomplete payment/server recovery | WORKING, isolated | Recovery tests passed interrupted browser completion, completed-at-Pi recovery, retries, mismatch rejection, and overlapping scans. Runtime restart and multi-process behavior remain unverified. |
| Order creation | PARTIAL | Server-side price snapshot and conditional stock decrement exist; insert failure attempts compensation. No request idempotency or atomic cross-collection reservation/order write. |
| Stock reservation resume | WORKING, isolated | Checkout test passed resuming the buyer's reserved order when stock is exhausted while refusing another buyer. It does not test a real MongoDB race or process crash. |
| Fulfillment and completion | PARTIAL | Seller controls processing/shipping; buyer confirms delivery/completion; compare-and-set updates and transition rules exist. No persisted buyer delivery address, selected variant, carrier/tracking evidence, or digital delivery record was found in order creation. |
| Order transition/inventory-release helpers | WORKING, isolated | Helper tests passed permitted/forbidden transitions and duplicate release suppression. Cross-document crash consistency remains deficient. |
| Reviews and ratings | PARTIAL | Buyer review is restricted to delivered/completed orders; seller aggregates ratings. Upsert has no unique `reviews.orderId` index in startup initialization, allowing concurrent duplicates. Runtime abuse/moderation checks remain unverified. |
| Disputes | PARTIAL | `order_disputes`, participant opening, active-dispute uniqueness, admin review/resolution, and notifications exist. No complete dispute-to-financial-resolution or evidence-preservation workflow. |
| Refunds | PARTIAL | Request, admin approval, and manual reference recording exist; `admin.ts:628`. A reference of six characters can mark a refund completed without verifying an actual return transfer. |
| Merchant payout/settlement | MISSING | Store accepts `user_to_app` payments. No seller settlement record, recipient-wallet validation, payout transfer, or reconciliation workflow was found. A seller notification saying payment received is not evidence of seller receipt. |
| Fraud prevention and marketplace security | PARTIAL | Authentication, ownership checks, moderation, blocked-user checks, self-order rejection, and reports exist. Payment-state corruption, missing settlement, stock locking, bearer revocation gaps, and incomplete abuse controls prevent readiness. |

## SMAJ PI Jobs feature assessment

| Requested feature | Status | Evidence and limitation |
|---|---|---|
| Employer registration | PARTIAL | Any signed-in user can self-enroll; sellers also qualify as employers. Company creation/claim and admin verification exist. Employer role does not imply verified organization identity. |
| Freelancer/candidate registration | UNVERIFIED | Authenticated users can create professional profiles, skills, employment history, preferences, and CV references; `jobs.ts:672,727,892`. Full enrollment/profile journey was not tested. |
| Job posting | PARTIAL | Owned-company restriction, input cleaning, expiry, moderation, and pending status exist; `jobs.ts:579`. No employer-owned job edit/close/delete API was found. Public read handlers also mutate/seed database records. |
| Applications | PARTIAL | Profile requirement, duplicate application check/index, snapshot, withdrawal, employer review, notes, and interviews exist. Employer status update lacks a transition graph/current-state guard; live application and concurrent mutation tests are missing. |
| Freelancer profiles and verification | PARTIAL | Verification requests and admin decisions exist. Candidate endpoints expose CVs regardless of declared private/application/verified-employer visibility. Profile lookups also mix MongoDB user IDs with Pi UIDs. |
| Fixed-price agreements | PARTIAL | An application can contain an offer with Pi amount, period, start date, terms, and acceptance. This is an offer record, not a full funded project contract with versioned terms and lifecycle. |
| Fixed-price project contracts | MISSING | No dedicated project contract model/collection/API, funding obligation, cancellation rules, or project completion state found. |
| Milestones | MISSING | No milestone definitions, allocations, funding, submission, approval, release, or milestone dispute records found. |
| Employer plan/posting Pi billing | PARTIAL | Intent/approve/complete handlers exist. Completion ignores returned payment details; no payer/amount/metadata verification, unique payment/transaction binding, robust replay response, or reconciliation worker. |
| Freelancer funding/payment | PARTIAL | Employers manually record amount and transaction text against accepted offers; candidates acknowledge or dispute. No authoritative transaction verification or platform-funded work flow. |
| Job delivery and approval | MISSING | No project deliverable upload/submission, revision request, approval, or acceptance evidence API found. Interview scheduling and hiring states do not provide these behaviors. |
| Job completion | MISSING | Recruitment reaches hired; salary records can become completed. No project completion state linking accepted work to verified compensation. |
| Disputes | PARTIAL | Salary-record disputes and admin decisions exist; `jobs.ts:1640,1707`. They do not provide project/milestone disputes or actual return transfers; state changes span separate writes. |
| Refunds | MISSING | No Jobs billing/project refund transfer and verification flow found. Voiding a salary record does not refund Pi. |
| Ratings | MISSING | No transaction-linked Jobs employer/freelancer ratings/reviews collection or endpoint found. |
| History and accountability | PARTIAL | `job_audit_log`, application history, billing list, salary records, and earnings summaries exist. They are mutable, separately written records; salary totals can reflect participant-confirmed text rather than verified transfers. |
| Input-cleaning helpers | WORKING, isolated | `jobsValidation.test.ts` passed normalization, pagination bounds, project classification, and duration checks. It does not cover authorization, billing, application lifecycle, or database consistency. |

## MongoDB architecture and access controls

### Collections and document structures

Collections are assigned in `backend/src/index.ts:372` onward. Documents are mostly built directly in handlers; many database references use `any`. TypeScript types do not impose MongoDB server validation.

| Domain | Existing collections | Structure gaps |
|---|---|---|
| Identity | `users`, `user_sessions`, `device_sessions`, `onboarding_applications` | Explicit bearer expiry/revocation and verified merchant settlement identity |
| Store | `products`, `orders`, `order_disputes`, `reviews`, `favorites`, `reports` | Variant/address/delivery snapshots, durable reservation recovery, payout and verified refund records, append-only financial events |
| Communication | `conversations`, `messages`, `notifications` | Reliable event delivery and evidence retention; GET conversation listing can merge and delete records |
| Payments | `pi_payments`, `pi_live_testnet_transactions`; payment fields embedded in orders | No Store/Jobs writes to a shared authoritative `pi_payments` ledger found in inspected payment workflows; Testnet public feed is not a settlement ledger |
| Jobs | `jobs`, `job_companies`, `job_saved`, `job_applications`, `job_profiles`, `job_audit_log`, `job_billing`, `job_payments`, `job_disputes` | Contracts, milestones, submissions, release/refund records, transaction-linked ratings |

### Indexes

Useful declared indexes include unique `users.uid`, product visibility/seller lookup indexes, buyer/seller order history, one active Store dispute per order, unique conversation pair keys, message ordering, session/device expiry TTLs, unique Jobs slugs, one application per candidate/job, one profile per user, unique billing record IDs, and unique Jobs salary transaction IDs. The Testnet feed has unique payment and transaction IDs.

Missing from relevant startup initialization:

- Unique Store order payment IDs and transaction hashes, with suitable partial filters for unpaid orders.
- Unique Jobs billing payment IDs and transaction hashes.
- A shared payment identity constraint preventing one transfer from being credited to multiple economic intents across services.
- Unique Store `reviews.orderId`.
- A uniqueness rule for an active Jobs dispute per salary payment.
- Reservation expiry/recovery indexes and a fully matching payment recovery scan index.

Indexes are created during backend startup. Existing duplicates could fail index creation and prevent startup. Installed production indexes and duplicate data were not inspected. Any approved index rollout needs a read-only duplicate assessment first, rather than automatic deletion or silent data repair.

### Validation and authorization

No MongoDB `$jsonSchema` validators, explicit validator installation, or database role provisioning were found in the inspected source. Field whitelists and input checks exist in individual handlers, but are uneven. MongoDB relationships are string references without enforced referential integrity. Store participants generally use Pi UID; Jobs generally uses MongoDB user ID; some candidate search joins query `users.uid` using Jobs profile IDs, which can cause missing identity/avatar data.

Root Docker Compose passes the same credentials used to create the MongoDB root user to the backend. The legacy connection uses `authSource=admin`, so this recipe gives the application broad administrative credentials. MongoDB is published on host port `27027`. Actual exposure depends on the host firewall and deployment. TLS and dedicated database roles are not enforced by the legacy URI builder. Atlas/URI configuration may provide stronger controls, but that is unverified.

**Required direction:** keep MongoDB, use a dedicated database-scoped application user, restrict network access, verify encrypted connections, document backup/restore permissions, and introduce compatible document validation after assessing existing records. No database change should be applied during this audit.

### Consistency and concurrency

No `MongoClient.startSession()`/`withTransaction()` implementation was found. Store uses useful conditional single-document writes, but reservation/order creation, inventory release, disputes, notification delivery, and Jobs billing/entitlements/audit updates span separate writes.

The Docker MongoDB recipe is a standalone instance with no replica-set configuration. If multi-document MongoDB transactions are chosen after approval, confirm production topology supports them. Otherwise use a durable, idempotent recovery protocol within MongoDB; this does not require a new external service.

## P0 findings — security, payments, transaction integrity

### P0-01: Jobs billing credits intents without verifying their Pi payment binding

Evidence: `backend/src/handlers/jobs.ts:808,827`.

Approval accepts a client payment ID without retrieving and binding its details. Completion calls Pi `/complete`, ignores the response, and marks the employer's intent paid. It does not verify payer UID, direction, intended amount, billing metadata, transaction identity, verification flags, or a stored binding. No unique billing payment/transaction indexes were found.

**Reproduced with an isolated mocked handler:** a returned payment for another payer and billing intent, with a different amount and no transaction verification flags, still caused the local intent to become paid. This proves the missing application checks; a live Pi underpayment/replay exploit was not attempted or claimed.

Implement first: server-derived amount, authoritative payment lookup before approval, immutable intent binding, verified completion before credit, unique binding across services, compare-and-set state changes, replay-safe responses, and durable recovery of payment/entitlement updates.

Acceptance: wrong payer, amount, metadata, direction, network, or transaction must never activate a plan; duplicate/concurrent callbacks and restarts must activate it at most once.

### P0-02: Store callbacks overwrite paid payment records

Evidence: `backend/src/handlers/payments.ts:163` onward.

Cancellation and failure find the buyer's order, then update by `_id` without restricting current state or verifying the supplied payment ID. They can overwrite a paid order's payment ID and set payment status failed/cancelled. Store approval also overwrites the pending order's payment binding before validating the authoritative payment details.

**Reproduced with isolated handlers:** both callback routes accepted an invented payment ID and changed a paid order's payment status while preserving its verified transaction hash and paid order status.

Implement first: validated identifier types, authoritative payment binding before approval, one active attempt per intent, conditional state transitions, immutable verified payment identity, and separate attempt history. Client callbacks cannot be the authority for financial finality.

Acceptance: cancellation/failure/re-approval retries cannot downgrade or replace a verified transfer; cross-order/payment IDs must be rejected.

### P0-03: Candidate CV visibility is bypassed

Evidence: `backend/src/handlers/jobs.ts:1401,1472`; visibility set at `jobs.ts:700`; self-enrollment at `jobs.ts:485`.

Employer candidate search/detail return `profile.cv` without enforcing private, applications-only, or verified-employers visibility. Employer enrollment requires no verified company. The detail handler also works when the employer has no company.

**Reproduced with an isolated handler:** a self-enrolled employer with no company received a candidate CV marked private.

Implement first: centralized profile/CV authorization, safe response projection, applicable relationship/verified-company checks, and blocked-employer enforcement across every access path. Check existing Cloudinary document access controls: upload code returns a raw asset URL and does not explicitly request private/authenticated delivery. Actual preset settings were not inspected.

Acceptance: private CV never reaches another user; application-only and verified-employer rules hold for list, detail, dashboard, download, and cached responses. Deleting a database CV reference alone must not be treated as deleting the uploaded asset.

### P0-04: Bearer authentication bypasses device revocation and has no local expiry check

Evidence: `backend/src/services/auth.ts:13`; `backend/src/index.ts:199`; signout/revocation in `backend/src/handlers/users.ts:114,507`.

The bearer fallback accepts a token by looking it up in `users.accessToken`. It checks blocked status but not expiry, Pi validity, or device revocation. Device middleware only runs for an authenticated cookie session with a device session ID, and catches validation errors by continuing. Signout revokes the cookie device session but does not clear the stored bearer credential. Browser Axios loads that credential from local storage.

Implement first: explicit application credential lifetime and revocation on every authentication path, consistent device binding, and fail-closed handling for sensitive actions. Minimize retained Pi credentials and audit token access without logging secrets.

Acceptance: a signed-out/revoked credential cannot authorize Store/Jobs mutations through either cookie or bearer authentication; expired and blocked credentials are rejected.

### P0-05: Inventory and payment cancellation can diverge

Evidence: `backend/src/handlers/marketplace.ts:340,441`; `backend/src/services/orderLifecycle.ts:21`; `backend/src/services/storePayments.ts:57`.

Stock is decremented before order insertion. Compensation handles a caught insert error but cannot cover a process crash between writes. Release marks the order released before incrementing product stock; a crash/failure then leaves release marked complete with stock unrestored. Unpaid orders have no automatic reservation expiry, so authenticated users can lock stock indefinitely.

An order remains pending during payment processing and can be cancelled, releasing stock. Payment recovery deliberately preserves cancellation while acknowledging a later verified transfer. That creates a paid, cancelled order with released inventory unless a reconciliation workflow takes responsibility for it.

Implement first: crash-safe reservation/release protocol, server idempotency keys, reservation expiry, coordinated cancellation with payment state, and a recoverable exception state for funds received after stock release.

Acceptance: injected failures between each write cannot lose/duplicate stock or create paid orders without a recoverable fulfillment/refund decision; repeated order requests create one intended reservation.

### P0-06: Store money reaches the app without verified seller settlement; refunds lack proof

Evidence: `backend/src/services/storePayments.ts:31,106`; `backend/src/handlers/admin.ts:628`.

Store completion requires `user_to_app`. Seller notification is sent after app receipt, but no transfer-to-seller implementation was found. Refund completion checks only a manual reference's length, without return amount, recipient, network, transaction verification, or duplicate transfer prevention.

Implement first: CEO-approved settlement responsibilities using existing Pi/MongoDB infrastructure, verified recipient binding, merchant payable records, payout status/reconciliation, and verified refund records. Do not represent a reference, notification, or administrative decision as proof funds moved.

Acceptance: each paid order can be traced from app receipt to merchant settlement or verified buyer refund, including exceptions, without changing existing valuation policy.

### P0-07: Public Jobs reads write and normalize database data

Evidence: `backend/src/handlers/jobs.ts:345,420,443`.

`ensureSeedData()` runs from public GET endpoints. It can insert demonstration opportunities/company records, overwrite compensation on matching seed slugs, and assign approved moderation/expiry to records lacking those fields. There is no production-only guard around this routine. Seeded jobs can lack a real employer owner.

Implement first: remove write/seed/backfill behavior from production reads; keep demo content explicitly isolated; require controlled review of any normalization operation. No production GET was called during this audit.

Acceptance: anonymous catalog reads cause no database writes and display only real, accountable approved opportunities in production.

### P0-08: API/deployment controls need tightening

Evidence: `backend/src/index.ts:74,123,161,199`; `docker-compose.yml`; async Jobs and marketplace routes.

- Credentialed CORS permits arbitrary `.app.github.dev` origins even in production; localhost and sandbox origins are included in the non-SoloHost allowlist.
- Cross-site production cookies use SameSite None. No explicit CSRF control was found. CORS alone is insufficient evidence of mutation protection; actual exposure requires browser/deployment testing.
- SoloHost production cookies have `secure: false` because Secure is tied to cross-site mode rather than HTTPS production.
- No central rate limiter or uniform async rejection wrapper was found. Payments have a wrapper, but many Express 4 Jobs/marketplace async handlers do not. Database/upstream rejection can leave inconsistent responses or unhandled errors depending on runtime handling.
- The supplied MongoDB Docker recipe uses root application credentials and publishes its port.

Implement first: explicit deployment-origin allowlists, appropriate mutation/CSRF protection, secure production cookies, per-route abuse limits, consistent error boundaries, database-scoped credentials, and network restrictions. Validate actual deployment state before asserting the live system is exposed.

## P1 recommendations — core Store and Jobs

1. Complete Store settlement and refund lifecycle after the P0 financial model is approved. Persist immutable verified payment facts and separate them from fulfillment/refund states.
2. Extend order snapshots with selected variant, its server price/stock, buyer delivery details, delivery method, and agreed fulfillment terms. Preserve the existing pricing policy.
3. Resolve cart behavior: `CommerceFlowPage.tsx:57,83,229` processes the first item despite a multi-item cart total. Clearly support per-item checkout or implement an explicit multi-item order workflow.
4. Add durable reservation expiry and reconciliation, including payment-in-progress exceptions. Do not release stock blindly while funds may be in flight.
5. Add explicit Jobs contract records and versioned accepted terms linked to application, participants, and compensation. Add milestones with amounts and states, submissions/revisions, approval, completion, and payment/release evidence.
6. Add employer job edit/close/archive workflows with moderation rules and ownership checks. Fix expiry filtering: the module-level `ACTIVE` object captures time once, so expired jobs can remain eligible after server uptime advances.
7. Separate user-confirmed salary records from verified transactions; verify sender, recipient, amount, network, and transaction before calling a record financially verified. Keep manual attestations visible as such.
8. Add Jobs refund handling tied to verified return transfers, and project/milestone disputes tied to work and funding evidence.
9. Normalize user identifier conventions across services, profile joins, notifications, and audit actors.
10. Add meaningful integration tests against an isolated MongoDB database for authorization, actual unique indexes, concurrent updates, and crash/retry recovery. Never use production records as test fixtures.

Suggested MongoDB structures, subject to approval: a shared verified payment/attempt/event ledger, merchant settlements, refund records, Jobs contracts, milestones, submissions, and Jobs reviews. These extend the existing database; they introduce no external service or migration.

## P2 recommendations — trust, merchant operations, experience

- Add one transaction-linked review per eligible Store order and Jobs contract, with unique constraints, moderation, and fraud review.
- Preserve dispute evidence and decision history; messaging currently supports content deletion and conversation merging/deletion. Define retention and access before treating messages as authoritative dispute evidence.
- Use pending ownership claims reviewed by administrators instead of immediately assigning company ownership from a website and free-text evidence. Current claim update lacks an owner-state compare-and-set guard and can race.
- Provide merchant payable/payout/reconciliation views and clear distinctions between app receipt, seller settlement, buyer refund, and unresolved transfers.
- Extend fraud controls for repetitive reservations, messaging, reports, onboarding submissions, and uploads; existing field checks alone do not prevent abuse.
- Reconcile frontend sponsorship descriptions with backend plan entitlements. UI contains sponsor plans/promised matching features different from backend standard/featured/monthly billing; confirm what buyers actually purchase without changing policy during the audit.
- Improve payment recovery notices and support ownership for extra transfers, amount mismatches, cancelled-but-paid orders, and unknown transaction outcomes.
- Review caching of sensitive Jobs/profile/employer data. IndexedDB caching is user-namespaced, but many private Jobs reads are eligible and may persist for 24 hours. Verify logout cleanup, consent changes, and revocation behavior.
- Repair the two failing tests after determining intended behavior; avoid changing production behavior merely to satisfy stale text/snapshot assertions.
- Verify native Store/Jobs paths separately before claiming parity with web functionality.

## P3 recommendations — scalability and expansion

- Add pagination to unbounded seller/order/review/message/admin lists; inspect query plans on realistic isolated datasets.
- Use indexes matching production filters, sort order, recovery scheduling, contract participants, and milestone/payment lookup.
- Make recovery safe across multiple backend processes. The current WeakSet scan guard is process-local; add durable leases or equivalent idempotent coordination in MongoDB.
- Add bounded retry/backoff, durable notification/event delivery, and monitoring of reconciliation queues. These can use existing infrastructure.
- Establish backup restoration exercises, retention rules, reconciliation reports, and documented operator procedures.
- Verify lockfile consistency and deployed dependency versions. No network dependency vulnerability scan or container build was run, so dependency security and deployment reproducibility remain unverified.
- Establish operational measures: verified payment-to-order completion rate, duplicate credit attempts, stranded reservations, unresolved transfers, payout/refund age, dispute turnaround, and successful paid work completion.

## Executed verification

| Check | Result | What it establishes |
|---|---|---|
| Backend `node --test tests/storePaymentRecovery.test.cjs tests/checkoutReservation.test.cjs tests/liveTransactions.test.cjs` | 20 passed, 0 failed | Mock/in-memory Store recovery, reserved-order resume, and strict Testnet feed validation |
| Backend `src/tests/orderLifecycle.test.ts` | Passed | Order transition helper and one-time inventory release in memory |
| Backend `src/tests/jobsValidation.test.ts` | Passed | Input cleaning, pagination, duration, serialization helpers |
| Backend `src/tests/storageValidation.test.ts` | Failed at line 47 | Session shape assertion: actual includes `uid: "undefined"` for fixture lacking UID; expected omits UID. Later assertions were not reached. |
| Frontend `node --test tests/piPayment.test.mjs tests/orderPaymentResume.test.cjs tests/jobsUi.test.mjs` | 33 passed, 1 failed | Passing SDK/recovery/Store completion checks; Jobs source assertion failed on expected text `Search companies or industries` |
| Backend TypeScript `--noEmit -p tsconfig.json` | Passed | Compile-time consistency, not economic workflow correctness |
| Frontend TypeScript `--noEmit -p tsconfig.app.json` | Passed | Compile-time consistency, not browser or payment runtime behavior |
| Temporary isolated audit reproductions | 4 reproduced cases | Jobs unbound completion, private CV disclosure, Store paid-to-cancelled overwrite, Store paid-to-failed overwrite |

Some tests are static source assertions or mocked execution. Passing tests do not prove actual Pi API behavior, deployed authentication controls, MongoDB transactions/indexes, real deliveries, payouts, or refunds. No new tests were committed and no dependency installation was performed.

## Runtime evidence still required before readiness approval

1. Read-only production configuration review: Pi app/key/network alignment, payment-enabled flags, SDK sandbox setting, origins, session cookie behavior, MongoDB topology/roles/TLS/network restrictions, installed indexes, and backup status. Never disclose secret values in reports.
2. Approved sandbox end-to-end Store journey: verified seller onboarding, moderated listing, reservation, payment, browser interruption/restart, fulfillment, review, dispute, and verified refund/settlement. Existing missing capabilities must be implemented first.
3. Approved sandbox Jobs journey: company approval, posting, application, accepted contract, funded milestone, work submission/revision, approval, verified compensation, dispute, refund, and rating. Employer plan billing alone cannot establish funded work readiness.
4. Real MongoDB concurrency and failure-injection tests: duplicate callbacks, duplicate requests, process death between writes, upstream timeouts, delayed completion after cancellation, repeated dispute decisions, and multiple recovery workers.
5. Authorization matrix across anonymous users, buyer/seller, unrelated employer/candidate, verified/unverified companies, administrator, blocked account, revoked device, and expired bearer credentials.

These runtime checks are outstanding evidence requirements, not permission to modify production data or execute transfers.

## Exact implementation order for CEO review

| Order | Proposed approval package | Exit criterion |
|---|---|---|
| 1 | P0 payment binding/state guards and CV access controls | Audit reproductions become rejected requests; verified paid records remain immutable; private CVs remain inaccessible |
| 2 | Authentication revocation, production API/database controls, removal of GET seeding | Revoked/expired credentials fail on all paths; production reads do not write; deployment controls verified |
| 3 | Shared payment uniqueness/recovery and crash-safe inventory | One transfer credits one economic intent; retries/crashes preserve funds and stock accountability |
| 4 | Store merchant settlement and verified refunds | Every verified app receipt has a traceable merchant payable/settlement or buyer refund outcome |
| 5 | Store delivery/variant/cart completion | Correct product choice, price snapshot, delivery terms, and fulfillment evidence survive payment and retries |
| 6 | Jobs contracts, milestones, submissions, approval, verified compensation/refunds | A complete paid-work journey is demonstrable, with participant authorization and durable records |
| 7 | Trust operations, ratings, dispute evidence, scalability checks | Accountable merchant/freelancer operations and measured repeatability under realistic load |

**Implementation remains pending CEO approval.** Only this audit document was added. Application code, homepage, White Paper, existing valuation/pricing policies, production data, and deployments were not changed.
