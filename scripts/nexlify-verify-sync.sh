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
  ok "panel-releases.json in sync (panel → marketing)"
else
  fail "panel-releases.json drift — run: npm run sync:releases"
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
