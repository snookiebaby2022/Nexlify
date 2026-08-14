#!/usr/bin/env bash
# Fix panel + marketing login 500s on vendor VPS (85.17.162.54).
# Typical causes: missing JWT_SECRET, corrupt admin hash, demo hosts mis-set,
# license cookie throw during login.
#
# Run as root on the vendor server:
#   curl -fsSL 'https://raw.githubusercontent.com/snookiebaby2022/Nexlify/main/scripts/fix-vendor-login-500.sh' | sudo bash
# Or:
#   sudo bash /home/nexlify-panel/scripts/fix-vendor-login-500.sh
#   sudo bash /opt/nexlify-panel/scripts/fix-vendor-login-500.sh
set -euo pipefail

if [ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null 2>&1; then
  exec sudo -E bash "$0" "$@"
fi

PANEL=""
for d in /home/nexlify /home/nexlify-panel /opt/nexlify-panel; do
  [ -f "$d/package.json" ] || continue
  grep -q '"name": "nexlify"' "$d/package.json" 2>/dev/null || continue
  grep -q '"name": "nexlify-marketing"' "$d/package.json" 2>/dev/null && continue
  PANEL="$d"
  break
done
MARKETING=""
for d in /var/www/nexlify /opt/nexlify-web /home/nexlify; do
  [ -f "$d/package.json" ] || continue
  [ "$d" = "$PANEL" ] && continue
  MARKETING="$d"
  break
done

if [ -z "$PANEL" ]; then
  echo "ERROR: panel not found at /home/nexlify, /home/nexlify-panel, or /opt/nexlify-panel" >&2
  exit 1
fi

echo "=========================================="
echo " Fix vendor login 500s"
echo " Panel:     $PANEL"
echo " Marketing: ${MARKETING:-"(not found)"}"
echo "=========================================="

set_kv() {
  local file="$1" k="$2" v="$3"
  touch "$file"
  if grep -q "^${k}=" "$file" 2>/dev/null; then
    sed -i "s|^${k}=.*|${k}=${v}|" "$file"
  else
    echo "${k}=${v}" >> "$file"
  fi
}

read_env() {
  local file="$1" k="$2"
  grep "^${k}=" "$file" 2>/dev/null | head -1 | cut -d= -f2- | sed -e 's/^["'\'' ]*//' -e 's/["'\'' ]*$//' || true
}

ensure_jwt() {
  local file="$1" label="$2"
  local jwt
  jwt="$(read_env "$file" JWT_SECRET)"
  if [ -z "$jwt" ] || [ "$jwt" = "dev-secret-change-me" ] || [ "${#jwt}" -lt 32 ]; then
    jwt="$(openssl rand -hex 32)"
    set_kv "$file" JWT_SECRET "$jwt"
    echo "   [$label] set new JWT_SECRET (${#jwt} chars)"
  else
    echo "   [$label] JWT_SECRET OK (${#jwt} chars)"
  fi
}

# --- Panel ---
cd "$PANEL"
echo "==> 1) Panel git sync (optional) ..."
if [ -d .git ]; then
  git fetch origin main 2>/dev/null || true
  git reset --hard origin/main 2>/dev/null || true
fi

echo "==> 2) Panel .env JWT + demo hosts ..."
touch .env
sed -i 's/\r$//' .env 2>/dev/null || true
ensure_jwt .env panel
set_kv .env PANEL_PRIMARY_DOMAIN "panel.nexlify.live"
set_kv .env PANEL_DEMO_HOSTS "panel.demo.nexlify.live,panel.nexlify.live"
set_kv .env PANEL_LICENSE_EXEMPT_HOSTS "panel.nexlify.live,panel.demo.nexlify.live,127.0.0.1,localhost"
set_kv .env PANEL_BEHIND_NGINX "1"
set_kv .env PANEL_ASSUME_PROXY_SSL "1"
set_kv .env PANEL_TRUST_CLOUDFLARE "1"
set_kv .env NEXT_PUBLIC_SERVER_URL "https://panel.nexlify.live"
set_kv .env NEXT_PUBLIC_WEBSITE_URL "https://panel.nexlify.live"
# Demo credentials (docs / TikTok ads)
set_kv .env INSTALL_ADMIN_PASSWORD "admin123"
set_kv .env DEMO_ADMIN_PASSWORD "admin123"

