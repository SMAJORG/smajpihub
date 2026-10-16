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
