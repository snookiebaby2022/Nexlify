#!/usr/bin/env node
process.chdir(require("path").join(__dirname, ".."));
require("./load-env.cjs").loadEnv();
const { PrismaClient } = require("@prisma/client");
const { decryptAtRest, withSshClient, sshExec } = require("./ssh-10gbs-lib.cjs");
const p = new PrismaClient();

(async () => {
  const creds = JSON.parse(
    require("child_process").execSync("node scripts/ensure-smoke-test-line.cjs 2>/dev/null | tail -1", { encoding: "utf8" }).trim()
  );
  const s = await p.streamServer.findFirst({ where: { name: "10gbs" } });
  const line = await p.line.findUnique({ where: { username: creds.u }, select: { id: true } });
  const bouquets = await p.lineBouquet.findMany({ where: { lineId: line.id }, select: { bouquetId: true }, take: 5 });
  const ids = bouquets.map((b) => b.bouquetId);
  const rows = await p.bouquetStream.findMany({
    where: { bouquetId: { in: ids }, stream: { type: "LIVE", isActive: true, xtreamNum: { not: null } } },
    select: { stream: { select: { name: true, xtreamNum: true, streamUrl: true } } },
    take: 6,
  });
  const streams = rows.map((r) => r.stream);
  await withSshClient(
    {
      host: s.agentSshHost || s.host,
      port: s.agentSshPort || 22,
      username: s.agentSshUser || "root",
      password: decryptAtRest(s.agentSshPasswordEnc),
    },
    async (c) => {
      const cmds = [];
      cmds.push("echo ===== ENV =====; cd /opt/nexlify-panel; grep -E 'IPTV_EDGE_BACKEND|IPTV_EDGE_SERVER|PANEL' .env | sed 's/=.*/=***/'");
      cmds.push("echo ===== LOCAL 8080 =====");
      for (const st of streams) {
        const uri = `/live/${creds.u}/${creds.p}/${st.xtreamNum}.ts`;
        cmds.push(
          `echo NAME=${JSON.stringify(st.name)}; curl -sS -m 10 -A 'VLC/3.0.20 LibVLC/3.0.20' -o /tmp/t.bin -D /tmp/t.hdr -w 'code=%{http_code} t=%{time_total} size=%{size_download} ct=%{content_type}\\n' 'http://127.0.0.1:8080${uri}'; head -c 40 /tmp/t.bin | xxd; echo`
        );
      }
      const firstUp = (streams[0] && streams[0].streamUrl) || "";
      cmds.push(`echo ===== UPSTREAM FROM 10GBS =====; curl -sS -m 8 -A 'VLC/3.0.20 LibVLC/3.0.20' -o /tmp/u.bin -w 'up=%{http_code} t=%{time_total} size=%{size_download} ct=%{content_type}\\n' '${firstUp.replace(/'/g, "")}'; head -c 8 /tmp/u.bin | xxd`);
      cmds.push("echo ===== TAIL =====; tail -n 25 /root/.pm2/logs/nexlify-iptv-edge-out.log");
      const r = await sshExec(c, cmds.join("; "), { timeoutMs: 90000 });
      console.log((r.stdout || "") + (r.stderr || ""));
    }
  );
  await p.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
