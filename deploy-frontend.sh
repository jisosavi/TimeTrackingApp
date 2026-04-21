#!/usr/bin/env bash
# Build the Vue frontend and upload dist/ to cPanel via SFTP.
#
# Prerequisites:
#   1. Copy frontend/.env.production.example → frontend/.env.production
#      and set VITE_API_BASE to your Railway URL.
#   2. Set CPANEL_HOST, CPANEL_USER, and CPANEL_REMOTE_PATH below
#      (or export them as environment variables before running this script).
#
# Usage:
#   chmod +x deploy-frontend.sh
#   ./deploy-frontend.sh

set -euo pipefail

CPANEL_HOST="${CPANEL_HOST:-isosavi.com}"
CPANEL_USER="${CPANEL_USER:-}"
CPANEL_REMOTE_PATH="${CPANEL_REMOTE_PATH:-public_html/test/TimeTrackingAppVue}"

if [[ -z "$CPANEL_USER" ]]; then
  echo "Error: CPANEL_USER is not set."
  echo "Export it before running: export CPANEL_USER=your-cpanel-username"
  exit 1
fi

if [[ ! -f "frontend/.env.production" ]]; then
  echo "Error: frontend/.env.production not found."
  echo "Copy frontend/.env.production.example, fill in VITE_API_BASE, then retry."
  exit 1
fi

echo "==> Building frontend..."
cd frontend
npm run build
cd ..

echo "==> Uploading dist/ to ${CPANEL_USER}@${CPANEL_HOST}:${CPANEL_REMOTE_PATH}/"
rsync -avz --delete \
  -e "ssh" \
  frontend/dist/ \
  "${CPANEL_USER}@${CPANEL_HOST}:${CPANEL_REMOTE_PATH}/"

echo "==> Done. Site live at https://${CPANEL_HOST}/test/TimeTrackingAppVue/"
