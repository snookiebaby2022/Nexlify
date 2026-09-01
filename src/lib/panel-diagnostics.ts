import { prisma } from "@/lib/prisma";
import { probeTcpPort, recoverLoadBalancersAfterReboot } from "@/lib/lb-boot-recover";
import { isThisPanelMachine } from "@/lib/panel-local-server";

export type DiagnosticsServerRow = {
  id: string;
  name: string;
  host: string;
  port: number;
  healthStatus: string | null;
  healthMessage: string | null;
  isPanel: boolean;
  portOpen: boolean;
};

export async function getPanelDiagnosticsSnapshot() {
  const [servers, lastRecover, lastProbeJob] = await Promise.all([
    prisma.streamServer.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        host: true,
        port: true,
        healthStatus: true,
        healthMessage: true,
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.cronRunLog.findFirst({
      where: { job: "lb_boot_recover" },
      orderBy: { createdAt: "desc" },
      select: { status: true, message: true, createdAt: true, durationMs: true },
    }),
    prisma.cronRunLog.findFirst({
      where: { job: { in: ["dead_link_probe", "playback_quality"] } },
      orderBy: { createdAt: "desc" },
      select: { job: true, status: true, message: true, createdAt: true },
    }),
  ]);

  const rows: DiagnosticsServerRow[] = await Promise.all(
    servers.map(async (s) => {
      const port = s.port > 0 ? s.port : 8080;
      const portOpen = await probeTcpPort(s.host, port, 2500);
      return {
        id: s.id,
        name: s.name,
        host: s.host,
        port,
        healthStatus: s.healthStatus,
        healthMessage: s.healthMessage,
        isPanel: isThisPanelMachine(s),
        portOpen,
      };
    })
  );

  return {
    servers: rows,
    lastRecover: lastRecover
      ? {
          status: lastRecover.status,
          message: lastRecover.message,
          createdAt: lastRecover.createdAt.toISOString(),
          durationMs: lastRecover.durationMs,
        }
      : null,
    lastProbeJob: lastProbeJob
      ? {
          job: lastProbeJob.job,
          status: lastProbeJob.status,
          message: lastProbeJob.message,
          createdAt: lastProbeJob.createdAt.toISOString(),
        }
      : null,
    notes: [
      "Live bytes splice on load balancers, never on Main.",
      "Recover starts remote nginx, agent, and pm2 edge. It never starts nexlify-iptv-edge on the panel.",
      "Channel probes run when a stream fails after you click it, not on a catalog timer.",
    ],
  };
}

export async function runDiagnosticsRecoverLbs() {
  return recoverLoadBalancersAfterReboot();
}
