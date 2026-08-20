#!/usr/bin/env bash
set -euo pipefail
U=Wardonet31 P=VftY9jVbNT SID=1058467879
curl -sS -m 15 -A "XCIPTV/5.0.0" -o /tmp/pl.m3u8 "http://127.0.0.1/live/$U/$P/${SID}.m3u8"
SEG=$(grep -v '^#' /tmp/pl.m3u8 | head -1)
echo "playlist_lines=$(wc -l < /tmp/pl.m3u8) seg=$SEG"
cd /opt/nexlify-panel
npx tsx -e "
import { prisma } from './src/lib/prisma';
import { resolveStreamIdParam } from './src/lib/xtream-stream-id';
import { cacheGet } from './src/lib/cache';
import { hlsRelayCacheKey } from './src/lib/hls-playback';
(async () => {
  const id = await resolveStreamIdParam('$SID', { username: '$U' });
  const line = await prisma.line.findFirst({ where: { username: '$U' }, select: { id: true } });
  const root = await cacheGet(hlsRelayCacheKey(line!.id, id!));
  console.log('cache_root', root?.slice(0,100));
  process.exit(0);
})();
"
curl -sS -m 15 -A "XCIPTV/5.0.0" -w " http=%{http_code} bytes=%{size_download}\n" -o /tmp/seg.bin "http://127.0.0.1${SEG}"
xxd /tmp/seg.bin | head -2
