#!/usr/bin/env node
/** Proxy vs LB traffic split, dead probes, panel health snapshot. */
const { PrismaClient } = require("@prisma/client");
require("./load-env.cjs").loadEnv();

(async () => {
  const p = new PrismaClient();
  const mediaOrigin = String(process.env.NEXLIFY_MEDIA_ORIGIN || "").trim();
  const edge = await p.streamServer.findFirst({ where: { name: "10gbs" } });

  console.log("=== stream URL for apps ===");
  console.log(
    JSON.stringify(
      {
        live_server_url: edge?.domain || edge?.host || "bladesmedia2.darkcdn.win",
        live_server_port: String(edge?.port || 8080),
        live_server_protocol: edge?.protocol || "http",
        full_example: `${mediaOrigin || `http://${edge?.domain || edge?.host}:8080`}/live/USERNAME/PASSWORD/STREAM_ID.ts`,
        panel_api_epg: "https://darkcdn.store (API, EPG, VOD only — not live MPEG-TS)",
        note: "Users must refresh playlist after URL change",
      },
      null,
      2
    )
  );

  console.log("\n=== live connections by viewer IP (top 15) ===");
  const stale = new Date(Date.now() - 5 * 60 * 1000);
  const conns = await p.liveConnection.findMany({
    where: { lastSeenAt: { gte: stale }, stream: { type: "LIVE" } },
    select: { ip: true, line: { select: { username: true } }, stream: { select: { name: true } } },
    take: 500,
  });
  const byIp = new Map();
  for (const c of conns) {
    const ip = c.ip || "unknown";
    byIp.set(ip, (byIp.get(ip) || 0) + 1);
  }
  [...byIp.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).forEach(([ip, n]) => console.log(`${n}\t${ip}`));

  const panelIp = "45.88.138.18";
  const edgeIp = edge?.host || "209.237.141.15";
  const viaPanel = conns.filter((c) => c.ip === panelIp).length;
  const viaEdge = conns.filter((c) => c.ip === edgeIp).length;
  const direct = conns.length - viaPanel - viaEdge;
  console.log(`\nconnections: total=${conns.length} panel_ip=${viaPanel} edge_ip=${viaEdge} other=${direct}`);

  console.log("\n=== probe failures (active live) ===");
  const failed = await p.stream.findMany({
    where: { isActive: true, type: "LIVE", lastProbeOk: false },
    select: { id: true, name: true, streamUrl: true, lastProbeError: true, lastProbeAt: true, backupUrl: true },
    orderBy: { lastProbeAt: "desc" },
    take: 10,
  });
  if (!failed.length) console.log("none");
  for (const s of failed) {
    console.log(`- ${s.name}`);
    console.log(`  id=${s.id}`);
    console.log(`  error=${s.lastProbeError || "unknown"}`);
    console.log(`  url=${String(s.streamUrl || "").slice(0, 100)}`);
    if (s.backupUrl) console.log(`  backup=${String(s.backupUrl).slice(0, 100)}`);
  }

  console.log("\n=== panel health ===");
  const { execSync } = require("child_process");
  try {
    console.log(execSync("ps -eo pid,comm,pcpu,pmem --sort=-pcpu | head -12", { encoding: "utf8" }));
  } catch {}
  try {
    console.log("nginx_workers:", execSync("ps aux | grep 'nginx: worker' | grep -v grep | wc -l", { encoding: "utf8" }).trim());
    console.log("nginx_shutting_down:", execSync("ps aux | grep 'shutting down' | grep -v grep | wc -l", { encoding: "utf8" }).trim());
  } catch {}
  try {
    console.log(
      "pg_active:",
      execSync(
        "sudo -u postgres psql -d nexlify -tAc \"select count(*) from pg_stat_activity where state='active' and query not like '%pg_stat_activity%'\"",
        { encoding: "utf8" }
      ).trim()
    );
  } catch {}

  await p.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
