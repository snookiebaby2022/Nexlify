#!/usr/bin/env node
/** Pure-Node live URL dedupe (no TS path aliases). Keeps row with most bouquets, then oldest. */
const fs = require("fs");
const { PrismaClient } = require("@prisma/client");

const LOG = process.env.PURGE_LOG || "/var/log/nexlify-purge-live-dup.log";

function log(msg) {
  const line = `${new Date().toISOString()} ${msg}\n`;
  process.stdout.write(line);
  try {
    fs.appendFileSync(LOG, line);
  } catch {
    /* ignore */
  }
}

function normalizeDuplicateUrl(url) {
  const raw = String(url ?? "").trim();
  if (!raw) return "";
  try {
    const u = new URL(raw);
    u.hash = "";
    const host = u.hostname.toLowerCase();
    const pathPart = decodeURIComponent(u.pathname).replace(/\/+$/, "");
    return `${u.protocol.toLowerCase()}//${host}${pathPart}${u.search}`.toLowerCase();
  } catch {
    return raw.replace(/\/+$/, "").toLowerCase();
  }
}

const BATCH = Number(process.env.PURGE_BATCH || 200);
const dryRun = process.argv.includes("--dry-run");

async function deleteChunk(p, chunk) {
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      return await p.stream.deleteMany({ where: { id: { in: chunk } } });
    } catch (e) {
      const msg = e?.message || String(e);
      log(`delete retry ${attempt}/5: ${msg.slice(0, 200)}`);
      if (attempt >= 5) throw e;
      await new Promise((r) => setTimeout(r, 1500 * attempt));
      try {
        await p.$disconnect();
      } catch {
        /* ignore */
      }
      await p.$connect();
    }
  }
  return { count: 0 };
}

async function main() {
  log("purge start");
  const p = new PrismaClient();
  try {
    log("loading live streams…");
    const rows = await p.stream.findMany({
      where: { type: "LIVE", isRadio: false, NOT: { streamUrl: "" } },
      select: {
        id: true,
        name: true,
        streamUrl: true,
        createdAt: true,
        _count: { select: { bouquets: true } },
      },
    });

    const buckets = new Map();
    for (const row of rows) {
      const key = normalizeDuplicateUrl(row.streamUrl);
      if (!key) continue;
      const list = buckets.get(key) ?? [];
      list.push(row);
      buckets.set(key, list);
    }

    const toDelete = [];
    let groups = 0;
    for (const [, members] of buckets) {
      if (members.length < 2) continue;
      groups++;
      members.sort((a, b) => {
        if (b._count.bouquets !== a._count.bouquets) return b._count.bouquets - a._count.bouquets;
        return a.createdAt.getTime() - b.createdAt.getTime();
      });
      for (let i = 1; i < members.length; i++) toDelete.push(members[i].id);
    }

    log(JSON.stringify({ scanned: rows.length, duplicateGroups: groups, toDelete: toDelete.length, dryRun, batch: BATCH }));

    if (dryRun || !toDelete.length) {
      log("purge done (nothing to delete)");
      return;
    }

    let deleted = 0;
    const totalChunks = Math.ceil(toDelete.length / BATCH);
    for (let i = 0; i < toDelete.length; i += BATCH) {
      const chunk = toDelete.slice(i, i + BATCH);
      const chunkNo = Math.floor(i / BATCH) + 1;
      log(`deleting chunk ${chunkNo}/${totalChunks} (${chunk.length} ids)…`);
      const r = await deleteChunk(p, chunk);
      deleted += r.count;
      log(`deleted chunk ${chunkNo}: ${r.count} (total ${deleted})`);
    }
    log(JSON.stringify({ deleted, done: true }));
  } finally {
    await p.$disconnect();
  }
}

main().catch((e) => {
  log(`FATAL ${e?.stack || e}`);
  process.exit(1);
});
