#!/usr/bin/env bash
set -euo pipefail

# Multi-stage setup for playwright-mcp with the forked playwright-core.
#
# The playwright fork adds _extractDomForAI() and DOM state file output.
# npm workspaces resolve all deps in one pass, so we need to build the
# fork BEFORE npm hoists playwright-core — otherwise npm pulls the
# registry version which lacks our additions.
#
# Usage:
#   ./scripts/setup.sh          # full clean setup
#   ./scripts/setup.sh --quick  # skip clean, just rebuild

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

QUICK=false
[[ "${1:-}" == "--quick" ]] && QUICK=true

echo "=== playwright-mcp setup ==="
echo "    repo: $REPO_ROOT"
echo ""

# ── Stage 0: Clean (unless --quick) ──────────────────────────────────────
if [[ "$QUICK" == false ]]; then
  echo "[0/4] Cleaning node_modules and dist..."
  rm -rf node_modules
  rm -rf packages/playwright-mcp/node_modules
  rm -rf packages/playwright-mcp-multiplexer/node_modules
  rm -rf packages/playwright-mcp-multiplexer/dist
  echo "      done."
else
  echo "[0/4] Skipping clean (--quick)"
fi

# ── Stage 1: Bootstrap the playwright fork ───────────────────────────────
# Install the fork's own deps and build it. This produces:
#   playwright/packages/playwright-core/lib/  (with _extractDomForAI)
#   playwright/packages/playwright/lib/
#   playwright/packages/playwright-test/lib/
echo "[1/4] Installing playwright fork dependencies..."
(cd playwright && npm install --ignore-scripts 2>&1 | tail -3)

echo "[1/4] Building playwright fork (this compiles playwright-core, playwright, @playwright/mcp)..."
(cd packages/playwright-mcp && npm run build 2>&1 | tail -5)
echo "      done."

# Verify the fork built correctly
if ! grep -q "_extractDomForAI" playwright/packages/playwright-core/lib/client/page.js 2>/dev/null; then
  echo "ERROR: playwright-core build missing _extractDomForAI. Build failed?"
  exit 1
fi
echo "      verified: _extractDomForAI present in fork build."

# ── Stage 2: Install workspace packages ──────────────────────────────────
# Now that the fork is built, file: deps resolve to the built packages.
# npm will symlink playwright-core → playwright/packages/playwright-core
# instead of pulling from the registry.
echo "[2/4] Installing workspace packages..."
npm install 2>&1 | tail -5
echo "      done."

# ── Stage 3: Verify resolution ──────────────────────────────────────────
# The multiplexer's child processes must resolve playwright-core to the
# fork (with _extractDomForAI), not the npm registry version.
echo "[3/4] Verifying playwright-core resolution..."

MUX_DIR="packages/playwright-mcp-multiplexer"

# Check: multiplexer should NOT have its own local playwright-core
if [[ -d "$MUX_DIR/node_modules/playwright-core" ]] && [[ ! -L "$MUX_DIR/node_modules/playwright-core" ]]; then
  echo "WARNING: multiplexer has local playwright-core (not symlinked)."
  echo "         This means npm hoisted the wrong version."
  echo "         Checking if it has _extractDomForAI..."
  if grep -q "_extractDomForAI" "$MUX_DIR/node_modules/playwright-core/lib/client/page.js" 2>/dev/null; then
    echo "         OK — local copy has the method (might be a symlink target)."
  else
    echo "ERROR: multiplexer's playwright-core is from npm (missing _extractDomForAI)."
    echo "       Fixing by replacing with symlink to fork..."
    rm -rf "$MUX_DIR/node_modules/playwright-core"
    ln -s ../../../playwright/packages/playwright-core "$MUX_DIR/node_modules/playwright-core"
    echo "       Fixed."
  fi
fi

# Final check from the multiplexer's resolution perspective
RESULT=$(node -e "
  const dir = '$REPO_ROOT/$MUX_DIR';
  const resolved = require.resolve('playwright-core', { paths: [dir] });
  const fs = require('fs');
  const page = require('path').join(require('path').dirname(resolved), 'lib/client/page.js');
  console.log(fs.readFileSync(page,'utf8').includes('_extractDomForAI') ? 'OK' : 'FAIL');
")

if [[ "$RESULT" != "OK" ]]; then
  echo "ERROR: multiplexer still resolves to wrong playwright-core."
  exit 1
fi
echo "      verified: multiplexer resolves playwright-core to fork."

# ── Stage 4: Build the multiplexer ──────────────────────────────────────
echo "[4/4] Building multiplexer..."
(cd "$MUX_DIR" && npx tsc 2>&1 | tail -3)
echo "      done."

echo ""
echo "=== Setup complete ==="
echo "    playwright-core: fork with _extractDomForAI"
echo "    @playwright/mcp: built from fork"
echo "    multiplexer:     dist/ ready"
echo ""
echo "To use with Claude Code, reload the MCP plugin."
