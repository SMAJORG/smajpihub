#!/bin/sh
set -eu

html=/usr/share/nginx/html/index.html
escape_sed() { printf '%s' "$1" | sed 's/[&|\\]/\\&/g'; }
api_base=$(escape_sed "${API_BASE_URL:-/api}")
backend_url=$(escape_sed "${BACKEND_URL:-/api}")
sandbox=$(escape_sed "${SANDBOX_SDK:-false}")
solo_mode=$(escape_sed "${SOLOHOST_MODE:-true}")
oauth_client=$(escape_sed "${PI_OAUTH_CLIENT_ID:-}")
oauth_redirect=$(escape_sed "${PI_OAUTH_REDIRECT_URI:-}")

sed -i \
  -e "s|\$\$API_BASE_URL\$\$|${api_base}|g" \
  -e "s|\$\$BACKEND_URL\$\$|${backend_url}|g" \
  -e "s|\$\$SANDBOX_SDK\$\$|${sandbox}|g" \
  -e "s|\$\$SOLOHOST_MODE\$\$|${solo_mode}|g" \
  -e "s|\$\$PI_OAUTH_CLIENT_ID\$\$|${oauth_client}|g" \
  -e "s|\$\$PI_OAUTH_REDIRECT_URI\$\$|${oauth_redirect}|g" \
  "$html"

exec nginx -g 'daemon off;'
