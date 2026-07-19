#!/bin/bash
# ============================================================
# BKNR ERP — Database Backup Script
# Usage: bash scripts/backup_db.sh
# Requires: DATABASE_URL env var set (postgresql://...)
# ============================================================
set -e

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_DIR="./backups"
BACKUP_FILE="$BACKUP_DIR/bknr_erp_backup_$TIMESTAMP.sql.gz"

if [ -z "$DATABASE_URL" ]; then
  echo "❌ DATABASE_URL env var not set."
  echo "   Set it: export DATABASE_URL=postgresql://user:pass@host/db"
  exit 1
fi

mkdir -p "$BACKUP_DIR"

echo "📦 Starting backup: $BACKUP_FILE"
echo "   Source: $DATABASE_URL"

pg_dump "$DATABASE_URL" | gzip > "$BACKUP_FILE"

SIZE=$(du -sh "$BACKUP_FILE" | cut -f1)
echo "✅ Backup complete: $BACKUP_FILE ($SIZE)"

# Keep only last 7 backups
echo "🧹 Cleaning old backups (keeping last 7)..."
ls -t "$BACKUP_DIR"/*.sql.gz 2>/dev/null | tail -n +8 | xargs -r rm
echo "   Done."

echo ""
echo "📝 To restore:"
echo "   gunzip -c $BACKUP_FILE | psql \$DATABASE_URL"
