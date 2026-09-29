# SMAJ PI HUB SoloHost (Phase 1)

This directory is independent of the existing Render, GitHub Pages, Pi Browser, Capacitor, and Expo deployments.

## Architecture

Pi Desktop opens `http://127.0.0.1:18443` on the `web` service. nginx serves the SoloHost Vite build and proxies same-origin `/api/*` requests to the internal `backend` service. The backend uses only the internal `mongo` service. MongoDB data and backend access logs use Docker named volumes.

Only `web` publishes a host port. The backend and database are not reachable directly from the host or LAN.

## Authentication and payments

SoloHost mode uses Pi OAuth in a popup and validates OAuth state before accepting the access token. The frontend and backend both verify the resulting token with Pi, and the backend stores the user under the existing stable Pi UID model. Configure this exact redirect URI in the applicable Pi OAuth client:

`http://127.0.0.1:18443/signin/callback`

Pi Browser continues using the existing Pi SDK flow. SoloHost Pi payments are explicitly disabled in Phase 1. Frontend payment entry points report that payments are unavailable, and the backend rejects app-key Pi Platform requests when `PI_PAYMENTS_ENABLED=false`.

## Images

SoloHost installation never builds source. It pulls these versioned public images:

- `ghcr.io/smajorg/smajpihub-web:0.1.0`
- `ghcr.io/smajorg/smajpihub-backend:0.1.0`

The images do not exist until a controlled workflow publication is approved and completed. Do not use production secrets while building images; none are required.

## Local test

From the repository root, after creating a local `.env` beside the SoloHost Compose file with non-production test values:

```sh
docker build -f solohost/web/Dockerfile -t ghcr.io/smajorg/smajpihub-web:0.1.0 .
docker build -f backend/Dockerfile -t ghcr.io/smajorg/smajpihub-backend:0.1.0 backend
docker compose --env-file solohost/.env -f solohost/docker-compose.yml up -d
docker compose --env-file solohost/.env -f solohost/docker-compose.yml ps
curl http://127.0.0.1:18443/healthz
curl http://127.0.0.1:18443/api/health
```

Never commit `solohost/.env`. Stop the stack without deleting data using `docker compose ... down`; do not add `--volumes` when testing persistence.
