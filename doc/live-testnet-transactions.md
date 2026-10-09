# Homepage Testnet transaction feed

The existing public homepage now contains SMAJ PI HUB Live Transactions. It polls every 10 seconds, shows at most 10 verified Test-Pi app payments, and uses the existing homepage styling. On narrow screens, each transaction becomes a compact labeled row/card.

## Data and verification

The feed reads existing completed app-payment records from orders, job_billing, transport_bookings, course_payments, university_payments, and users.streamSubscription through the existing Express app.locals collections. Marketplace records already write paymentId, paymentTxid, pricePi, and paidAt. Education payments use pi_payment_identifier, transaction_identifier, amount_pi, and completed_at. Jobs and Stream store analogous payment references. pi_payments is declared in the server but has no active writer in the inspected code.

The worker uses the existing app-authenticated platformAPIKeyClient to make GET requests to https://api.minepi.com/v2/payments/{payment_id}. It does not approve, complete, cancel, create payments, or alter the app wallet. It only accepts user_to_app payments with network exactly Pi Testnet, all approval/completion/verification flags true, cancellation flags false, a matching valid transaction hash, a positive finite amount, and matching local amount when present. Official API responses supply the displayed amount. No Mainnet record is published.

Verified snapshots are persisted in MongoDB collection pi_live_testnet_transactions with unique transactionId and paymentId indexes and a newest-time index. Only verified transaction hash, amount, recorded time, verification status, network, and validated explorer URL are public. User information, addresses, metadata, and credentials are excluded. No sample records are seeded.

Time means locally recorded payment completion time. If no reliable completion timestamp is stored, the Pi API's payment creation timestamp is used and identified in the UI. It is not represented as an independently queried blockchain block timestamp.

Known completed payments are checked in bounded, single-flight batches, at most once every 10 seconds per server process and three API calls concurrently. Recent completions are prioritized while older records are backfilled. The endpoint returns the persisted verified snapshot immediately; the first request after startup can be empty while verification runs. With large backlogs, older records appear over subsequent refresh cycles. This is a feed of SDK/app-processed payments, not all direct wallet transfers.

Explorer links use the official HTTPS blockexplorer.minepi.com/testnet/transactions/{hash} route, confirmed against the official explorer frontend, with a verified 64-character transaction hash. Remote links with other hosts, Mainnet paths, credentials, queries, or scripts are rejected. The frontend independently checks link safety.

## Endpoint and configuration

GET /api/transactions/live is public and read-only. /transactions/live is an alias for existing deployments that strip the /api proxy prefix. The frontend uses its existing configured backend URL and the latter path. Responses are marked Cache-Control: no-store. The response includes network, transactions, availability, and refreshIntervalSeconds. Database errors return a generic 503 without internal details.

Reuse the deployment's existing MongoDB settings, PI_API_KEY, PI_PAYMENTS_ENABLED=true, and PLATFORM_API_URL=https://api.minepi.com (the default). No new wallet or key is required. The app/payment must be configured for Testnet in the Pi developer portal. Do not change it to Mainnet to test this feature. In-memory development data is deliberately excluded from the public feed. With no API credentials or payments disabled, already verified stored snapshots can still be read, but live verification is reported unavailable.

No local backend .env, MongoDB connection, or app API key was configured during implementation. Stored-field implementations were confirmed in source, but deployed database counts and actual live Pi verification could not be inspected from this workspace.

## Testing

- Backend: cd backend, then npm run test:transactions.
- Frontend: cd frontend, then node --test tests/liveTransactions.test.cjs.
- Types: backend npm run lint; frontend node node_modules/typescript/bin/tsc -b.
- Real integration: start the configured MongoDB-backed server, request /api/transactions/live, complete a normal existing Testnet app payment in Pi Browser, then refresh the homepage. Never insert test records into the production feed. Wait for a bounded verification cycle; confirm the hash and API-verified amount, MongoDB snapshot, and Testnet explorer link. Reloading must not create duplicate snapshots.
- Test the existing homepage at desktop width and 375px/320px mobile widths. Confirm the hash wraps, all five fields remain readable, links open the Testnet explorer, and polling continues every 10 seconds. Navigate away to confirm polling stops.
- With no verified payments, confirm the exact empty state: No verified Testnet transactions yet. With API or database unavailable, confirm the separate unavailable notice; no fabricated rows should appear.

Automated tests use isolated fixtures and mocked Pi responses only; they are never added to deployed data. They cover Mainnet and incomplete/cancelled rejection, hash/amount binding, privacy, deduplication, backfill, API error states, public endpoint behavior, ten-second polling, cleanup, rendering, and responsive row styles. Live credentials and a real completed Testnet app payment are required for end-to-end verification.
Recovery: discovery now checks records with a stored Pi payment ID even when the local paid status or transaction hash is missing. The Platform API must still report full completion, verified transaction, and Pi Testnet. A present local hash must match. The shared pi_payments collection is also scanned for paymentId or Platform identifier records. No records are invented to reach ten. Stream subscriptions overwrite their previous payment details, so older Stream payments absent from MongoDB cannot be reconstructed by this feed.

Checkout: when stock reservation fails, an existing unpaid reserved order for the same buyer, product, and quantity can be resumed. Other buyers and paid/released orders never bypass inventory checks.
