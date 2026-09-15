#!/usr/bin/env node
/** Forensics: 10gbs isActive/health + activity logs + cron lb_boot_recover history. */
const path = require("path");
process.chdir(path.join(__dirname, ".."));
require("./load-env.cjs").loadEnv();
const { PrismaClient } = require("@prisma/client");
const { get10gbsServer, withSshClient, sshExec } = require("./ssh-10gbs-lib.cjs");

(async () => {
  const p = new PrismaClient();
  const row = await p.streamServer.findFirst({ where: { name: { equals: "10gbs", mode: "insensitive" } } });
  console.log("=== 10gbs DB row (subset) ===");
  console.log(
    JSON.stringify(
      row
        ? {
            id: row.id,
            name: row.name,
            host: row.host,
            port: row.port,
            isActive: row.isActive,
            healthStatus: row.healthStatus,
            healthMessage: row.healthMessage,
            lastHealthAt: row.lastHealthAt,
            agentLastSeen: row.agentLastSeen,
            updatedAt: row.updatedAt,
          }
        : null,
      null,
      2
    )
  );

  const logs = await p.activityLog.findMany({
    where: {
      OR: [
        { action: { contains: "server", mode: "insensitive" } },
        { entity: { in: ["server", "StreamServer", "servers"] } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 40,
    select: { createdAt: true, action: true, entity: true, entityId: true, meta: true },
  });
  console.log("\n=== recent activity (server-related, n=" + logs.length + ") ===");
  for (const l of logs) {
    console.log(l.createdAt.toISOString(), l.action, l.entity, l.entityId || "", JSON.stringify(l.meta || {}).slice(0, 200));
  }

  const cron = await p.cronRunLog.findMany({
    where: { job: { in: ["lb_boot_recover", "server_host_metrics", "agent_auto_restart"] } },
    orderBy: { createdAt: "desc" },
    take: 40,
    select: { createdAt: true, job: true, status: true, message: true },
  });
  console.log("\n=== recent cron (LB-related) ===");
  for (const c of cron) {
    console.log(c.createdAt.toISOString(), c.job, c.status, c.message);
  }

  const s = await get10gbsServer(p);
  await withSshClient({ host: s.host, port: s.port, username: s.user, password: s.password }, async (c) => {
    console.log("\n=== 10gbs PM2 / reboot ===");
    let r = await sshExec(
      c,
      `uptime; who -b 2>/dev/null; last reboot 2>/dev/null | head -5; pm2 describe nexlify-iptv-edge 2>/dev/null | egrep 'status|restarts|uptime|created|unstable|exit code|stopped' || pm2 list; tail -80 /root/.pm2/pm2.log 2>/dev/null | egrep -i 'stop|exit|kill|restart|nexlify-iptv-edge|errored' | tail -25`
    );
    console.log(r.stdout || r.stderr);
    r = await sshExec(
      c,
      `grep -E 'stop|delete|nexlify-iptv-edge|SIG|kill' /var/log/nexlify-watchdog.log 2>/dev/null | tail -15; ls -la /var/log/nexlify*.log 2>/dev/null | head -5`
    );
    console.log(r.stdout || "no watchdog on edge");
  });

  await p.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
