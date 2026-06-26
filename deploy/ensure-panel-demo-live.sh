#!/bin/bash
# panel.demo.nexlify.live — live IPTV panel sandbox (read-only, no live playback)
set -euo pipefail

APP_DIR="/var/www/nexlify"
PANEL_DIR="${PANEL_DIR:-/home/nexlify-panel}"
DEMO_DOMAIN="panel.demo.nexlify.live"
DEMO_CONF="/etc/nginx/sites-available/panel.demo.nexlify.live"
DEMO_CERT="/etc/letsencrypt/live/$DEMO_DOMAIN/fullchain.pem"
PATCH_DIR="$APP_DIR/deploy/panel-demo"

echo "=== ensure-panel-demo-live ($DEMO_DOMAIN) ==="

if [ ! -d "$PANEL_DIR/src/lib" ]; then
  echo "WARN: panel not found at $PANEL_DIR — skipping demo panel patch"
else
  cp "$PATCH_DIR/panel-demo-host.ts" "$PANEL_DIR/src/lib/panel-demo-host.ts"
  cp "$PATCH_DIR/panel-demo-mode.ts" "$PANEL_DIR/src/lib/panel-demo-mode.ts"

  MW="$PANEL_DIR/src/middleware.ts"
  if [ -f "$MW" ]; then
    if ! grep -q 'panel-demo-mode' "$MW"; then
      python3 <<'PY'
from pathlib import Path

path = Path("/home/nexlify-panel/src/middleware.ts")
text = path.read_text(encoding="utf-8")

old_import = """import {
  isPanelDemoRedirectHost,
  isPanelLicenseExempt,
  PANEL_CANONICAL_HOST,
} from "@/lib/panel-demo-host";"""

new_import = """import { isPanelLicenseExempt } from "@/lib/panel-demo-host";
import {
  isPanelDemoHost,
  isDemoPlaybackPath,
  isDemoMutationAllowed,
  demoModeBlockedResponse,
} from "@/lib/panel-demo-mode";"""

old_block = """  if (isPanelDemoRedirectHost(host)) {
    const target = new URL(req.nextUrl.pathname + req.nextUrl.search, `https://${PANEL_CANONICAL_HOST}`);
    return NextResponse.redirect(target, 308);
  }"""

new_block = """  if (isPanelDemoHost(host)) {
    if (isDemoPlaybackPath(pathname)) {
      return demoModeBlockedResponse("playback");
    }
    if (!isDemoMutationAllowed(pathname, req.method)) {
      return demoModeBlockedResponse("mutation");
    }
  }"""

if old_import not in text and "panel-demo-mode" not in text:
    raise SystemExit("middleware import block not found — patch manually")
if old_import in text:
    text = text.replace(old_import, new_import)
if old_block in text:
    text = text.replace(old_block, new_block)
path.write_text(text, encoding="utf-8")
print("middleware patched")
PY
    else
      echo "middleware already patched for demo mode"
    fi
  fi

  touch "$PANEL_DIR/.env"
  set_kv() {
    local k="$1" v="$2"
    grep -q "^${k}=" "$PANEL_DIR/.env" 2>/dev/null && sed -i "s|^${k}=.*|${k}=${v}|" "$PANEL_DIR/.env" || echo "${k}=${v}" >> "$PANEL_DIR/.env"
  }
  # Demo license skip is host-based (panel.demo.nexlify.live) — do not set global skip flags.
  sed -i '/^PANEL_DEMO_NO_LICENSE=/d;/^NEXLIFY_LICENSE_SKIP=/d' "$PANEL_DIR/.env" 2>/dev/null || true
  set_kv PANEL_EXTRA_DOMAINS "$DEMO_DOMAIN"

  echo "Rebuilding panel for demo mode..."
  cd "$PANEL_DIR"
  npm run build
  REBUILD=0 bash "$APP_DIR/deploy/pm2-ensure-panel.sh" 2>/dev/null || pm2 restart nexlify --update-env
  pm2 save
fi

command -v nginx >/dev/null || { echo "nginx missing"; exit 1; }

if [ ! -f "$DEMO_CERT" ]; then
  echo "Requesting certificate for $DEMO_DOMAIN..."
  command -v certbot >/dev/null || apt-get install -y certbot python3-certbot-nginx
  cat > "$DEMO_CONF" <<'NGINX'
server {
    listen 80;
    listen [::]:80;
    server_name panel.demo.nexlify.live;
    location /.well-known/acme-challenge/ { root /var/www/html; }
    location / { return 502; }
}
NGINX
  ln -sf "$DEMO_CONF" /etc/nginx/sites-enabled/panel.demo.nexlify.live
  nginx -t && systemctl reload nginx
  certbot certonly --nginx -d "$DEMO_DOMAIN" \
    --non-interactive --agree-tos --register-unsafely-without-email || \
  certbot --nginx -d "$DEMO_DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email
fi

if [ ! -f "$DEMO_CERT" ]; then
  echo "FAIL: no cert at $DEMO_CERT"
  exit 1
fi

cp "$APP_DIR/deploy/nginx-panel.demo.nexlify.live.conf" "$DEMO_CONF"
ln -sf "$DEMO_CONF" /etc/nginx/sites-enabled/panel.demo.nexlify.live
nginx -t
systemctl reload nginx

echo "Demo panel health:"
curl -sI --max-time 8 "https://127.0.0.1/login" -k -H "Host: $DEMO_DOMAIN" | grep -iE 'HTTP/|location:' || true
echo "ensure-panel-demo-live done."
