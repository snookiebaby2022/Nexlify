#!/usr/bin/env bash
# One-shot VPS repair — no git required. Run as root on marketing VPS.
#
#   curl -fsSL 'https://raw.githubusercontent.com/snookiebaby2022/Nexlify/main/marketing-drop-in/public/install/vps-emergency-fix.sh' | bash
#   bash /var/www/nexlify/public/install/vps-emergency-fix.sh
set -euo pipefail

PANEL="${NEXLIFY_PANEL_DIR:-/home/nexlify-panel}"
MARKETING="${MARKETING_DIR:-/var/www/nexlify}"
INSTALL="$MARKETING/public/install"
TAR="$MARKETING/public/downloads/nexlify-panel.tar.gz"
GITHUB="${NEXLIFY_GITHUB_RAW:-https://raw.githubusercontent.com/snookiebaby2022/Nexlify/main}"

log() { echo ""; echo "==> $*"; }
die() { echo "ERROR: $*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Run as root"

fetch() {
  local url="$1" dest="$2"
  if curl -fsSL --max-time 30 "$url" -o "$dest.tmp" 2>/dev/null; then
    mv -f "$dest.tmp" "$dest"
    echo "   fetched $(basename "$dest")"
    return 0
  fi
  rm -f "$dest.tmp"
  return 1
}

installer_ok() {
  [ -f "$1" ] && grep -q 'detect_server_address' "$1" 2>/dev/null \
    && ! grep -qE 'FATAL.*domain|--domain is required|YOUR_SERVER_IP' "$1" 2>/dev/null
}

log "Nexlify VPS emergency fix"
log "Panel repo: $PANEL"
log "Marketing:  $MARKETING"

[ -d "$PANEL" ] || die "Panel dir missing: $PANEL"
mkdir -p "$INSTALL/scripts" "$(dirname "$TAR")"

PANEL_VER="$(node -p "require('$PANEL/package.json').version" 2>/dev/null || echo 1.9.7)"

# ── 1) Update packaging scripts ──
log "Updating panel packaging scripts..."

for pair in \
  "scripts/build-panel-download.sh|$PANEL/scripts/build-panel-download.sh" \
  "scripts/publish-panel-release.sh|$PANEL/scripts/publish-panel-release.sh" \
  "scripts/install-linux.sh|$PANEL/scripts/install-linux.sh" \
  ".env.example|$PANEL/.env.example"; do
  src="${pair%%|*}"
  dest="${pair##*|}"
  fetch "$GITHUB/$src" "$dest" || true
done

if [ -f "$PANEL/scripts/publish-panel-release.sh" ] && \
   grep -q "\-\-exclude='\.env\*'" "$PANEL/scripts/publish-panel-release.sh" 2>/dev/null; then
  sed -i "s/--exclude='\.env\*'/--exclude='.env' --exclude='.env.local' --exclude='.env.production' --exclude='.env.development' --exclude='.env.backup.*'/g" \
    "$PANEL/scripts/publish-panel-release.sh"
  echo "   patched publish (.env* exclude)"
fi

if [ -f "$PANEL/scripts/build-panel-download.sh" ] && \
   grep -q 'WARN: tarball verify' "$PANEL/scripts/build-panel-download.sh" 2>/dev/null; then
  cat > "$PANEL/scripts/build-panel-download.sh" << 'BUILDEOF'
#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$ROOT/dist/nexlify-panel.tar.gz}"
mkdir -p "$(dirname "$OUT")"
rm -f "$OUT"
tar -czf "$OUT" \
  --exclude=node_modules --exclude=.next --exclude=.git \
  --exclude=./data --exclude=.env --exclude=.env.local \
  --exclude=.env.production --exclude=.env.development --exclude=dist \
  -C "$ROOT" .
echo "Built $OUT ($(du -h "$OUT" | cut -f1))"
missing=""
for f in .env.example package.json package-lock.json prisma/schema.prisma scripts/pm2-start.sh scripts/set-admin-password.cjs scripts/sync-license-env.mjs scripts/ensure-panel-env.sh scripts/verify-install-smoke.sh src/lib/lines.ts src/lib/panel-releases.json nginx/panel.nexlify.live-http-only.conf; do
  if ! grep -qF "$f" < <(tar -tzf "$OUT"); then
    missing="${missing}\n  - ${f}"
  fi
done
if [ -n "$missing" ]; then
  echo "ERROR: tarball missing required files:${missing}" >&2
  exit 1
fi
echo "Tarball verify OK"
BUILDEOF
  chmod +x "$PANEL/scripts/build-panel-download.sh"
  echo "   replaced build-panel-download.sh"
fi

[ -f "$PANEL/.env.example" ] || die ".env.example missing in $PANEL — WinSCP upload .env.example from repo"

chmod +x "$PANEL/scripts/"*.sh 2>/dev/null || true
sed -i 's/\r$//' "$PANEL/scripts/"*.sh 2>/dev/null || true

if [ -f "$PANEL/scripts/publish-panel-release.sh" ] && \
   ! grep -q 'SKIP_INSTALL_SCRIPT_PUBLISH' "$PANEL/scripts/publish-panel-release.sh" 2>/dev/null; then
  sed -i '/^cp -f "\$TAR" "\$DEST"$/a\
\
if [ "${SKIP_INSTALL_SCRIPT_PUBLISH:-0}" = "1" ]; then\
  echo "Skipping installer script publish (SKIP_INSTALL_SCRIPT_PUBLISH=1)"\
  echo "Published:"\
  echo "  $DEST ($(du -h "$DEST" | cut -f1))"\
  exit 0\
fi' "$PANEL/scripts/publish-panel-release.sh"
  echo "   patched publish (SKIP_INSTALL_SCRIPT_PUBLISH)"
fi

fix_panel_sh() {
  local fixed=0 src
  for src in \
    "$PANEL/scripts/install-linux.sh" \
    "$MARKETING/scripts/install-linux.sh" \
    "$INSTALL/panel.sh.new"; do
    if installer_ok "$src"; then
      cp -f "$src" "$INSTALL/panel.sh"
      fixed=1
      echo "   panel.sh from $src"
      break
    fi
  done

  if [ "$fixed" = "0" ] && fetch "$GITHUB/marketing-drop-in/public/install/panel.sh" "$INSTALL/panel.sh"; then
    installer_ok "$INSTALL/panel.sh" && fixed=1 && echo "   panel.sh from GitHub"
  fi

  if [ "$fixed" = "0" ]; then
    echo "   in-place patch..."
    cp -a "$INSTALL/panel.sh" "${INSTALL}/panel.sh.bak.$(date +%s)" 2>/dev/null || true
    export PANEL_VER
    python3 << 'PY'
from pathlib import Path
import re, sys, os
path = Path("/var/www/nexlify/public/install/panel.sh")
text = path.read_text()
if 'detect_server_address' in text:
    print("already patched"); sys.exit(0)
detect_fn = '''
detect_server_address() {
  local ip
  if command -v curl >/dev/null 2>&1; then
    for url in "https://api.ipify.org" "https://ifconfig.me/ip" "https://icanhazip.com"; do
      ip="$(curl -fsSL --max-time 8 "$url" 2>/dev/null | tr -d '[:space:]' || true)"
      if [[ "$ip" =~ ^[0-9]+\\.[0-9]+\\.[0-9]+\\.[0-9]+$ ]]; then echo "$ip"; return 0; fi
    done
  fi
  ip="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
  if [[ "$ip" =~ ^[0-9]+\\.[0-9]+\\.[0-9]+\\.[0-9]+$ ]]; then echo "$ip"; return 0; fi
  echo "localhost"
}
if [ -z "$DOMAIN" ]; then
  log "Detecting server address..."
  DOMAIN="$(detect_server_address)"
  log "Using server address: $DOMAIN"
fi
'''
text = re.sub(r'\[ -n "\$DOMAIN" \] \|\|[^\n]*\n', '', text)
text = re.sub(r'^\s*echo "FATAL: --domain is required[^\n]*\n\s*exit 1\s*\n', '', text, flags=re.MULTILINE)
m = re.search(r'die\(\).*?\n', text)
if not m: sys.exit("no die() anchor")
text = text[:m.end()] + detect_fn + text[m.end():]
text = text.replace('--domain)', '--ip|--domain)', 1)
ver = os.environ.get('PANEL_VER', '1.9.7')
text = re.sub(r"panel\.sh\?v=[^\']+", f"panel.sh?v={ver}", text)
text = text.replace('--domain YOUR_SERVER_IP', 'sudo bash')
path.write_text(text)
print("patched")
PY
  fi

  sed -i "s|panel\.sh?v=[^'\"]*|panel.sh?v=${PANEL_VER}|g" "$INSTALL/panel.sh" 2>/dev/null || true
  sed -i "s/PANEL_CACHE_BUST=\"\${PANEL_CACHE_BUST:-v[^\"]*}\"/PANEL_CACHE_BUST=\"\${PANEL_CACHE_BUST:-v${PANEL_VER}}\"/" \
    "$INSTALL/panel.sh" 2>/dev/null || true
  chmod +x "$INSTALL/panel.sh"
  bash -n "$INSTALL/panel.sh"
  [ -f "$PANEL/scripts/panel-version.sh" ] && cp -f "$PANEL/scripts/panel-version.sh" "$INSTALL/scripts/"
}

# ── 2) Rebuild tarball ──
log "Rebuilding panel tarball..."
cd "$PANEL"
SKIP_INSTALL_SCRIPT_PUBLISH=1 bash scripts/publish-panel-release.sh

# ── 3) Fix panel.sh (publish may have overwritten it) ──
log "Fixing live panel.sh..."
fix_panel_sh

# ── 4) Verify ──
log "Verifying..."
FAIL=0
installer_ok "$INSTALL/panel.sh" && echo "OK: panel.sh auto-detect (v${PANEL_VER})" || { echo "FAIL: panel.sh"; FAIL=1; }
tar -tzf "$TAR" 2>/dev/null | grep -qF './.env.example' && echo "OK: tarball has .env.example" || { echo "FAIL: tarball missing .env.example"; FAIL=1; }

echo ""
echo "Install: curl -fsSL 'https://nexlify.live/install/panel.sh?v=${PANEL_VER}' | sudo bash"
echo ""
head -8 "$INSTALL/panel.sh"
[ "$FAIL" -eq 0 ] || die "Checks failed — WinSCP upload .env.example + scripts from repo, then re-run"
echo ""
echo "All checks passed."
