# Embedded SMAJ AI

The dashboard button opens `/ai` within the protected Hub layout. The Hub API at `/ai/*` verifies the existing Pi session and sends a server-signed, 60-second identity assertion to the existing AI API. Pi access tokens, Hub cookies and signing secrets are never forwarded to the AI service or exposed to the client. AI history and approvals remain scoped to the Hub database user ID. Existing standalone AI authentication and APIs continue to work.

## Deployment

Deploy both repository changes. Configure `SMAJ_AI_BACKEND_URL=https://ai.smajpihub.com` and `SMAJ_AI_CLIENT_ID=smaj-ai` on the Hub backend. Configure the same independently generated `SMAJ_AI_SSO_SECRET` (at least 32 characters) on both backends. If the AI uses a custom client ID, match it on both servers. Keep secrets out of frontend variables. Set `SMAJ_AI_PUBLIC_URL` to the actual AI origin, as required by the existing API origin checks. Existing Meta, database and Jobs catalog settings remain required and unchanged. No `/sso/authorize` or `/sso/token` endpoint is required for the embedded flow.

Without this server configuration the page shows an actionable service-unavailable message. Committing the code does not configure or deploy hosted services.

## Pi Browser acceptance checks

On a real device, sign into Hub once, tap SMAJ AI, verify the address remains on Hub and no login prompt appears. Send a Jobs request, explicitly approve read-only discovery and metadata sharing, inspect real listings and follow Browse SMAJ Jobs. Check back navigation, refresh at `/ai`, narrow screens, keyboard interaction, slow service/retry, expired sessions, separate users and logout. A desktop browser with a Pi user-agent is not a substitute for this device test.
