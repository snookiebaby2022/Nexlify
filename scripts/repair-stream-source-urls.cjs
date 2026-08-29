#!/usr/bin/env node
/** One-off: repair malformed streamUrl/backupUrl/playlistUrl rows in the DB (batched). */
const { PrismaClient } = require("@prisma/client");

function repairMalformedStreamUrl(input) {
  let s = String(input ?? "").trim();
  if (!s) return s;
  if (s.startsWith("://")) s = `https${s}`;
  s = s.replace(/^(https?):\/\/([^:/]+):\//i, "$1://$2/");
  s = s.replace(/^(https?):\/\/([^:/]+):(\d+)\/(.*)$/i, (_, scheme, host, port, rest) => {
    if (port === "443" && scheme.toLowerCase() === "https") return `https://${host}/${rest}`;
    if (port === "80" && scheme.toLowerCase() === "http") return `http://${host}/${rest}`;
    return `${scheme}://${host}:${port}/${rest}`;
  });
  return s;
}

const BATCH = 250;
const dryRun = process.argv.includes("--dry-run");

async function run() {
  const p = new PrismaClient();
  let cursor = null;
  let scanned = 0;
  let fixed = 0;

  try {
    for (;;) {
      const streams = await p.stream.findMany({
        where: {
          type: "LIVE",
          ...(cursor ? { id: { gt: cursor } } : {}),
        },
        orderBy: { id: "asc" },
        take: BATCH,
        select: { id: true, name: true, streamUrl: true, backupUrl: true, playlistUrl: true },
      });
      if (!streams.length) break;

      for (const s of streams) {
        scanned++;
        const next = {
          streamUrl: repairMalformedStreamUrl(s.streamUrl),
          backupUrl: s.backupUrl ? repairMalformedStreamUrl(s.backupUrl) : s.backupUrl,
          playlistUrl: s.playlistUrl ? repairMalformedStreamUrl(s.playlistUrl) : s.playlistUrl,
        };
        if (
          next.streamUrl !== s.streamUrl ||
          next.backupUrl !== s.backupUrl ||
          next.playlistUrl !== s.playlistUrl
        ) {
          console.log(
            JSON.stringify({ id: s.id, name: s.name, was: s.streamUrl, now: next.streamUrl })
          );
          if (!dryRun) {
            await p.stream.update({ where: { id: s.id }, data: next });
          }
          fixed++;
        }
      }

      cursor = streams[streams.length - 1].id;
      if (streams.length < BATCH) break;
    }
  } finally {
    await p.$disconnect();
  }

  console.log(JSON.stringify({ scanned, fixed, dryRun }, null, 2));
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
