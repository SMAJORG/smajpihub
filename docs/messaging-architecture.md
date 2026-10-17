# Messaging navigation and synchronization

Profile and product buttons navigate directly to a recipient URL. The recipient name/avatar seed the first render; GET /messages/direct/:recipientId resolves authoritative profile data and any existing direct conversation without inserting a record. A valid first send to POST /messages/direct/:recipientId performs the upsert. Existing /messages/start callers remain supported. Jobs conversations retain their separate pair keys and employer-first restrictions.

Direct conversations reuse the existing unique pairKey index. New sends carry clientMessageId, with a unique partial compound index on conversationId, senderId, clientMessageId. Concurrent creation and acknowledgement retries recover the existing records. Index creation is part of backend startup; a failed index build prevents startup. Legacy conversations are still canonicalized when discovered, preserving explicit message-level product context.

The screen reads account-scoped local history and recipient snapshots synchronously. It keeps up to 100 messages per saved thread. Outgoing text, voice, images and documents enter a persisted optimistic outbox and use the same identifier for retries. Reconnect retries the queue; session/rate-limit failures retain it. Non-retryable validation/permission failures remain visibly failed. If storage is full, unsent messages take priority over replaceable cached history. If storage is disabled, the UI warns that the screen must remain open. Private messaging responses are not added to the general offline response cache.

GET /messages/:id returns the newest 50 messages and an ObjectId cursor; before loads earlier pages. Hidden messages are filtered before the limit. Reconnect fills the gap back to the newest confirmed cached message. Request generations discard obsolete history responses. Account changes remount the messaging screen, isolate the cache/outbox, stop synchronization, and prevent old asynchronous work from updating the new account. Outgoing requests include an expected account header, checked against the existing authentication resolver.

GET /messages/sync uses authenticated long polling with existing Axios cookie/bearer authentication. It observes participant conversation records, read state, typing and expiring presence through a database signature, checking once per second and returning after a change or 24 seconds. This supports multiple server instances without a process-local event bus, WebSocket infrastructure, or credentials in URLs. Clients suspend polling when hidden/offline and reconcile after reconnect. This is approximately one-second update latency, not a WebSocket transport. The database polling cost grows with active clients; large deployments should replace the transport with shared pub/sub or change streams while retaining these account and cursor boundaries.

Only message history shows the doodle wallpaper. The full header, composer and recording controls use solid theme surfaces.

## Validation

Run from the repository root:

    node --test backend/tests/messaging.test.cjs frontend/tests/chatNavigation.test.cjs frontend/tests/messageProductContext.test.cjs frontend/tests/userPresence.test.cjs

The backend route harness simulates Mongo query/update behavior and unique-key conflicts. It covers concurrent first sends, retry deduplication, participant access, account mismatch, pagination, reconnect signatures, read receipts, deleted inbox restoration, and Jobs restrictions. Frontend tests render the actual chat page before effects/network work, check cached/new chat rendering and refresh/account isolation, and exercise reconnect pagination and delayed-response cancellation.

These tests do not run against a deployed MongoDB cluster or physical devices. Verify production index creation on deployment and smoke-test web, Pi Browser and the rebuilt Capacitor application, including native background/resume and airplane-mode send/reconnect. No Android native code or authentication implementation changes are required by this change.


## Lightweight previews and voice players

The updated client opts into GET /messages?includePreviews=1 for the initial inbox. The response includes a previews map containing the latest 12 messages for up to 20 conversations. It hydrates account-scoped metadata caches before publishing inbox rows. Additional visible/nearby rows use a two-request priority queue; focus or pointer interaction promotes the chosen row. Preview reads never mark messages read. Active GET /messages/:id requests use light=1, have a ten-second timeout, share in-flight work, and cancel on chat/account changes. Older clients retain the full response by default.

Lightweight responses omit audioDataUrl and attachmentDataUrl and expose mediaAvailable. Message IDs, stored duration, attachment metadata, and pagination remain available immediately. Confirmed local history also excludes base64 payloads; unsent outbox payloads remain intact. First-ever uncached history still requires network access and shows compact loading or a retry card. Background failures retain history and indicate reconnecting in the participant header instead of a recording-error footer. Axios cancellation bypasses retries and global feedback.

GET /messages/:id/messages/:messageId/media returns binary inline media using the existing session/bearer authentication. It checks conversation membership, deleted inbox state, hidden/deleted messages, and Jobs visibility. It uses no-store and nosniff headers and forces non-media documents to download. Remote attachment URLs and legacy inline client responses remain supported.

VoiceMessagePlayer is shared by both chat layouts. It shows a stored total duration before downloading, elapsed time during playback/pause, total duration at completion, a seek slider, sender avatar, and real decoded waveform samples where the codec is supported. Neutral bars are used until decoding succeeds. Playback is exclusive across players. Downloads use Axios blob responses with an expected account header, never credentials in URLs. IndexedDB stores downloaded media under owner/conversation/message keys, with least-recently-used eviction at 25 MB per account. Offline uncached files show an explicit download message; object URLs and pending requests are cleaned up on unmount.

Additional unit checks:

    node --test frontend/tests/chatMedia.test.cjs frontend/tests/chatNavigation.test.cjs backend/tests/messaging.test.cjs

The browser interaction test bundles the actual chat page/player, substituting only test authentication and decorative icon assets. It uses a local HTTP API fixture and never contacts production. Install playwright-core in a development environment or set PLAYWRIGHT_CORE_PATH to an available package; set CHAT_TEST_BROWSER to an existing Chromium/Edge executable when needed, then run:

    node --test frontend/tests/chatInteraction.test.cjs

It covers cached rows beyond the old preload limit, delayed-response cancellation, row-25 warming, duration/elapsed time, seeking, exclusive playback, keyboard-sized viewports, cached refresh failures, uncached retry, offline downloaded playback, and account isolation. Without Playwright the browser test reports a skip; the unit tests do not require it. Physical Pi Browser/Android playback and native keyboard behavior still require device smoke testing.


### Conversation viewport restoration
Chat fullscreen state now follows the selected route directly; opening and closing from the inbox commit navigation synchronously. The mobile inbox does not render the alternate inline conversation panel.

The viewport stores an account-scoped message anchor and offset (or a follow-latest flag). Layout effects restore it before paint on opening and history updates. Resize observation retains the anchor as media, the composer, and the keyboard change size. Closing persists the last captured position rather than measuring detached elements. Photos reserve an aspect-ratio frame while downloading; recently viewed object URLs and measured ratios survive navigation in a bounded 25 MB memory cache. Active URLs are leased until their views release them; inactive entries are revoked on eviction. Persistent binary storage remains account-scoped IndexedDB.

The local browser fixture verifies delayed history refresh, reopen-at-anchor behavior, cached photo URL reuse, mobile layout consistency, playback, offline access, and account switching. Native Pi Browser and physical Android behavior still require device verification.
