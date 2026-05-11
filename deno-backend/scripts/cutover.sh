#!/usr/bin/env bash
# Phase 5 cutover: copy SQLite databases from PHP service to Deno service.
#
# Prerequisites:
#   railway CLI installed and logged in
#   Both services in the same Railway project
#
# Usage:
#   ./deno-backend/scripts/cutover.sh [php-service-name] [deno-service-name] [php-data-dir] [deno-data-dir]
#
# Defaults:
#   php-service-name  = timetrackingapp
#   deno-service-name = timetrackingapp-deno
#   php-data-dir      = /app/data            (adjust if DB_DIR differs on PHP service)
#   deno-data-dir     = /app/data

set -euo pipefail

PHP_SVC="${1:-timetrackingapp}"
DENO_SVC="${2:-timetrackingapp-deno}"
PHP_DIR="${3:-/app/data}"
DENO_DIR="${4:-/app/data}"
TMP=$(mktemp -d)
trap "rm -rf $TMP" EXIT

echo "=== Phase 5 cutover ==="
echo "PHP  service : $PHP_SVC  (data: $PHP_DIR)"
echo "Deno service : $DENO_SVC (data: $DENO_DIR)"
echo ""
echo "Step 1: verify PHP data directory..."
railway exec --service "$PHP_SVC" -- ls "$PHP_DIR"

echo ""
echo "Step 2: ensure Deno data/companies directory exists..."
railway exec --service "$DENO_SVC" -- mkdir -p "$DENO_DIR/companies"

echo ""
echo "Step 3: migrate master.sqlite..."
railway exec --service "$PHP_SVC" -- sqlite3 "$PHP_DIR/master.sqlite" .dump \
  > "$TMP/master.sql"
railway exec --service "$DENO_SVC" -- sh -c \
  "sqlite3 $DENO_DIR/master.sqlite < /dev/stdin" < "$TMP/master.sql"
echo "  master.sqlite done ($(wc -l < "$TMP/master.sql") lines)"

echo ""
echo "Step 4: find company DB files..."
COMPANY_IDS=$(railway exec --service "$PHP_SVC" -- \
  sh -c "ls $PHP_DIR/companies/*.sqlite 2>/dev/null | sed 's|.*/||' | sed 's|\.sqlite||'")

if [ -z "$COMPANY_IDS" ]; then
  echo "  No company databases found — done."
else
  for ID in $COMPANY_IDS; do
    echo "  Migrating companies/$ID.sqlite..."
    railway exec --service "$PHP_SVC" -- sqlite3 "$PHP_DIR/companies/$ID.sqlite" .dump \
      > "$TMP/company_$ID.sql"
    railway exec --service "$DENO_SVC" -- sh -c \
      "sqlite3 $DENO_DIR/companies/$ID.sqlite < /dev/stdin" < "$TMP/company_$ID.sql"
    echo "    done ($(wc -l < "$TMP/company_$ID.sql") lines)"
  done
fi

echo ""
echo "=== Migration complete. ==="
echo "Next steps:"
echo "  1. Test Deno service endpoints"
echo "  2. Update frontend VITE_API_BASE_URL (or Railway custom domain)"
echo "  3. Stop the PHP service once verified"
