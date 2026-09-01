import net from "net";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { prisma } from "@/lib/prisma";
import { decryptAtRest } from "@/lib/encryption-at-rest";
import { isThisPanelMachine } from "@/lib/panel-local-server";
import { sshExec, withSshClient } from "@/lib/ssh-exec";

const execFileAsync = promisify(execFile);

const lastRecoverAt = new Map<string, number>();
const RECOVER_COOLDOWN_MS = 5 * 60 * 1000;

export function probeTcpPort(host: string, port: number, timeoutMs = 4000): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = net.connect({ host, port, timeout: timeoutMs });
    const done = (ok: boolean) => {
      try {
        sock.destroy();
      } catch {
        /* ignore */
      }
      resolve(ok);
    };
    sock.on("connect", () => done(true));
    sock.on("timeout", () => done(false));
    sock.on("error", () => done(false));
  });
}

const REMOTE_RECOVER = `
set +e
systemctl enable nginx >/dev/null 2>&1
systemctl start nginx >/dev/null 2>&1
systemctl enable nexlify-agent >/dev/null 2>&1
systemctl start nexlify-agent >/dev/null 2>&1
systemctl enable pm2-root >/dev/null 2>&1
# Stale PIDFile makes Type=forking pm2-root stay inactive after reboot.
rm -f /root/.pm2/pm2.pid
systemctl start pm2-root >/dev/null 2>&1
if command -v pm2 >/dev/null 2>&1 && [ -f /opt/nexlify-panel/scripts/iptv-edge-proxy.mjs ]; then
  pm2 resurrect >/dev/null 2>&1
  cd /opt/nexlify-panel
  pm2 start ecosystem.config.cjs --only nexlify-iptv-edge --update-env >/dev/null 2>&1
  pm2 save >/dev/null 2>&1
fi
`.trim();

/** Nginx owns :8080 on Main. Never start nexlify-iptv-edge here. */
async function recoverLocalPanelNginx(): Promise<void> {
  if (process.platform === "win32") return;
  const run = (args: string[]) =>
    execFileAsync("systemctl", args, { timeout: 15_000 }).catch(() => undefined);
  await run(["enable", "nginx"]);
  await run(["start", "nginx"]);
  await run(["enable", "nexlify-agent"]);
  await run(["start", "nexlify-agent"]);
}

export async function recoverLoadBalancersAfterReboot(): Promise<{
  checked: number;
  recovered: number;
  stillDown: number;
}> {
  const servers = await prisma.streamServer.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      host: true,
      port: true,
      domain: true,
      healthStatus: true,
      agentSshHost: true,
      agentSshPort: true,
      agentSshUser: true,
      agentSshPasswordEnc: true,
    },
  });

  let recovered = 0;
  let stillDown = 0;

  for (const s of servers) {
    const port = s.port > 0 ? s.port : 8080;
    const up = await probeTcpPort(s.host, port);
    if (up) {
      if (s.healthStatus !== "online" && s.healthStatus !== "healthy") {
        await prisma.streamServer.update({
          where: { id: s.id },
          data: {
            healthStatus: "online",
            healthMessage: `Stream port ${port} open`,
            lastHealthAt: new Date(),
          },
        });
      }
      continue;
    }

    stillDown += 1;
    const isPanel = isThisPanelMachine(s);
    const now = Date.now();
    const last = lastRecoverAt.get(s.id) ?? 0;
    const canRecover = now - last >= RECOVER_COOLDOWN_MS;
    const canSsh = Boolean(s.agentSshPasswordEnc) && !isPanel && canRecover;

    if (isPanel && canRecover) {
      lastRecoverAt.set(s.id, now);
      await recoverLocalPanelNginx();
    } else if (canSsh && s.agentSshPasswordEnc) {
      lastRecoverAt.set(s.id, now);
      try {
        const password = decryptAtRest(s.agentSshPasswordEnc);
        await withSshClient(
          {
            host: (s.agentSshHost || s.host).trim(),
            port: s.agentSshPort || 22,
            username: s.agentSshUser || "root",
            password,
          },
          (client) => sshExec(client, REMOTE_RECOVER, { timeoutMs: 45_000 })
        );
      } catch {
        /* SSH recover is best-effort */
      }
    }

    const upAfter = await probeTcpPort(s.host, port, 5000);
    if (upAfter) {
      recovered += 1;
      stillDown -= 1;
      await prisma.streamServer.update({
        where: { id: s.id },
        data: {
          healthStatus: "online",
          healthMessage: "Recovered stream port after reboot",
          lastHealthAt: new Date(),
        },
      });
      continue;
    }

    if (s.healthStatus !== "offline") {
      await prisma.streamServer.update({
        where: { id: s.id },
        data: {
          healthStatus: "offline",
          healthMessage: `Stream port ${port} closed after reboot (agent heartbeat is not enough)`,
          lastHealthAt: new Date(),
        },
      });
    }
  }

  return { checked: servers.length, recovered, stillDown };
}
