#!/usr/bin/env node
/** One-off: repair malformed streamUrl/backupUrl/playlistUrl rows in the DB. */
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

const p = new PrismaClient();

(async () => {
  const dryRun = process.argv.includes("--dry-run");
  const streams = await p.stream.findMany({
    where: { type: "LIVE" },
    select: { id: true, name: true, streamUrl: true, backupUrl: true, playlistUrl: true },
  });
  let fixed = 0;
  for (const s of streams) {
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
      console.log(JSON.stringify({ id: s.id, name: s.name, was: s.streamUrl, now: next.streamUrl }));
      if (!dryRun) {
        await p.stream.update({ where: { id: s.id }, data: next });
      }
      fixed++;
    }
  }
  console.log(JSON.stringify({ scanned: streams.length, fixed, dryRun }, null, 2));
  await p.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
