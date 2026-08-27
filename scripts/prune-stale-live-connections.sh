#!/usr/bin/env bash
# Drop orphaned LiveConnection rows so maxConnections slots free up after crashes/restarts.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

THRESHOLD_SEC="${NEXLIFY_CONN_STALE_SEC:-90}"
export THRESHOLD_SEC

if command -v node >/dev/null 2>&1 && [ -d node_modules/@prisma/client ]; then
  node -e '
const { PrismaClient } = require("@prisma/client");
const sec = Number(process.env.THRESHOLD_SEC || "90");
const before = new Date(Date.now() - sec * 1000);
const prisma = new PrismaClient();
prisma.liveConnection.deleteMany({ where: { lastSeenAt: { lt: before } } })
  .then((r) => {
    if (r.count) console.log("[prune-connections] removed " + r.count + " stale row(s) older than " + sec + "s");
    return prisma.$disconnect();
  })
  .catch((e) => {
    console.warn("[prune-connections] skip:", e.message || e);
    return prisma.$disconnect().catch(() => {});
  });
'
  exit 0
fi

set -a
[ -f .env ] && . ./.env
set +a
if [ -n "${DATABASE_URL:-}" ] && command -v psql >/dev/null 2>&1; then
  psql "$DATABASE_URL" -q -c "DELETE FROM \"LiveConnection\" WHERE \"lastSeenAt\" < now() - interval '${THRESHOLD_SEC} seconds';" \
    && echo "[prune-connections] psql prune OK (${THRESHOLD_SEC}s)" || true
fi
