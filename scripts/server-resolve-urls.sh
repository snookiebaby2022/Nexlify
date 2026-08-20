#!/usr/bin/env bash
# Resolve playback URL candidates for a sample stream + line.
set -euo pipefail
cd /opt/nexlify-panel
npx tsx <<'TS'
import { PrismaClient } from "@prisma/client";
import { resolvePlaybackUrlCandidatesForLine } from "./src/lib/line-playback";

const p = new PrismaClient();
try {
  const s = await p.stream.findFirst({
    where: { name: { contains: "BBC One FHD", mode: "insensitive" } },
    include: { provider: true, server: { include: { proxy: true } } },
  });
  console.log("streamUrl", s?.streamUrl);
  console.log("backupUrl", s?.backupUrl);
  console.log("hostedExternally", s?.hostedExternally);
  console.log("providerPath", s?.providerPath);
  console.log(
    "provider",
    s?.provider
      ? { name: s.provider.name, baseUrl: s.provider.baseUrl, type: s.provider.providerType }
      : null
  );
  console.log(
    "serverProxy",
    s?.server?.proxy
      ? { host: s.server.proxy.host, port: s.server.proxy.port, active: s.server.proxy.isActive }
      : null
  );

  const line = await p.line.findFirst({
    where: { status: "ACTIVE", expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (s && line) {
    const urls = await resolvePlaybackUrlCandidatesForLine(line.id, s.id);
    console.log("playbackCandidates", urls.slice(0, 5));
  } else {
    console.log("playbackCandidates", "(no active line or stream)");
  }
} finally {
  await p.$disconnect();
}
TS
