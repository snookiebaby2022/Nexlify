#!/usr/bin/env bash
set -euo pipefail
cd /opt/nexlify-panel
npx tsx -e "
import { prisma } from './src/lib/prisma';
import { resolveStreamIdParam } from './src/lib/xtream-stream-id';
import { cacheGet } from './src/lib/cache';
import { hlsRelayCacheKey } from './src/lib/hls-playback';
import { decodeRelayTarget } from './src/lib/hls-live-auth';

const sid = '1058467879';
const token = 'aHR0cHM6Ly9ibWxiMDEubXlibWNkbi5jb20vaGxzL2o3TXc1ZHpUR2xYY3l6azlNUm9FenNYXzVKODlMV1lWZTBrdU84TEVqemJHVjlueGY3anJ4SlhoVkNwaHNzRzE0TzNHNkZGUUhlMm5USzk0WUF0bVJpOVBBN2RpMXhlVkZYYzZlZlJSRnZVa1VQV1NXZEN3Sl9HaloxbVR3bS1M';

(async () => {
  const id = await resolveStreamIdParam(sid, { username: 'Wardonet31' });
  const line = await prisma.line.findFirst({ where: { username: 'Wardonet31' }, select: { id: true } });
  const root = await cacheGet<string>(hlsRelayCacheKey(line!.id, id!));
  const target = Buffer.from(token, 'base64url').toString('utf8');
  console.log('cuid', id);
  console.log('root', root);
  console.log('target', target.slice(0, 120));
  console.log('decode', decodeRelayTarget(token, root ?? ''));
  process.exit(0);
})();
"
