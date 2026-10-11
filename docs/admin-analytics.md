# Admin analytics

The existing /admin route uses the enterprise analytics overview. /admin/analytics is the shared reports view; /admin/reports retains report and support moderation. All fifteen platforms have /admin/services/:service analytics and management workspaces linked from expandable navigation. Working Store, Stream, Jobs and Education management actions remain on their existing routes. Other modules explicitly identify missing management APIs rather than showing unrelated global records.

## Sources and definitions

- Accounts: userCollection. Active accounts are not blocked and have lastSeenAt within 15 minutes. This is currently login/profile activity, not continuous browsing. Live chart points are genuine backend snapshots observed while the page is open; historical daily active users and historical comparison require durable activity events and unique-user rollups.
- Money: liveTransactionCollection, populated by the existing independent Pi Platform verification feed. Only verified, positive, valid-hash Pi Testnet records are counted, deduplicated by transaction hash. Amounts are summed at seven-decimal Pi precision. Order prices or a local paid status alone never prove a successful payment. These totals are a verified subset, not platform-wide Mainnet revenue. The verification feed refreshes when the existing /transactions/live endpoint is read; analytics does not approve or complete payments or independently amplify Platform API calls.
- Time: the verification feed uses known completion time, otherwise verified payment creation time. Intervals are inclusive at the start and exclusive at the end. Previous periods have identical elapsed duration. ISO timestamps require explicit offsets. All labels use the selected IANA timezone; Today uses that timezone. Custom datetime inputs are interpreted in the device timezone and explicitly labelled as such, including DST offsets.
- Status: successful is verified ledger evidence. Pending, failed and unverified are current recorded statuses of identified payment attempts from Store, Jobs, Transport, Education and Stream. Status transitions are not stored; this is not a historical state-transition chart. Cancelled attempts belong to failed; unverified completions are separate.
- Service usage: Store orders; Stream playback sessions; Jobs applications; Education enrollments; Transport bookings. Units differ and are stated. Sports, Food, Health, Agro, Energy, Charity, Housing, Events, Swap and Token require service event collections and admin management adapters.
- Financial service attribution joins verified payment IDs to their operational records. Unknown attribution is visible as Unattributed. Service money totals are withheld if an attribution source is unavailable.
- Fraud alerts are unavailable until there is a dedicated persisted fraud-event API. Reports are not counted as fraud evidence. Open disputes include Store and Jobs only. Active Services counts supported services with recorded actions during the selected interval, not deployment or uptime.

## API and performance

GET /admin/analytics accepts from, to, timezone, live and optional service. GET /admin/analytics/records accepts these plus metric, status and page; results contain only an explicit safe record summary, 50 per page. Both are behind the existing server-side requireAdmin middleware. No public feed exposes admin account data. Polling is every 15 seconds, pauses in background tabs, and avoids overlapping requests. Last successful timestamps remain visible on refresh errors. Chart code is loaded lazily and animations are disabled.

Custom ranges are limited to 180 days; each source is projected and bounded at 50,000 rows. Beyond that size, metrics are explicitly withheld rather than silently truncating. Production growth beyond this bound needs database aggregation/rollups, service event schemas, historical activity snapshots, and a complete verified Mainnet ledger adapter. Missing collections and failures are exposed as unavailable, not zero. The shared API caches identical snapshots for ten seconds with a bounded cache.

The official shadcn/ui chart component is adapted under its MIT license. Tailwind utilities use the ad prefix without preflight; the existing app styles, Pi Browser authentication/payment flows and admin layout remain in place. Charts use Recharts with keyboard accessibility, exact tooltips and point-to-record inspection; Lucide icons are used in the overview.

## Validation

Backend: node -r ts-node/register src/tests/adminAnalytics.test.ts (in backend).
Frontend: node node_modules/typescript/bin/tsc -b and a Vite production build (in frontend).
The backend checks verified financial evidence, duplicate hashes, service isolation, unavailable data, Dubai midnight, DST offsets, ranges, and HTTP 401/403 admin authorization. An isolated browser preview passed at 320, 375, 768, 1024, 1366 and 1920 pixels, including the open menu. Live/Custom filters, records, service navigation, exact dated tooltips and chart-point drill-downs passed with local fixtures; production users and payments were not touched.
