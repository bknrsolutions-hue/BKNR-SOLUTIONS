#!/bin/bash
# ============================================================
# BKNR ERP — Enterprise Release Script (v1.0.3)
# ============================================================
# Usage: bash scripts/release.sh <version> [description]
# Example: bash scripts/release.sh 1.2.3 "Fix reconciliation diff"
#
# Pipeline:
#   DB Backup → Git Clean → Alembic Current → Tests → Deploy Lock → Tag → Push
#   → Live/Ready Health Checks → DB Version Record → Deploy Unlock
# ============================================================
set -euo pipefail

# ── Args ─────────────────────────────────────────────────────
VERSION="${1:-}"
DESCRIPTION="${2:-Release v${1:-}}"
PRODUCTION_URL="${PRODUCTION_URL:-https://bknrerp.in}"
DEPLOYMENT_TOKEN="${DEPLOYMENT_TOKEN:-bknr_deploy_token_2026}"
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
info "Step 1/8 — Database Backup"
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
info "Step 2/8 — Git Clean Check"
if [[ -n $(git status --porcelain) ]]; then
  fail "Uncommitted changes found. Please commit or stash before release:\n$(git status --short)"
fi
ok "Working directory is clean"

# ── Step 3: Alembic Migration Check ──────────────────────────
info "Step 3/8 — Alembic Migration Status"
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
info "Step 4/8 — Run Tests"
PYTHON_CMD=""
if [ -f ".venv/bin/python" ]; then
  PYTHON_CMD=".venv/bin/python"
elif command -v python3 &>/dev/null; then
  PYTHON_CMD="python3"
fi

if [ -n "$PYTHON_CMD" ] && [ -d "tests" ]; then
  # Simple directory files check (skip pytest if tests directory is empty or has no python test files)
  if [ -n "$(find tests -name 'test_*.py' -o -name '*_test.py' 2>/dev/null)" ]; then
    if $PYTHON_CMD -m pytest tests/ -q --tb=short 2>/dev/null; then
      ok "All tests passed"
    else
      fail "Tests failed! Fix before releasing."
    fi
  else
    ok "No test files found in tests/ directory — skipping test run"
  fi
else
  warn "No tests directory found — skipping test run"
fi

# ── Step 5: Acquire Deployment Lock ───────────────────────────
info "Step 5/8 — Acquire Deployment Lock on Production"
LOCK_BYPASSED=false
LOCK_RESP=$(curl -s -w "\n%{http_code}" -X POST \
  -H "Content-Type: application/json" \
  -H "X-Deploy-Token: $DEPLOYMENT_TOKEN" \
  -H "X-Deploy-Actor: release_script" \
  -d "{\"version\":\"$VERSION\"}" \
  "$PRODUCTION_URL/admin/deploy/lock" || echo -e "\n500")

HTTP_STATUS=$(echo "$LOCK_RESP" | tail -n1)
BODY=$(echo "$LOCK_RESP" | sed '$d')

if [ "$HTTP_STATUS" = "404" ]; then
  warn "Deployment lock endpoint not found (HTTP 404). Server might be running an older version. Skipping lock check."
  LOCK_BYPASSED=true
elif [ "$HTTP_STATUS" != "200" ]; then
  fail "Deployment lock acquisition failed (HTTP $HTTP_STATUS):\n$BODY"
else
  ok "Deployment lock acquired successfully"
fi

# ── Safe Cleanup on failure ──────────────────────────────────
cleanup() {
  local exit_code=$?
  if [ "$LOCK_BYPASSED" = false ]; then
    if [ "$exit_code" -ne 0 ]; then
      warn "Pipeline failed. Releasing deployment lock with failure status..."
      curl -s -X POST \
        -H "Content-Type: application/json" \
        -H "X-Deploy-Token: $DEPLOYMENT_TOKEN" \
        -H "X-Deploy-Actor: release_script" \
        -d "{\"version\":\"$VERSION\",\"result\":\"failure\",\"detail\":\"Pipeline failed with exit code $exit_code\"}" \
        "$PRODUCTION_URL/admin/deploy/unlock" >/dev/null || true
    fi
  fi
}
trap cleanup EXIT

# ── Step 6: Create Git Tag ────────────────────────────────────
info "Step 6/8 — Create Git Tag: $TAG"
if git tag | grep -q "^$TAG$"; then
  fail "Tag $TAG already exists! Bump the version."
fi
git tag -a "$TAG" -m "Release $TAG — $DESCRIPTION"
ok "Tag $TAG created"

