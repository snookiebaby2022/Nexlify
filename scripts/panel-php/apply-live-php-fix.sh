#!/usr/bin/env bash
set -euo pipefail
install -m 644 /opt/nexlify-panel/scripts/panel-php/php/lib.php /opt/nexlify-panel-php/php/lib.php
install -m 644 /opt/nexlify-panel/scripts/panel-php/php/live-auth.php /opt/nexlify-panel-php/php/live-auth.php
chmod 755 /opt/nexlify-panel-php /opt/nexlify-panel-php/php
systemctl reload php8.4-fpm 2>/dev/null || systemctl reload php-fpm || true

if [ -f /opt/nexlify-lb/.env ]; then
  if grep -q '^CONNECTION_HANDLER=' /opt/nexlify-lb/.env; then
    sed -i 's/^CONNECTION_HANDLER=.*/CONNECTION_HANDLER=redis/' /opt/nexlify-lb/.env
  else
    echo 'CONNECTION_HANDLER=redis' >> /opt/nexlify-lb/.env
  fi
fi

cd /opt/nexlify-panel
set -a
# shellcheck disable=SC1091
source .env
set +a

node <<'NODE'
const { PrismaClient } = require("@prisma/client");
const fs = require("fs");
const p = new PrismaClient();
(async () => {
  const n = await p.$executeRawUnsafe(`
    UPDATE "LiveConnection"
    SET "startedAt" = "startedAt" - INTERVAL '2 hours',
        "lastSeenAt" = "lastSeenAt" - INTERVAL '2 hours'
    WHERE "startedAt" > NOW() + INTERVAL '30 minutes'
  `);
  console.log("rewound_skewed_rows", n);
  const line = await p.line.findFirst({
    where: { username: { equals: "test75", mode: "insensitive" } },
    select: { id: true },
  });
  if (line) {
    const rows = await p.liveConnection.findMany({
      where: { lineId: line.id },
      orderBy: { lastSeenAt: "desc" },
    });
    const now = Date.now();
    console.log(
      "test75",
      rows.map((r) => ({
        startedAt: r.startedAt,
        ageSec: Math.floor((now - new Date(r.startedAt).getTime()) / 1000),
        ip: r.ip,
      }))
    );
  }
  const lib = fs.readFileSync("/opt/nexlify-panel-php/php/lib.php", "utf8");
  console.log("has_utc_set", lib.includes("SET TIME ZONE 'UTC'"));
  console.log("has_prune", lib.includes("prune_line_connections"));
  await p.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
NODE

# Sync TS into tree (Next cluster serves compiled .next — rebuild later if needed)
if [ -f /tmp/classic-lb-connections-sync.ts ]; then
  cp -f /tmp/classic-lb-connections-sync.ts /opt/nexlify-panel/src/lib/
fi
if [ -f /tmp/manage-lines-list.ts ]; then
  cp -f /tmp/manage-lines-list.ts /opt/nexlify-panel/src/lib/
fi
echo OK
