#!/usr/bin/env node
/**
 * Inspect and recover all StreamServer LBs over SSH after reboot.
 * Starts nginx, systemd nexlify-agent, and pm2 edge (never on the panel host).
 * Does not print passwords.
 */
const path = require("path");
const net = require("net");
process.chdir(path.join(__dirname, ".."));
require("./load-env.cjs").loadEnv();

const { decryptAtRest, withSshClient, sshExec } = require("./ssh-10gbs-lib.cjs");
const { PrismaClient } = require("@prisma/client");

const PANEL_HOST = process.env.SERVER_IP || "45.88.138.18";

function tcpProbe(host, port, ms = 4000) {
  return new Promise((resolve) => {
    const sock = net.connect({ host, port, timeout: ms });
    const done = (ok, extra) => {
      try {
        sock.destroy();
      } catch {
        /* ignore */
      }
      resolve({ ok, extra: extra || "" });
    };
    sock.on("connect", () => done(true, "open"));
    sock.on("timeout", () => done(false, "timeout"));
    sock.on("error", (e) => done(false, e.code || e.message));
  });
}

const INSPECT = `
set +e
echo HOST=$(hostname)
echo UPTIME=$(uptime -p 2>/dev/null || uptime)
echo BOOT=$(who -b 2>/dev/null | awk '{print $3,$4}')
echo NGINX_EN=$(systemctl is-enabled nginx 2>/dev/null)
echo NGINX_ACT=$(systemctl is-active nginx 2>/dev/null)
echo AGENT_EN=$(systemctl is-enabled nexlify-agent 2>/dev/null)
echo AGENT_ACT=$(systemctl is-active nexlify-agent 2>/dev/null)
echo PM2_EN=$(systemctl is-enabled pm2-root 2>/dev/null || systemctl is-enabled pm2-ubuntu 2>/dev/null)
echo HAS_EDGE_JS=$(test -f /opt/nexlify-panel/scripts/iptv-edge-proxy.mjs && echo yes || echo no)
echo HAS_AGENT_SH=$(test -x /opt/nexlify-agent/nexlify-stream-agent.sh && echo yes || echo no)
pm2 jlist 2>/dev/null | python3 -c 'import json,sys
try:
  data=json.load(sys.stdin)
except Exception:
  print("PM2=none"); raise SystemExit
for p in data:
  env=p.get("pm2_env",{})
  print("PM2", p.get("name"), env.get("status"), "restarts="+str(env.get("restart_time")))
' 2>/dev/null || echo PM2=none
echo LISTEN=$(ss -lntp | awk '/:80 |:443 |:8080 |:25461 /{print $4}' | tr '\\n' ' ')
`.trim();

function recoverCmd(isPanelHost) {
  const parts = [
    "set +e",
    "systemctl enable nginx 2>/dev/null",
    "systemctl start nginx 2>/dev/null",
    "systemctl enable nexlify-agent 2>/dev/null",
    "systemctl start nexlify-agent 2>/dev/null",
    "systemctl enable pm2-root 2>/dev/null || systemctl enable pm2-ubuntu 2>/dev/null",
    "systemctl start pm2-root 2>/dev/null || true",
  ];
  if (!isPanelHost) {
    parts.push(
      "if command -v pm2 >/dev/null && [ -f /opt/nexlify-panel/scripts/iptv-edge-proxy.mjs ]; then",
      "  cd /opt/nexlify-panel",
      "  pm2 start ecosystem.config.cjs --only nexlify-iptv-edge --update-env >/dev/null 2>&1",
      "  pm2 restart nexlify-iptv-edge --update-env >/dev/null 2>&1",
      "  pm2 save >/dev/null 2>&1",
      "  pm2 startup systemd -u root --hp /root >/dev/null 2>&1",
      "fi",
      "command -v ufw >/dev/null && ufw allow 8080/tcp >/dev/null 2>&1",
      "command -v ufw >/dev/null && ufw allow 25461/tcp >/dev/null 2>&1"
    );
  }
  parts.push(
    "sleep 2",
    "echo AFTER_LISTEN=$(ss -lntp | awk '/:80 |:443 |:8080 |:25461 /{print $4}' | tr '\\n' ' ')",
    "echo AFTER_AGENT=$(systemctl is-active nexlify-agent 2>/dev/null)",
    "echo AFTER_EDGE=$(pm2 jlist 2>/dev/null | python3 -c 'import json,sys\ntry:\n d=json.load(sys.stdin)\nexcept Exception:\n print(\"none\"); raise SystemExit\nprint(\",\".join(p.get(\"name\")+\":\"+p.get(\"pm2_env\",{}).get(\"status\",\"\") for p in d))' 2>/dev/null)"
  );
  return parts.join("\n");
}

