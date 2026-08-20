#!/usr/bin/env bash
set -euo pipefail
cd /opt/nexlify-panel
node <<'NODE'
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
(async () => {
  const s = await p.stream.findFirst({
    where: { name: { contains: "BBC One FHD", mode: "insensitive" } },
    include: { provider: true, server: { include: { proxy: true } } },
  });
  console.log("streamUrl", s?.streamUrl);
  console.log("backupUrl", s?.backupUrl);
  console.log("hostedExternally", s?.hostedExternally);
  console.log("providerPath", s?.providerPath);
  console.log("provider", s?.provider ? { name: s.provider.name, baseUrl: s.provider.baseUrl, type: s.provider.providerType } : null);
  console.log("serverProxy", s?.server?.proxy ? { host: s.server.proxy.host, port: s.server.proxy.port, active: s.server.proxy.isActive } : null);
  const line = await p.line.findFirst({ where: { status: "ACTIVE", expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" } });
  if (s && line) {
    const { resolvePlaybackUrlCandidatesForLine } = require("./src/lib/line-playback.ts");
  }
  await p.$disconnect();
})().catch(console.error);
NODE
