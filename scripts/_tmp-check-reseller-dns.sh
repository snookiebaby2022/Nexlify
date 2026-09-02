#!/bin/bash
set -eo pipefail
cd /opt/nexlify-panel
PORT="$(grep -E '^PORT=' .env | head -1 | cut -d= -f2- | tr -d '"' || true)"
PORT="${PORT:-13000}"
PANEL_PRIMARY_DOMAIN="$(grep -E '^PANEL_PRIMARY_DOMAIN=' .env | head -1 | cut -d= -f2- | tr -d '"')"
PANEL_EXTRA_DOMAINS="$(grep -E '^PANEL_EXTRA_DOMAINS=' .env | head -1 | cut -d= -f2- | tr -d '"')"

echo "=== RESELLER DNS ROWS ==="
node <<'NODE'
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
p.panelUser
  .findMany({
    where: { resellerDns: { not: null } },
    select: { username: true, role: true, resellerDns: true },
    take: 15,
  })
  .then((rows) => {
    for (const r of rows) {
      if (!r.resellerDns?.trim()) continue;
      console.log(`${r.username}|${r.role}|${r.resellerDns}`);
    }
    return p.$disconnect();
  })
  .catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
NODE

echo "=== DOMAIN ENV ==="
echo "PANEL_PRIMARY_DOMAIN=${PANEL_PRIMARY_DOMAIN:-}"
echo "PANEL_EXTRA_DOMAINS=${PANEL_EXTRA_DOMAINS:-}"

echo "=== RESELLER LOGIN (primary host) ==="
code=$(curl -sS -o /tmp/reseller-login.json -w '%{http_code}' --max-time 8 \
  -H 'Content-Type: application/json' \
  -H "Host: ${PANEL_PRIMARY_DOMAIN:-localhost}" \
  -d '{"username":"reseller","password":"reseller123"}' \
  "http://127.0.0.1:${PORT}/api/auth/login" || echo 000)
echo "HTTP $code body=$(head -c 200 /tmp/reseller-login.json 2>/dev/null || true)"

first_dns=$(node <<'NODE'
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
p.panelUser
  .findFirst({
    where: { resellerDns: { not: null } },
    select: { resellerDns: true },
    orderBy: { updatedAt: "desc" },
  })
  .then((r) => {
    const d = r?.resellerDns?.trim();
    if (d) process.stdout.write(d);
    return p.$disconnect();
  })
  .catch(() => process.exit(0));
NODE
)

if [ -n "$first_dns" ]; then
  echo "=== RESELLER LOGIN (branded host $first_dns) ==="
  in_extra=0
  case ",${PANEL_EXTRA_DOMAINS}," in
    *,"$first_dns",*) in_extra=1 ;;
  esac
  echo "in PANEL_EXTRA_DOMAINS=$in_extra"
  code2=$(curl -sS -o /tmp/reseller-login-branded.json -w '%{http_code}' --max-time 8 \
    -H 'Content-Type: application/json' \
    -H "Host: $first_dns" \
    -d '{"username":"reseller","password":"reseller123"}' \
    "http://127.0.0.1:${PORT}/api/auth/login" || echo 000)
  echo "HTTP $code2 body=$(head -c 200 /tmp/reseller-login-branded.json 2>/dev/null || true)"
  page=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 8 -H "Host: $first_dns" "http://127.0.0.1:${PORT}/login" || echo 000)
  echo "GET /login HTTP $page"
  redir=$(curl -sS -o /dev/null -w '%{http_code} %{redirect_url}' --max-time 8 -H "Host: $first_dns" "http://127.0.0.1:${PORT}/" || echo 000)
  echo "GET / redirect: $redir"
else
  echo "No resellerDns rows — skipping branded host test"
fi

extra=$(echo "${PANEL_EXTRA_DOMAINS:-}" | cut -d, -f1 | tr -d ' ')
if [ -n "$extra" ]; then
  echo "=== LOGIN PAGE (extra domain $extra) ==="
  page=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 8 -H "Host: $extra" "http://127.0.0.1:${PORT}/login" || echo 000)
  echo "GET /login HTTP $page"
  redir=$(curl -sS -o /dev/null -w '%{http_code} %{redirect_url}' --max-time 8 -H "Host: $extra" "http://127.0.0.1:${PORT}/" || echo 000)
  echo "GET / redirect: $redir"
fi