if [ -x scripts/ensure-panel-env.sh ]; then
  bash scripts/ensure-panel-env.sh || true
fi

echo "==> 3) Prisma generate + push ..."
unset DATABASE_URL 2>/dev/null || true
export DATABASE_URL="$(read_env .env DATABASE_URL)"
npx prisma generate 2>&1 | tail -3 || true
npx prisma db push --accept-data-loss 2>&1 | tail -5 || true

echo "==> 4) Reset demo admin + reseller passwords ..."
node - <<'NODE' || true
const bcrypt = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
(async () => {
  const adminHash = await bcrypt.hash("admin123", 10);
  const resellerHash = await bcrypt.hash("reseller123", 10);
  const admin = await prisma.panelUser.upsert({
    where: { username: "admin" },
    update: { passwordHash: adminHash, isActive: true, role: "ADMIN", totpEnabled: false },
    create: {
      username: "admin",
      passwordHash: adminHash,
      role: "ADMIN",
      isActive: true,
      credits: 999999,
      accessCode: "adminapi",
    },
  });
  await prisma.panelUser.upsert({
    where: { username: "reseller" },
    update: {
      passwordHash: resellerHash,
      isActive: true,
      role: "RESELLER",
      totpEnabled: false,
      parentId: admin.id,
    },
    create: {
      username: "reseller",
      passwordHash: resellerHash,
      role: "RESELLER",
      isActive: true,
      credits: 10000,
      accessCode: "resellerapi",
      parentId: admin.id,
    },
  });
  console.log("   admin/admin123 + reseller/reseller123 ready");
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error("   password reset failed:", e.message);
  try { await prisma.$disconnect(); } catch {}
  process.exit(0);
});
NODE

echo "==> 5) Restart panel PM2 ..."
pm2 restart nexlify --update-env 2>/dev/null || pm2 restart all --update-env 2>/dev/null || true
pm2 save 2>/dev/null || true

# --- Marketing ---
if [ -n "$MARKETING" ]; then
  echo "==> 6) Marketing JWT + admin ..."
  cd "$MARKETING"
  touch .env
  sed -i 's/\r$//' .env 2>/dev/null || true
  # Prefer sharing panel JWT so cookies stay compatible if needed
  PANEL_JWT="$(read_env "$PANEL/.env" JWT_SECRET)"
  MKT_JWT="$(read_env .env JWT_SECRET)"
  if [ -z "$MKT_JWT" ] || [ "$MKT_JWT" = "dev-secret-change-me" ] || [ "${#MKT_JWT}" -lt 32 ]; then
    if [ -n "$PANEL_JWT" ] && [ "${#PANEL_JWT}" -ge 32 ]; then
      set_kv .env JWT_SECRET "$PANEL_JWT"
      echo "   [marketing] copied JWT_SECRET from panel"
    else
      ensure_jwt .env marketing
    fi
  else
    echo "   [marketing] JWT_SECRET OK (${#MKT_JWT} chars)"
  fi
  set_kv .env ADMIN_EMAIL "admin@nexlify.live"
  set_kv .env ADMIN_PASSWORD "admin123"
  set_kv .env NEXT_PUBLIC_WEBSITE_URL "https://nexlify.live"

  if [ -f "$PANEL/scripts/sync-marketing-admin.cjs" ]; then
    node "$PANEL/scripts/sync-marketing-admin.cjs" 2>/dev/null || true
  elif [ -f scripts/sync-marketing-admin.cjs ]; then
    node scripts/sync-marketing-admin.cjs 2>/dev/null || true
  else
    # Inline marketing admin upsert when possible
    node - <<'NODE' 2>/dev/null || true
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
try {
  require("dotenv").config({ path: path.join(process.cwd(), ".env") });
} catch {}
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
(async () => {
  const email = (process.env.ADMIN_EMAIL || "admin@nexlify.live").trim().toLowerCase();
  const pass = process.env.ADMIN_PASSWORD || "admin123";
  const hash = await bcrypt.hash(pass, 12);
  await prisma.user.upsert({
    where: { email },
    update: { passwordHash: hash, role: "ADMIN" },
    create: { email, name: "Admin", passwordHash: hash, role: "ADMIN" },
  });
  console.log("   marketing admin ready:", email);
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error("   marketing admin sync skipped:", e.message);
  try { await prisma.$disconnect(); } catch {}
});
NODE
  fi

  pm2 restart nexlify-web --update-env 2>/dev/null || pm2 restart nexlify-website --update-env 2>/dev/null || true
  pm2 save 2>/dev/null || true
