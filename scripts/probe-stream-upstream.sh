#!/usr/bin/env bash
set -euo pipefail
cd /opt/nexlify-panel
npx tsx scripts/server-resolve-urls.sh Wardonet31 1862838169 2>/dev/null || npx tsx -e "
import { prisma } from './src/lib/prisma';
import { resolveStreamIdParam } from './src/lib/xtream-stream-id';
import { resolvePlaybackUrlCandidatesForLine } from './src/lib/line-playback';
import { resolveOutboundProxyForStream } from './src/lib/outbound-proxy';
(async () => {
  const id = await resolveStreamIdParam('1862838169', { username: 'Wardonet31' });
  const line = await prisma.line.findFirst({ where: { username: 'Wardonet31' }, select: { id: true } });
  const cands = await resolvePlaybackUrlCandidatesForLine(line!.id, id!, { skipGeo: true });
  const proxy = await resolveOutboundProxyForStream(id!);
  const s = await prisma.stream.findUnique({ where: { id: id! }, select: { name: true, streamUrl: true, serverId: true, epgChannelId: true } });
  console.log(JSON.stringify({ id, name: s?.name, streamUrl: s?.streamUrl?.slice(0,120), serverId: s?.serverId, epgChannelId: s?.epgChannelId, proxy: proxy ? { host: proxy.host, port: proxy.port, user: proxy.username } : null, candidates: cands.slice(0,4) }, null, 2));
  process.exit(0);
})();
"