# ── Step 7: Push Tag to GitHub ───────────────────────────────
info "Step 7/8 — Push Tag to GitHub"
git push origin "$TAG"
ok "Tag $TAG pushed — Render will auto-deploy from main"

# ── Step 8: Health Checks and Version Verification ───────────
echo ""
echo "──────────────────────────────────────────────────────"
info "Step 8/8 — Post-deploy Health Check (waiting 60s for Render to deploy...)"
echo "  Live:   $PRODUCTION_URL/health/live"
echo "  Ready:  $PRODUCTION_URL/health/ready"
echo "  Version: $PRODUCTION_URL/api/version"
echo ""

sleep 60   # wait for Render to start build/deploy process

MAX_RETRIES=16
RETRY_DELAY=15
DEPLOYED=false

for i in $(seq 1 $MAX_RETRIES); do
  info "Health check attempt $i/$MAX_RETRIES..."
  
  # 1. Live Check
  LIVE_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$PRODUCTION_URL/health/live" 2>/dev/null || echo "000")
  # 2. Ready Check
  READY_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$PRODUCTION_URL/health/ready" 2>/dev/null || echo "000")
  # 3. Version Check
  VERSION_RESP=$(curl -s "$PRODUCTION_URL/api/version" 2>/dev/null || echo "{}")
  DEPLOYED_VER=$(echo "$VERSION_RESP" | grep -o '"version":"[^"]*"' | cut -d'"' -f4 || echo "")

  if [ "$LIVE_CODE" = "200" ] && [ "$READY_CODE" = "200" ]; then
    ok "Liveness & Readiness checks: PASSED (HTTP 200)"
    if [ "$DEPLOYED_VER" = "$VERSION" ]; then
      ok "Version matches expected: $DEPLOYED_VER"
      DEPLOYED=true
      break
    else
      warn "Version mismatch — deployed: ${DEPLOYED_VER:-unknown}, expected: $VERSION"
    fi
  else
    warn "Server not ready (Live: $LIVE_CODE, Ready: $READY_CODE) — retrying in ${RETRY_DELAY}s..."
  fi
  sleep $RETRY_DELAY
done

if [ "$DEPLOYED" = true ]; then
  # ── Record version in DB ────────────────────────────────────
  info "Recording new version history in database..."
  curl -s -X POST \
    -H "Content-Type: application/json" \
    -H "X-Deploy-Token: $DEPLOYMENT_TOKEN" \
    -H "X-Deploy-Actor: release_script" \
    -d "{\"version\":\"$VERSION\",\"description\":\"$DESCRIPTION\"}" \
    "$PRODUCTION_URL/admin/version/record" >/dev/null || warn "Failed to record version in DB history"

  # ── Release Deployment Lock ─────────────────────────────────
  if [ "$LOCK_BYPASSED" = false ]; then
    release_resp=$(curl -s -w "\n%{http_code}" -X POST \
      -H "Content-Type: application/json" \
      -H "X-Deploy-Token: $DEPLOYMENT_TOKEN" \
      -H "X-Deploy-Actor: release_script" \
      -d "{\"version\":\"$VERSION\",\"result\":\"success\",\"detail\":\"Deployed and health-checked successfully\"}" \
      "$PRODUCTION_URL/admin/deploy/unlock")
    HTTP_STATUS=$(echo "$release_resp" | tail -n1)
    if [ "$HTTP_STATUS" = "200" ]; then
      ok "Deployment lock released successfully"
    else
      warn "Failed to release deployment lock (HTTP $HTTP_STATUS)"
    fi
  fi

  echo ""
  echo "══════════════════════════════════════════════════════"
  ok "🚀 Release $TAG is LIVE and audited!"
  echo "   URL: $PRODUCTION_URL"
  echo "   Version: $VERSION"
  echo ""
  echo "📝 Post-Release Recommendations:"
  echo "   1. Run a 5-minute manual smoke test of key tables"
  echo "   2. Turn OFF maintenance mode if enabled: POST /admin/maintenance/disable"
  echo "══════════════════════════════════════════════════════"
else
  warn "⚠️  Could not confirm deploy automatically."
  echo "   Live Check:   $PRODUCTION_URL/health/live"
  echo "   Ready Check:  $PRODUCTION_URL/health/ready"
  echo "   Version Info: $PRODUCTION_URL/api/version"
  echo "   Render Log:   https://dashboard.render.com"
  echo ""
  echo "   To rollback, checkout previous tag and push:"
  echo "   git checkout $(git describe --abbrev=0 --tags --exclude=$TAG 2>/dev/null || echo 'previous-tag')"
  echo "══════════════════════════════════════════════════════"
  exit 1
fi