fi

echo "==> 7) Local login smoke tests ..."
sleep 2
PANEL_PORT="$(read_env "$PANEL/.env" PORT)"
[ -z "$PANEL_PORT" ] && PANEL_PORT="$(read_env "$PANEL/.env" PANEL_PORT)"
[ -z "$PANEL_PORT" ] && PANEL_PORT=13000

panel_login="$(curl -sS -o /tmp/panel-login.json -w '%{http_code}' --max-time 8 \
  -H 'Content-Type: application/json' -H 'Host: panel.nexlify.live' \
  -d '{"username":"admin","password":"admin123"}' \
  "http://127.0.0.1:${PANEL_PORT}/api/auth/login" 2>/dev/null || echo 000)"
echo "   panel admin login HTTP $panel_login body=$(head -c 160 /tmp/panel-login.json 2>/dev/null || true)"

reseller_login="$(curl -sS -o /tmp/reseller-login.json -w '%{http_code}' --max-time 8 \
  -H 'Content-Type: application/json' -H 'Host: panel.nexlify.live' \
  -d '{"username":"reseller","password":"reseller123"}' \
  "http://127.0.0.1:${PANEL_PORT}/api/auth/login" 2>/dev/null || echo 000)"
echo "   panel reseller login HTTP $reseller_login body=$(head -c 160 /tmp/reseller-login.json 2>/dev/null || true)"

if [ -n "$MARKETING" ]; then
  MPORT="$(read_env "$MARKETING/.env" PORT)"
  [ -z "$MPORT" ] && MPORT=13001
  mkt_login="$(curl -sS -o /tmp/mkt-login.json -w '%{http_code}' --max-time 8 \
    -H 'Content-Type: application/json' -H 'Host: nexlify.live' \
    -d '{"email":"admin@nexlify.live","password":"admin123"}' \
    "http://127.0.0.1:${MPORT}/api/auth/login" 2>/dev/null || echo 000)"
  echo "   marketing admin login HTTP $mkt_login body=$(head -c 160 /tmp/mkt-login.json 2>/dev/null || true)"
fi

echo ""
echo "=========================================="
echo " Done. Public checks:"
echo "   curl -sk -H 'Host: panel.nexlify.live' -H 'Content-Type: application/json' \\"
echo "     -d '{\"username\":\"admin\",\"password\":\"admin123\"}' \\"
echo "     https://127.0.0.1/api/auth/login"
echo " Demo logins: admin/admin123  ·  reseller/reseller123"
echo " Marketing:   admin@nexlify.live / admin123"
echo "=========================================="

# If panel still on old build without hardened login, rebuild quickly when source has the fix
if [ -f "$PANEL/src/app/api/auth/login/route.ts" ] && grep -q 'fix-vendor-login-500' "$PANEL/src/app/api/auth/login/route.ts" 2>/dev/null; then
  if ! echo "$panel_login" | grep -qE '^(200|401|503)$' || [ "$panel_login" = "500" ]; then
    echo "==> 8) Hardened login present but still failing — rebuild panel ..."
    cd "$PANEL"
    export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=4096}"
    npm run build 2>&1 | tail -20 || true
    bash scripts/prepare-standalone.sh 2>/dev/null || true
    pm2 restart nexlify --update-env 2>/dev/null || true
  fi
fi
