#!/usr/bin/env bash
set -euo pipefail
cd /home/nexlify-panel
echo "DATABASE_URL=$(grep '^DATABASE_URL=' .env | head -1)"
echo "--- prisma ---"
timeout 10 node -e '
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
p.panelSetting.findUnique({ where: { key: "server" } })
  .then((r) => { console.log("prisma ok", Boolean(r)); return p.$disconnect(); })
  .catch((e) => { console.error("prisma fail", e.message); process.exit(1); });
'
echo "--- git fetch ---"
timeout 8 git fetch --tags --quiet && echo "git fetch ok" || echo "git fetch timeout/fail"
