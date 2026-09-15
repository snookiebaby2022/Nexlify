import net from "net";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { prisma } from "@/lib/prisma";
import { decryptAtRest } from "@/lib/encryption-at-rest";
import { isThisPanelMachine } from "@/lib/panel-local-server";
import { sshExec, withSshClient } from "@/lib/ssh-exec";

const execFileAsync = promisify(execFile);

const lastRecoverAt = new Map<string, number>();
/** Avoid hammering SSH; cron runs every minute so 90s is enough spacing. */
const RECOVER_COOLDOWN_MS = 90 * 1000;

function remoteLbRecoverScript(): string {
  try {
    return readFileSync(join(process.cwd(), "scripts/lb-edge-remote-recover.sh"), "utf8");
  } catch {
    return REMOTE_RECOVER_FALLBACK;
  }
}

function playbackProbePort(server: { name: string; port: number }): number {
  if (/10gbs/i.test(server.name)) return 8080;
  return server.port > 0 ? server.port : 8080;
}

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

/** Legacy inline recover if lb-edge-remote-recover.sh is missing on disk. */
const REMOTE_RECOVER_FALLBACK = `
set +e
systemctl enable nginx >/dev/null 2>&1
systemctl start nginx >/dev/null 2>&1
systemctl enable nexlify-agent >/dev/null 2>&1
systemctl start nexlify-agent >/dev/null 2>&1
systemctl enable pm2-root >/dev/null 2>&1
rm -f /root/.pm2/pm2.pid
systemctl start pm2-root >/dev/null 2>&1
if [ -x /opt/nexlify-panel/scripts/ensure-iptv-edge-pm2.sh ]; then
  bash /opt/nexlify-panel/scripts/ensure-iptv-edge-pm2.sh
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
    where: {
      OR: [
        { isActive: true },
        { name: { equals: "10gbs", mode: "insensitive" } },
        { host: "209.237.141.15" },
      ],
    },
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
    const port = playbackProbePort(s);
    const up = await probeTcpPort(s.host, port);
    if (up) {
      const patch: {
        healthStatus: string;
        healthMessage: string;
        lastHealthAt: Date;
        isActive?: boolean;
        port?: number;
      } = {
        healthStatus: "online",
        healthMessage: `Stream port ${port} open`,
        lastHealthAt: new Date(),
      };
      if (/10gbs/i.test(s.name)) {
        patch.isActive = true;
        if (s.port !== 8080) patch.port = 8080;
      }
      if (s.healthStatus !== "online" && s.healthStatus !== "healthy") {
        await prisma.streamServer.update({ where: { id: s.id }, data: patch });
      } else if (/10gbs/i.test(s.name) && (patch.isActive || patch.port)) {
        await prisma.streamServer.update({ where: { id: s.id }, data: patch });
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
          (client) => sshExec(client, remoteLbRecoverScript(), { timeoutMs: 90_000 })
        );
      } catch (e) {
        console.warn("[lb-boot-recover] SSH recover failed:", s.name, e);
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
          ...( /10gbs/i.test(s.name) ? { isActive: true, port: 8080 } : {} ),
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
