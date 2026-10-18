# Seller workspace

The /seller page uses GET /marketplace/seller/dashboard. The endpoint authenticates with the existing requireUser flow and derives every ownership filter from that authenticated UID. Query parameters cannot select another seller. Existing seller product, order, edit, notification and verification routes are unchanged.

## Financial definitions

- Recorded sales are gross verified Store receipts, using paidAt (or ledger verification / settlement creation time), never fulfillment updatedAt or the current product price. Canonical ledger aliases and settlement receipt copies are deduplicated by order and network/transaction ID. A fulfillment label alone is insufficient proof of payment.
- Seller earnings are settled merchant payouts with a transaction ID and verification timestamp. Held settlement records are pending funds, not spendable wallet balance. Completed payments counts verified seller payouts, not buyer orders.
- Recorded full refunds remain a separately identified subset of historical gross receipts; refunded orders are excluded from held funds. This page does not calculate an unrecorded fee or claim a wallet balance.
- Pi Testnet, Pi Mainnet and missing-network historical records (Unknown) have separate summaries and series. There is no combined currency total. Product prices and all-network order counts are explicitly separate from these financial totals.
- Calendar periods use UTC. This week begins Monday; charts show calendar days or today's UTC hours. Older orders without linked receipt evidence are reported as unverified and excluded from financial totals.

## Performance and access

Only valid 1-5 review ratings enter the rating average. Response rate is the fraction of buyer-initiated conversations in the last 90 days with a subsequent seller reply; response time is the mean time from first inbound message to first seller reply in each such conversation. No eligible conversations or no replies displays Unavailable. Conversation reads are participant-scoped, metadata-only and bounded at 500 conversations / 10,000 messages; larger samples display unavailable rather than a truncated statistic. Optional data-source failures are surfaced and do not become fabricated earnings.

Seller activation and identity verification are separate. Activation follows the backend's sellerActive / seller-role rule. An inactive account with a stored seller-level badge is shown at Pi verification level, consistently with marketplace normalization, and activation is offered inside the collapsed verification details. No verification level is granted by this dashboard.

## Refresh and layout

One deduplicated snapshot request refreshes all cards every 20 seconds while visible and online, and on focus, visibility restoration and reconnect. Requests have a 15-second timeout and are cancelled on unmount or account change. Latest successful snapshots are kept in bounded account-scoped memory; no financial snapshot is written to persistent browser storage. Product mutations force a fresh read after any already-running request. Loading, offline, retry and partial-data states retain the last valid snapshot and its server timestamp.

Mobile uses two statistics columns; desktop uses four. The SVG analytics chart supports filters, pointer exploration and a labelled keyboard-operable date slider. Product rows expand progressively, use real image thumbnails, and require confirmation for deletion and availability changes. Changes are scoped to /seller and the new API; other pages retain their existing interfaces.

## Validation

Run from repository root:

- node --test backend/tests/sellerDashboard.test.cjs
- Set PLAYWRIGHT_CORE_PATH to playwright-core and CHAT_TEST_BROWSER to a Chromium/Edge binary, then node --test frontend/tests/sellerDashboardInteraction.test.cjs.
- Run frontend production build and backend TypeScript checks.

The browser fixture bundles the real SellerPage, styles, dialogs and API client against the real summary builder with isolated records. It checks mobile/desktop columns, horizontal overflow, chart filters and keyboard selection, financial network separation, confirmed product actions, live receipt/order updates, offline/error recovery, dark mode and account switching. Production records are not mutated by tests. Physical Android and Pi Browser remain device checks.
