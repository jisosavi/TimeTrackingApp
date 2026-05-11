#!/usr/bin/env bash
# Build the Vue frontend and upload dist/ to the cPanel public_html directory.
#
# Prerequisites:
#   1. Set VITE_API_BASE to the Deno Railway service URL and VITE_APP_BASE to
#      the sub-path on the Apache server in frontend/.env.production.
#   2. Set CPANEL_HOST and CPANEL_USER below
#      (or export them as environment variables before running this script).
#
# Usage:
#   chmod +x deploy-frontend.sh
#   ./deploy-frontend.sh

set -euo pipefail

CPANEL_HOST="${CPANEL_HOST:-isosavi.com}"
CPANEL_USER="${CPANEL_USER:-}"

if [[ -z "$CPANEL_USER" ]]; then
  echo "Error: CPANEL_USER is not set."
  echo "Export it before running: export CPANEL_USER=your-cpanel-username"
  exit 1
fi

if [[ ! -f "frontend/.env.production" ]]; then
  echo "Error: frontend/.env.production not found."
  echo "Copy frontend/.env.production.example, fill in VITE_API_BASE and VITE_APP_BASE, then retry."
  exit 1
fi

# Read VITE_APP_BASE from .env.production (default to /test/TimeTrackingAppVue/)
APP_BASE=$(grep -E '^VITE_APP_BASE=' frontend/.env.production | cut -d'=' -f2- | tr -d '"' | tr -d "'" | xargs)
APP_BASE="${APP_BASE:-/test/TimeTrackingAppVue/}"

# Ensure APP_BASE starts and ends with /
[[ "$APP_BASE" != /* ]]  && APP_BASE="/$APP_BASE"
[[ "$APP_BASE" != */ ]]  && APP_BASE="$APP_BASE/"

# Derive the remote directory: strip leading slash, prepend public_html/
REMOTE_SUBPATH="${APP_BASE#/}"          # remove leading /
REMOTE_SUBPATH="${REMOTE_SUBPATH%/}"    # remove trailing /
CPANEL_REMOTE_PATH="${CPANEL_REMOTE_PATH:-public_html/${REMOTE_SUBPATH}}"

echo "==> App base path : $APP_BASE"
echo "==> Remote path   : ${CPANEL_USER}@${CPANEL_HOST}:${CPANEL_REMOTE_PATH}/"

echo "==> Building frontend..."
cd frontend
npm run build
cd ..

echo "==> Uploading dist/ to ${CPANEL_USER}@${CPANEL_HOST}:${CPANEL_REMOTE_PATH}/"
rsync -avz --delete \
  --exclude='.well-known/' \
  --exclude='cgi-bin/' \
  --exclude='mail/' \
  -e "ssh" \
  frontend/dist/ \
  "${CPANEL_USER}@${CPANEL_HOST}:${CPANEL_REMOTE_PATH}/"

echo "==> Done. Site live at https://${CPANEL_HOST}${APP_BASE}"
