#!/usr/bin/env bash
# Verify GitHub/local repo files are in sync before deploy.
# Run from repo root: bash scripts/nexlify-verify-sync.sh

set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PASS=0
FAIL=0
WARN=0

ok()   { echo "  ✓ $*"; PASS=$((PASS + 1)); }
fail() { echo "  ✗ $*"; FAIL=$((FAIL + 1)); }
warn() { echo "  ! $*"; WARN=$((WARN + 1)); }

section() { echo ""; echo "=== $* ==="; }

section "Git"
if git diff --quiet && git diff --cached --quiet; then
  ok "Working tree clean (no uncommitted changes)"
else
  fail "Uncommitted changes — run: git status"
  git status -sb | head -10
fi

git fetch origin main 2>/dev/null || true
LOCAL="$(git rev-parse HEAD 2>/dev/null || echo none)"
REMOTE="$(git rev-parse origin/main 2>/dev/null || echo none)"
if [ "$LOCAL" = "$REMOTE" ]; then
  ok "HEAD matches origin/main ($LOCAL)"
else
  fail "HEAD differs from origin/main (local=$LOCAL remote=$REMOTE)"
fi

section "Release feed"
if diff -q src/lib/panel-releases.json marketing-drop-in/src/lib/panel-releases.json >/dev/null 2>&1; then
  ok "panel-releases.json in sync (panel → marketing src)"
else
  fail "panel-releases.json drift — run: npm run sync:releases"
fi
if diff -q src/lib/panel-releases.json marketing-drop-in/public/panel-releases.json >/dev/null 2>&1; then
  ok "panel-releases.json in sync (panel → marketing public)"
else
  fail "public/panel-releases.json drift — run: npm run sync:releases"
fi

PKG_VER="$(node -p "require('./package.json').version" 2>/dev/null || echo "")"
REL_VER="$(node -p "require('./src/lib/panel-releases.json').latestVersion" 2>/dev/null || echo "")"
IC_VER="$(node -p "require('./marketing-drop-in/public/install-command.json').version" 2>/dev/null || echo "")"
LS_VER="$(node -p "require('./license-server/package.json').version" 2>/dev/null || echo "")"
if [ -n "$PKG_VER" ] && [ "$PKG_VER" = "$REL_VER" ] && [ "$PKG_VER" = "$IC_VER" ] && [ "$PKG_VER" = "$LS_VER" ]; then
  ok "versions aligned at $PKG_VER"
else
  fail "version mismatch package=$PKG_VER releases=$REL_VER install-command=$IC_VER license-server=$LS_VER"
fi

section "Installer secret file"
SYNC_ENV="marketing-drop-in/public/install/panel-sync.env"
if [ ! -f "$SYNC_ENV" ]; then
  fail "missing $SYNC_ENV"
elif grep -qE '^PANEL_API_SECRET=.+' "$SYNC_ENV"; then
  fail "$SYNC_ENV publishes PANEL_API_SECRET — must be a comment-only stub"
else
  ok "panel-sync.env has no published secret"
fi
if diff -q scripts/install-linux.sh marketing-drop-in/scripts/install-linux.sh >/dev/null 2>&1; then
  ok "marketing-drop-in/scripts/install-linux.sh matches scripts/"
else
  fail "marketing-drop-in/scripts/install-linux.sh drift — run: bash scripts/sync-install-to-marketing.sh"
fi

section "Installer scripts (scripts/ → marketing-drop-in/public/install/)"
INSTALL="$ROOT/marketing-drop-in/public/install"
SCRIPTS="$ROOT/scripts"
check_install() {
  local src="$1" dst="$2"
  if [ ! -f "$SCRIPTS/$src" ]; then warn "missing source scripts/$src"; return; fi
  if [ ! -f "$INSTALL/$dst" ]; then fail "missing $dst"; return; fi
  if diff -q <(grep -v 'PANEL_CACHE_BUST=' "$SCRIPTS/$src") \
              <(grep -v 'PANEL_CACHE_BUST=' "$INSTALL/$dst") >/dev/null 2>&1; then
    ok "$dst"
  else
    fail "$dst drift — run: bash scripts/sync-install-to-marketing.sh"
  fi
}
check_install install-linux.sh panel.sh
for f in apply-panel-fast-update.sh fix-panel-auto-update.sh fix-panel-restart.sh \
  fix-panel-license-sync.sh fix-stream-edge-now.sh; do
  check_install "$f" "$f"
done

section "Generated artifacts (should NOT be in git)"
for f in \
  marketing-drop-in/scripts/vps-full-update.sh \
  public/downloads/nexlify-panel.tar.gz \
  scripts/.panel-releases-website-snippet.ts; do
  if git ls-files --error-unmatch "$f" >/dev/null 2>&1; then
    fail "Tracked in git (should be gitignored): $f"
  else
    ok "Not in git: $f"
  fi
done

if [ -f marketing-drop-in/scripts/vps-full-update.sh ]; then
  ok "vps-full-update.sh generated locally ($(du -h marketing-drop-in/scripts/vps-full-update.sh | cut -f1))"
else
  warn "vps-full-update.sh not generated — run: bash scripts/nexlify-sync-all.sh"
fi

section "Removed orphan dirs"
for d in marketing-growth-toolkit promo-for-nexlify-web; do
  if [ -d "$d" ]; then fail "Orphan dir still exists: $d"; else ok "Removed: $d"; fi
done

section "Marketing health scripts"
for f in \
  marketing-drop-in/scripts/nexlify-full-platform-audit.sh \
  marketing-drop-in/scripts/marketing-health-check.sh \
  marketing-drop-in/scripts/configure-marketing-smtp-stripe.sh \
  marketing-drop-in/deploy/nginx-security-headers.conf; do
  [ -f "$f" ] && ok "$(basename "$f")" || fail "Missing: $f"
done

section "Summary"
echo ""
echo "Passed: $PASS"
echo "Warnings: $WARN"
echo "Failed: $FAIL"
echo ""
if [ "$FAIL" -eq 0 ]; then
  echo "REPO SYNC OK — safe to deploy."
  exit 0
else
  echo "REPO SYNC FAILED — fix ✗ items, then: bash scripts/nexlify-sync-all.sh && git push"
  exit 1
fi
