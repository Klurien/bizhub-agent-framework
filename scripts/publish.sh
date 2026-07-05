#!/usr/bin/env bash
set -euo pipefail

echo "╔══════════════════════════════════════════════╗"
echo "║   BizHub Agent Framework — Publish          ║"
echo "╚══════════════════════════════════════════════╝"

# Prerequisites check
if ! npm whoami &>/dev/null; then
  echo "✖ Not logged in to npm. Run: npm login"
  exit 1
fi

echo "✔ Logged in as: $(npm whoami)"
echo ""

ROOT="$(dirname "$(dirname "$(realpath "$0")")")"

# Build everything
echo "→ Building packages..."
cd "$ROOT"
npm install --silent
npx tsc -b packages/agent-kit packages/mcp-server packages/cli
echo "✔ Build complete"
echo ""

# Run tests
echo "→ Running tests..."
npx tsx --test packages/agent-kit/__tests__/tool-registry.test.ts
echo "✔ Tests passed"
echo ""

# Publish order: agent-kit first, then dependents
for PKG in agent-kit mcp-server cli; do
  echo "→ Publishing @bizhub/$PKG..."
  cd "$ROOT/packages/$PKG"
  
  # Check if version already exists
  VER=$(node -p "require('./package.json').version")
  if npm view "@bizhub/$PKG@$VER" version &>/dev/null; then
    echo "  ⚠ Version $VER already published. Bump version first."
    continue
  fi
  
  npm publish --access public
  echo "  ✔ @bizhub/$PKG@$VER published"
  cd "$ROOT"
  echo ""
done

echo "╔══════════════════════════════════════════════╗"
echo "║  All packages published successfully!       ║"
echo "╚══════════════════════════════════════════════╝"
