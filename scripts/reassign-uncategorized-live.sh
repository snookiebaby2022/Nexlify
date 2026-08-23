#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
npx tsx -e "
import { PrismaClient } from '@prisma/client';
import { reassignUncategorizedLiveStreams } from './src/lib/reassign-uncategorized-live.ts';
const prisma = new PrismaClient();
reassignUncategorizedLiveStreams(prisma).then((r) => {
  console.log(JSON.stringify(r));
}).finally(() => prisma.\$disconnect());
"
