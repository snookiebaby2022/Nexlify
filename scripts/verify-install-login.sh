#!/usr/bin/env bash
# Post-install: admin credentials from install must log in via the panel API.
set -euo pipefail
cd "$(dirname "$0")/.."

read_env() {
  grep "^${1}=" .env 2>/dev/null | head -1 | cut -d= -f2- | sed -e 's/^["'\'' ]*//' -e 's/["'\'' ]*$//' || true
}

PASS="${ADMIN_PASS:-$(read_env INSTALL_ADMIN_PASSWORD)}"
if [ -z "$PASS" ] && [ -f /root/nexlify/install-credentials ]; then
  PASS="$(grep '^admin_password=' /root/nexlify/install-credentials | head -1 | cut -d= -f2- || true)"
fi

PORT="$(read_env PORT)"
[ -z "$PORT" ] && PORT="$(read_env PANEL_PORT)"
[ -z "$PORT" ] && PORT=13000

DOMAIN="$(read_env PANEL_PRIMARY_DOMAIN)"
[ -n "$PASS" ] || { echo "verify-login: no admin password"; exit 1; }
[ -n "$DOMAIN" ] || { echo "verify-login: no PANEL_PRIMARY_DOMAIN"; exit 1; }

UA="Mozilla/5.0 (compatible; NexlifyInstallVerify/1.0)"
JAR="$(mktemp)"
trap 'rm -f "$JAR"' EXIT

json_pass="$(node -e "process.stdout.write(JSON.stringify(process.argv[1]))" "$PASS")"

# Wait for panel health before attempting login
echo "==> Smoke: waiting for panel health (port ${PORT})"
health_ok=0
for i in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1; then
    health_ok=1
    break
  fi
  echo "  ($i/30) panel not ready yet..."
  sleep 2
done
if [ "$health_ok" -ne 1 ]; then
  echo "ERROR: panel health check failed after 60s on port ${PORT}" >&2
  exit 1
fi

echo "==> Smoke: admin login API (port ${PORT})"
login_ok=0
body=""
for i in $(seq 1 5); do
  body="$(curl -fsS -c "$JAR" -b "$JAR" \
    -X POST "http://127.0.0.1:${PORT}/api/auth/login" \
    -H "Content-Type: application/json" \
    -H "User-Agent: $UA" \
    -H "Host: ${DOMAIN}" \
    -d "{\"username\":\"admin\",\"password\":${json_pass}}" 2>&1)" && {
    if echo "$body" | grep -q '"ok":true'; then
      login_ok=1
      break
    fi
  }
  echo "  ($i/5) login attempt failed: $body"
  sleep 2
done

if [ "$login_ok" -ne 1 ]; then
  echo "ERROR: admin login failed: $body" >&2
  exit 1
fi

echo "==> Smoke: session cookie present"
grep -q nexlify_session "$JAR" || {
  echo "ERROR: login API did not set nexlify_session cookie" >&2
  exit 1
}

echo "==> Smoke: authenticated dashboard reachable"
code="$(curl -sS -o /dev/null -w '%{http_code}' -b "$JAR" \
  -H "User-Agent: $UA" \
  -H "Host: ${DOMAIN}" \
  "http://127.0.0.1:${PORT}/admin/dashboard")"

if [ "$code" != "200" ] && [ "$code" != "307" ] && [ "$code" != "308" ]; then
  echo "ERROR: /admin/dashboard returned HTTP $code (expected session or license redirect)" >&2
  exit 1
fi

echo "==> Admin login verified"
