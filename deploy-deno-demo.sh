#!/usr/bin/env bash
# Build and deploy the frontend pointed at the Deno backend.
# Deploys to isosavi.com/test/timetrackingapp-deno/
# Does NOT touch .env.production — uses .env.deno-demo as an override.

set -euo pipefail

CPANEL_HOST="${CPANEL_HOST:-isosavi.com}"
CPANEL_USER="${CPANEL_USER:-}"

if [[ -z "$CPANEL_USER" ]]; then
  echo "Error: CPANEL_USER is not set."
  echo "Export it before running: export CPANEL_USER=your-cpanel-username"
  exit 1
fi

ENV_OVERRIDE="frontend/.env.production.local"
ENV_SOURCE="frontend/.env.deno-demo"

# Write the override file (removed in cleanup below)
cp "$ENV_SOURCE" "$ENV_OVERRIDE"
trap "rm -f $ENV_OVERRIDE" EXIT

# Read VITE_APP_BASE from the override to derive the remote path
APP_BASE=$(grep -E '^VITE_APP_BASE=' "$ENV_OVERRIDE" | cut -d'=' -f2- | xargs)
[[ "$APP_BASE" != /* ]] && APP_BASE="/$APP_BASE"
[[ "$APP_BASE" != */ ]] && APP_BASE="$APP_BASE/"

REMOTE_SUBPATH="${APP_BASE#/}"
REMOTE_SUBPATH="${REMOTE_SUBPATH%/}"
REMOTE_PATH="public_html/${REMOTE_SUBPATH}"

echo "==> API base  : $(grep VITE_API_BASE $ENV_OVERRIDE | cut -d= -f2-)"
echo "==> App base  : $APP_BASE"
echo "==> Remote    : ${CPANEL_USER}@${CPANEL_HOST}:${REMOTE_PATH}/"

echo "==> Building..."
cd frontend
npm run build
cd ..

echo "==> Uploading..."
rsync -avz --delete \
  --exclude='.well-known/' \
  --exclude='cgi-bin/' \
  --exclude='mail/' \
  -e "ssh" \
  frontend/dist/ \
  "${CPANEL_USER}@${CPANEL_HOST}:${REMOTE_PATH}/"

echo "==> Live at https://${CPANEL_HOST}${APP_BASE}"
