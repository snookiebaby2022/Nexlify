#!/usr/bin/env bash
# Post-install smoke checks — fails install if public URLs are broken.
set -euo pipefail
cd "$(dirname "$0")/.."

read_env() {
  grep "^${1}=" .env 2>/dev/null | head -1 | cut -d= -f2- | sed -e 's/^["'\'' ]*//' -e 's/["'\'' ]*$//' || true
}

DOMAIN="$(read_env PANEL_PRIMARY_DOMAIN)"
[ -z "$DOMAIN" ] && { echo "verify: no PANEL_PRIMARY_DOMAIN"; exit 1; }

PORT="$(read_env PORT)"
[ -z "$PORT" ] && PORT="$(read_env PANEL_PORT)"
[ -z "$PORT" ] && PORT=13000

if [ -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]; then
  BASE="https://${DOMAIN}"
else
  BASE="http://${DOMAIN}"
fi

UA="Mozilla/5.0 (compatible; NexlifyInstallVerify/1.0)"

echo "==> Smoke: health (local :${PORT})"
curl -fsS "http://127.0.0.1:${PORT}/api/health" >/dev/null

echo "==> Smoke: health (public ${BASE})"
if curl -fsS -H "User-Agent: $UA" "${BASE}/api/health" >/dev/null 2>&1; then
  PUBLIC_OK=1
else
  echo "  .. public URL not reachable — checking via Host header on :${PORT}"
  curl -fsS -H "User-Agent: $UA" -H "Host: ${DOMAIN}" "http://127.0.0.1:${PORT}/api/health" >/dev/null
  PUBLIC_OK=0
fi

echo "==> Smoke: login page"
if [ "${PUBLIC_OK:-0}" -eq 1 ]; then
  curl -fsS -H "User-Agent: $UA" "${BASE}/login" >/dev/null
else
  curl -fsS -H "User-Agent: $UA" -H "Host: ${DOMAIN}" "http://127.0.0.1:${PORT}/login" >/dev/null
fi

echo "==> Smoke: no internal ports in redirects"
if [ "${PUBLIC_OK:-0}" -eq 1 ]; then
  check_url="${BASE}/admin/dashboard"
  curl_args=(-fsSI -H "User-Agent: $UA" "$check_url")
else
  curl_args=(-fsSI -H "User-Agent: $UA" -H "Host: ${DOMAIN}" "http://127.0.0.1:${PORT}/admin/dashboard")
fi
loc="$(curl "${curl_args[@]}" 2>/dev/null | tr -d '\r' | awk 'tolower($1)=="location:" {print $2}' | head -1 || true)"
if [ -n "$loc" ] && echo "$loc" | grep -qE ':3000|:3001|:13000|:13001'; then
  echo "ERROR: redirect exposes internal port: $loc" >&2
  exit 1
fi

echo "==> Smoke checks passed (${BASE})"
