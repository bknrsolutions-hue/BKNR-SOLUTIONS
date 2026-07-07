#!/bin/bash
# ============================================================
# BKNR ERP — Enterprise Release Script
# ============================================================
# Usage: bash scripts/release.sh <version> [description]
# Example: bash scripts/release.sh 1.2.3 "Fix reconciliation diff"
#
# Pipeline:
#   DB Backup → Git Clean → Alembic Current → Tests → Tag → Push → Health Check
# ============================================================
set -euo pipefail

# ── Args ─────────────────────────────────────────────────────
VERSION="${1:-}"
DESCRIPTION="${2:-Release v${1:-}}"
PRODUCTION_URL="${PRODUCTION_URL:-https://bknrerp.in}"
TAG="v$VERSION"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info()  { echo -e "${BLUE}[INFO]${NC} $*"; }
ok()    { echo -e "${GREEN}[✓]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
fail()  { echo -e "${RED}[✗]${NC} $*"; exit 1; }

# ── Validate version ──────────────────────────────────────────
if [ -z "$VERSION" ]; then
  fail "Usage: bash scripts/release.sh <version> [description]\n  Example: bash scripts/release.sh 1.2.3 'Fix report'"
fi
if ! echo "$VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$'; then
  fail "Version must be semver format: X.Y.Z (e.g. 1.2.3)"
fi

echo ""
echo "══════════════════════════════════════════════════════"
echo "  BKNR ERP Release Pipeline — v$VERSION"
echo "══════════════════════════════════════════════════════"
echo ""

CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
info "Current branch: $CURRENT_BRANCH"

if [ "$CURRENT_BRANCH" != "main" ]; then
  warn "You are NOT on 'main' branch (currently: $CURRENT_BRANCH)"
  echo -n "  Continue anyway? (y/N): "
  read -r confirm
  [ "$confirm" = "y" ] || fail "Aborted — switch to main branch first."
fi

# ── Step 1: DB Backup ─────────────────────────────────────────
info "Step 1/6 — Database Backup"
if [ -n "${DATABASE_URL:-}" ]; then
  if command -v pg_dump &>/dev/null; then
    bash "$(dirname "$0")/backup_db.sh"
    ok "Database backup complete"
  else
    warn "pg_dump not found — skipping DB backup (install PostgreSQL client tools)"
  fi
else
  warn "DATABASE_URL not set — skipping DB backup"
fi

# ── Step 2: Git Clean Check ───────────────────────────────────
info "Step 2/6 — Git Clean Check"
if [[ -n $(git status --porcelain) ]]; then
  fail "Uncommitted changes found. Please commit or stash before release:\n$(git status --short)"
fi
ok "Working directory is clean"

# ── Step 3: Alembic Migration Check ──────────────────────────
info "Step 3/6 — Alembic Migration Status"
ALEMBIC_CMD=""
if [ -f ".venv/bin/alembic" ]; then
  ALEMBIC_CMD=".venv/bin/alembic"
elif command -v alembic &>/dev/null; then
  ALEMBIC_CMD="alembic"
fi

if [ -n "$ALEMBIC_CMD" ] && [ -n "${DATABASE_URL:-}" ]; then
  CURRENT_REV=$($ALEMBIC_CMD current 2>/dev/null | grep "(head)" || true)
  if [ -z "$CURRENT_REV" ]; then
    warn "Database is not at alembic HEAD. Run: $ALEMBIC_CMD upgrade head"
    echo -n "  Continue anyway? (y/N): "
    read -r confirm
    [ "$confirm" = "y" ] || fail "Aborted — apply migrations first."
  else
    ok "Database migrations are at HEAD"
  fi
else
  warn "Skipping alembic check (alembic not found or DATABASE_URL not set)"
fi

# ── Step 4: Run Tests ─────────────────────────────────────────
info "Step 4/6 — Run Tests"
PYTHON_CMD=""
if [ -f ".venv/bin/python" ]; then
  PYTHON_CMD=".venv/bin/python"
elif command -v python3 &>/dev/null; then
  PYTHON_CMD="python3"
fi

if [ -n "$PYTHON_CMD" ] && [ -d "tests" ]; then
  if $PYTHON_CMD -m pytest tests/ -q --tb=short 2>/dev/null; then
    ok "All tests passed"
  else
    fail "Tests failed! Fix before releasing."
  fi
else
  warn "No tests directory found — skipping test run"
fi

# ── Step 5: Create Git Tag ────────────────────────────────────
info "Step 5/6 — Create Git Tag: $TAG"
if git tag | grep -q "^$TAG$"; then
  fail "Tag $TAG already exists! Bump the version."
fi
git tag -a "$TAG" -m "Release $TAG — $DESCRIPTION"
ok "Tag $TAG created"

# ── Step 6: Push Tag to GitHub ───────────────────────────────
info "Step 6/6 — Push Tag to GitHub"
git push origin "$TAG"
ok "Tag $TAG pushed — Render will auto-deploy from main"

# ── Health Check (post-deploy) ────────────────────────────────
echo ""
echo "──────────────────────────────────────────────────────"
info "Post-deploy Health Check (waiting 60s for Render to deploy...)"
echo "  Monitoring: $PRODUCTION_URL/health"
echo "  Expected version: $VERSION"
echo ""

sleep 60   # wait for Render to start deploy

MAX_RETRIES=12
RETRY_DELAY=15
DEPLOYED=false

for i in $(seq 1 $MAX_RETRIES); do
  info "Health check attempt $i/$MAX_RETRIES..."
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$PRODUCTION_URL/health" 2>/dev/null || echo "000")
  VERSION_RESP=$(curl -s "$PRODUCTION_URL/api/version" 2>/dev/null || echo "{}")
  DEPLOYED_VER=$(echo "$VERSION_RESP" | grep -o '"version":"[^"]*"' | cut -d'"' -f4 || echo "")

  if [ "$HTTP_CODE" = "200" ]; then
    ok "Health check: HTTP 200"
    if [ "$DEPLOYED_VER" = "$VERSION" ]; then
      ok "Version confirmed: $DEPLOYED_VER"
      DEPLOYED=true
      break
    else
      warn "Version mismatch — deployed: ${DEPLOYED_VER:-unknown}, expected: $VERSION"
    fi
  else
    warn "Health check returned HTTP $HTTP_CODE — retrying in ${RETRY_DELAY}s..."
  fi
  sleep $RETRY_DELAY
done

echo ""
echo "══════════════════════════════════════════════════════"
if [ "$DEPLOYED" = true ]; then
  ok "🚀 Release $TAG is LIVE!"
  echo "   URL: $PRODUCTION_URL"
  echo "   Version: $VERSION"
  echo ""
  echo "📝 Next steps:"
  echo "   1. Smoke test key features manually (5-10 min)"
  echo "   2. Disable maintenance mode if enabled: POST /admin/maintenance/disable"
  echo "   3. Watch Render logs for errors"
else
  warn "⚠️  Could not confirm deploy. Check manually:"
  echo "   Health: $PRODUCTION_URL/health"
  echo "   Version: $PRODUCTION_URL/api/version"
  echo "   Render Dashboard: https://dashboard.render.com"
  echo ""
  echo "   Rollback: git checkout $(git describe --abbrev=0 --tags --exclude=$TAG 2>/dev/null || echo 'previous-tag')"
fi
echo "══════════════════════════════════════════════════════"
