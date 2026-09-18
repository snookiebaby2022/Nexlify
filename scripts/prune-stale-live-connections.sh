#!/usr/bin/env bash
# Drop orphaned LiveConnection rows so maxConnections slots free up after crashes/restarts.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
# shellcheck source=lib/nexlify-log.sh
source "$ROOT/scripts/lib/nexlify-log.sh"

THRESHOLD_SEC="${NEXLIFY_CONN_STALE_SEC:-600}"
export THRESHOLD_SEC

if command -v node >/dev/null 2>&1 && [ -d node_modules/@prisma/client ]; then
  node -e '
const ts = () => new Date().toISOString();
const { PrismaClient } = require("@prisma/client");
const sec = Number(process.env.THRESHOLD_SEC || "90");
const before = new Date(Date.now() - sec * 1000);
const prisma = new PrismaClient();
prisma.liveConnection.deleteMany({ where: { lastSeenAt: { lt: before } } })
  .then((r) => {
    console.log("[" + ts() + "] prune-connections removed=" + r.count + " thresholdSec=" + sec + " cutoff=" + before.toISOString());
    return prisma.$disconnect();
  })
  .catch((e) => {
    console.warn("[" + ts() + "] prune-connections error=" + (e.message || e));
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
    && nexlify_log "prune-connections psql_ok thresholdSec=${THRESHOLD_SEC}" || nexlify_log_err "prune-connections psql_failed thresholdSec=${THRESHOLD_SEC}"
fi