async function main() {
  const prisma = new PrismaClient();
  const servers = await prisma.streamServer.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  const results = [];
  for (const s of servers) {
    const isPanel = s.host === PANEL_HOST || s.host === "127.0.0.1";
    const row = { name: s.name, host: s.host, port: s.port, isPanel, health: s.healthStatus };
    console.log(`\n======== ${s.name} ${s.host}:${s.port} (${s.healthStatus}) panel=${isPanel} ========`);
    const probe = await tcpProbe(s.host, s.port || 8080, 4000);
    const ssh22 = await tcpProbe(s.host, s.agentSshPort || 22, 4000);
    console.log(`stream_port ${s.port} ${probe.ok ? "OPEN" : "FAIL " + probe.extra}`);
    console.log(`ssh22 ${ssh22.ok ? "OPEN" : "FAIL " + ssh22.extra}`);
    row.streamPortOpen = probe.ok;
    row.sshOpen = ssh22.ok;
    if (probe.ok) {
      if (s.healthStatus !== "online" && s.healthStatus !== "healthy") {
        await prisma.streamServer.update({
          where: { id: s.id },
          data: {
            healthStatus: "online",
            healthMessage: `Stream port ${s.port} open`,
            lastHealthAt: new Date(),
          },
        });
        row.markedOnline = true;
      }
      results.push(row);
      continue;
    }
    if (!s.agentSshPasswordEnc) {
      console.log("no SSH password stored — skip remote recover");
      results.push(row);
      continue;
    }
    const password = decryptAtRest(s.agentSshPasswordEnc);
    const sshHost = (s.agentSshHost || s.host).trim();
    try {
      await withSshClient(
        { host: sshHost, port: s.agentSshPort || 22, username: s.agentSshUser || "root", password },
        async (c) => {
          let r = await sshExec(c, INSPECT, { timeoutMs: 25000 });
          console.log((r.stdout || "").trim() || r.stderr);
          console.log("--- recover ---");
          r = await sshExec(c, recoverCmd(isPanel), { timeoutMs: 60000 });
          console.log((r.stdout || "").trim() || r.stderr);
        }
      );
      row.sshOk = true;
    } catch (e) {
      row.sshOk = false;
      row.sshError = e instanceof Error ? e.message : String(e);
      console.log("SSH FAIL:", row.sshError);
    }
    const probe2 = await tcpProbe(s.host, s.port || 8080, 5000);
    row.streamPortOpenAfter = probe2.ok;
    console.log(`stream_port after ${s.port} ${probe2.ok ? "OPEN" : "FAIL " + probe2.extra}`);
    if (probe2.ok && s.healthStatus !== "online") {
      await prisma.streamServer.update({
        where: { id: s.id },
        data: {
          healthStatus: "online",
          healthMessage: "Recovered after reboot (stream port open)",
          lastHealthAt: new Date(),
        },
      });
      console.log("marked online in DB");
      row.markedOnline = true;
    }
    results.push(row);
  }
  console.log("\n===== SUMMARY =====");
  console.log(JSON.stringify(results, null, 2));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
