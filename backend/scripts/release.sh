#!/bin/bash
# ============================================================
# BKNR ERP — Release Script
# Usage: bash scripts/release.sh 1.2.3 "Short description"
# ============================================================
set -e

VERSION=$1
MESSAGE="${2:-Release v$1}"

if [ -z "$VERSION" ]; then
  echo "❌ Usage: bash scripts/release.sh <version> [message]"
  echo "   Example: bash scripts/release.sh 1.2.3 'Fix reconciliation diff'"
  exit 1
fi

# Validate semver format
if ! echo "$VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$'; then
  echo "❌ Version must be in semver format: X.Y.Z (e.g. 1.2.3)"
  exit 1
fi

TAG="v$VERSION"

echo "🔍 Checking working directory is clean..."
if [[ -n $(git status --porcelain) ]]; then
  echo "❌ Working directory has uncommitted changes. Please commit or stash first."
  exit 1
fi

CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
echo "📌 Current branch: $CURRENT_BRANCH"

if [ "$CURRENT_BRANCH" != "main" ]; then
  echo "⚠️  Warning: You are not on 'main' branch. Are you sure? (y/n)"
  read -r confirm
  if [ "$confirm" != "y" ]; then exit 1; fi
fi

echo "🏷️  Creating tag: $TAG"
git tag -a "$TAG" -m "$MESSAGE"

echo "📤 Pushing tag to origin..."
git push origin "$TAG"

echo ""
echo "✅ Release $TAG created and pushed!"
echo "   → Render Production will auto-deploy from 'main' branch"
echo "   → Monitor: https://dashboard.render.com"
echo ""
echo "📝 Rollback command if needed:"
echo "   git checkout $TAG"
