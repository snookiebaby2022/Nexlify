#!/usr/bin/env bash
# Cloudflare blocks customer VPS curl (403 bot challenge) on /downloads/ and /install/.
# Run on vendor VPS as root AFTER vps-fix-everything.
#
# Usage:
#   bash scripts/vps-fix-cloudflare-downloads.sh
# Optional API auto-fix:
#   export CF_API_TOKEN=... CF_ZONE_ID=...   # Zone → Overview → Zone ID; token: Zone WAF Edit
#   bash scripts/vps-fix-cloudflare-downloads.sh --apply
set -euo pipefail

MARKETING="${MARKETING_DIR:-/var/www/nexlify}"
APPLY=0
[ "${1:-}" = "--apply" ] && APPLY=1

test_public() {
  local label="$1" url="$2"
  local code
  code="$(curl -fsS -o /dev/null -w '%{http_code}' -A 'NexlifyPanelUpdater/1.0' "$url" 2>/dev/null || echo 000)"
  if [ "$code" = "200" ]; then
    echo "OK  $label (HTTP $code)"
    return 0
  fi
  echo "FAIL $label (HTTP $code) — $url"
  return 1
}

echo "=========================================="
echo " Cloudflare / public download check"
echo "=========================================="

fail=0
test_public "tarball" "https://nexlify.live/downloads/nexlify-panel.tar.gz" || fail=1
test_public "release feed" "https://nexlify.live/api/panel-releases" || fail=1
test_public "hotfix script" "https://nexlify.live/install/scripts/fix-update-worker-now.sh" || fail=1

if [ "$fail" -eq 0 ]; then
  echo ""
  echo "Public URLs OK — customers can download updates."
  exit 0
fi

echo ""
echo "Cloudflare is blocking VPS/curl downloads (HTTP 403)."
echo "Localhost/nginx tests can pass while the PUBLIC internet gets bot challenges."
echo ""

# Write origin bypass file for customer panels (direct IP + Host header)
ORIGIN_ENV="$MARKETING/public/install/panel-vendor-origin.env"
PUBLIC_IP="${PANEL_VENDOR_IP:-$(curl -fsS --max-time 5 https://api.ipify.org 2>/dev/null || true)}"
if [ -z "$PUBLIC_IP" ]; then
  PUBLIC_IP="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src") print $(i+1)}' | head -1)"
fi
if [ -n "$PUBLIC_IP" ]; then
  mkdir -p "$(dirname "$ORIGIN_ENV")"
  cat > "$ORIGIN_ENV" << EOF
# Bypass Cloudflare bot fight — used by apply-panel-fast-update.sh on customer VPS
PANEL_VENDOR_IP=${PUBLIC_IP}
PANEL_VENDOR_HOST=nexlify.live
EOF
  chmod 644 "$ORIGIN_ENV"
  echo "Wrote $ORIGIN_ENV (PANEL_VENDOR_IP=$PUBLIC_IP)"
fi

if [ "$APPLY" -eq 1 ] && [ -n "${CF_API_TOKEN:-}" ] && [ -n "${CF_ZONE_ID:-}" ]; then
  echo "-> Applying Cloudflare WAF skip rule via API ..."
  RULE_EXPR='(http.request.uri.path contains "/downloads/") or (http.request.uri.path contains "/install/") or (http.request.uri.path eq "/api/panel-releases")'
  payload="$(node -e "
    const expr = process.argv[1];
    console.log(JSON.stringify({
      description: 'Nexlify panel updates — skip bot fight for downloads/install',
      rules: [{
        description: 'Allow panel updater curl',
        expression: expr,
        action: 'skip',
        action_parameters: { phases: ['http_request_sbfm', 'http_request_firewall'] }
      }]
    }));
  " "$RULE_EXPR")"
  if curl -fsS -X PUT \
    "https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/rulesets/phases/http_request_firewall_custom/entrypoint" \
    -H "Authorization: Bearer ${CF_API_TOKEN}" \
    -H "Content-Type: application/json" \
    --data "$payload" >/tmp/cf-ruleset.json 2>&1; then
    echo "Cloudflare WAF skip rule applied."
    sleep 5
    fail=0
    test_public "tarball (after CF)" "https://nexlify.live/downloads/nexlify-panel.tar.gz" || fail=1
    [ "$fail" -eq 0 ] && exit 0
  else
    echo "WARN: Cloudflare API call failed — configure manually in dashboard:"
    cat /tmp/cf-ruleset.json 2>/dev/null || true
  fi
fi

cat <<'EOF'

FIX IN CLOUDFLARE DASHBOARD (required for customer updates):

1. Log in → nexlify.live zone → Security → WAF (or Security rules)
2. Create rule → Custom rule → Skip
3. Name: "Panel updates — allow downloads"
4. Expression (Edit expression):
     (http.request.uri.path contains "/downloads/")
     or (http.request.uri.path contains "/install/")
     or (http.request.uri.path eq "/api/panel-releases")
5. Choose action: Skip → select "Bot Fight Mode" and "Super Bot Fight Mode" (all skip options)
6. Deploy

OR use Configuration Rule:
   Security → Settings → Bot Fight Mode → Configure exceptions for paths above

Also purge cache: Caching → Purge Everything (after deploy)

Re-test:
  curl -fsSI https://nexlify.live/downloads/nexlify-panel.tar.gz | head -3
  (must show HTTP/2 200, NOT 403)

Customer panels auto-fallback to direct IP if Cloudflare still blocks:
  https://nexlify.live/install/panel-vendor-origin.env
EOF

exit 1
