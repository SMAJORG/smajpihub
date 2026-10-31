# SMAJ AI public catalog access

SMAJ AI uses public, read-only catalog GETs at `/jobs/jobs?catalog_read=true`, `/marketplace/products` and `/stream/creator-content`. It sends no Pi bearer token, session cookie or client secret. AI enforces its own authenticated session, connector consent and explicit task approval before discovery and sharing projected listing metadata with Meta.

`catalog_read=true` skips Jobs development seed/refresh writes. It retains active, approved, unexpired filtering and pagination. It does not certify existing database records as authentic employer submissions.

Stream discovery exposes only existing public, approved, playback-allowed creator metadata. Missing Stream storage returns 503 rather than a misleading empty success. Metadata discovery does not authorize playback, downloads or subscriptions. No new streaming provider credential is required by the AI metadata adapter.

The embedded `/ai` page uses the existing Hub Pi session through a server-to-server signed identity bridge. See [embedded AI deployment and device checks](embedded-ai.md). The standalone AI redirect client still expects `/sso/authorize` and `/sso/token`, which remain unavailable; the embedded flow does not use them. HUB session/Pi authentication continues to protect private APIs.

Verification: backend TypeScript build; `NODE_ENV=test npx ts-node src/tests/catalogRead.test.ts`; `NODE_ENV=test npx ts-node src/tests/streamCreatorContent.test.ts`. AI separately tests each adapter, consent/approval, task ownership, outbound restrictions, payload validation and retained receipts on Meta failure. Live public endpoints returned HTTP 200 during integration; production credentials and deployment configuration remain operator-owned.
