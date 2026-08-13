import { prisma } from "@/lib/prisma";
import { isLocalPanelHost } from "@/lib/panel-local-server";
import { parseServerPanelSettings } from "@/lib/server-panel-settings";
import type { Prisma } from "@prisma/client";

type ServerRow = {
  id: string;
  host: string;
  sortOrder: number;
  healthStatus: string;
  panelSettings?: unknown;
  name?: string | null;
};

export type ServerRoleKind = "main" | "lb" | "standard";

/** Resolve main / LB / standard for a server (explicit role wins, else lowest sortOrder = main). */
export function resolveServerRole(
  server: {
    sortOrder?: number | null;
    panelSettings?: unknown;
    geoLbCountries?: unknown;
    geoLbIsps?: unknown;
  },
  minSort: number
): ServerRoleKind {
  const { advanced } = parseServerPanelSettings(server.panelSettings);
  if (advanced.serverRole === "main" || advanced.serverRole === "lb") return advanced.serverRole;
  const hasGeo =
    (Array.isArray(server.geoLbCountries) && server.geoLbCountries.length > 0) ||
    (Array.isArray(server.geoLbIsps) && server.geoLbIsps.length > 0);
  if (hasGeo) return "lb";
  if ((server.sortOrder ?? 0) === minSort) return "main";
  return "standard";
}

/** Main server first, then LB, then standard — stable by sortOrder / name. */
export function sortServersMainFirst<
  T extends {
    sortOrder?: number | null;
    panelSettings?: unknown;
    geoLbCountries?: unknown;
    geoLbIsps?: unknown;
    name?: string | null;
  },
>(servers: T[]): T[] {
  if (servers.length <= 1) return servers;
  const minSort = Math.min(...servers.map((s) => s.sortOrder ?? 0));
  const rank = (r: ServerRoleKind) => (r === "main" ? 0 : r === "lb" ? 1 : 2);
  return [...servers].sort((a, b) => {
    const d = rank(resolveServerRole(a, minSort)) - rank(resolveServerRole(b, minSort));
    if (d !== 0) return d;
    const so = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
    if (so !== 0) return so;
    return String(a.name ?? "").localeCompare(String(b.name ?? ""));
  });
}

function pickMainServer(servers: ServerRow[]): ServerRow | undefined {
  if (!servers.length) return undefined;
  return sortServersMainFirst(servers)[0];
}

/** Auto-create a Main Server entry if none exists, then mark it online. */
export async function ensureMainServerOnline(): Promise<void> {
  const servers = await prisma.streamServer.findMany({
    select: {
      id: true,
      host: true,
      sortOrder: true,
      healthStatus: true,
      panelSettings: true,
      name: true,
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  if (servers.length === 0) {
    const panelHost =
      process.env.PANEL_PRIMARY_DOMAIN ||
      process.env.NEXT_PUBLIC_SERVER_URL?.replace(/^https?:\/\//, "") ||
      process.env.SERVER_IP ||
      "127.0.0.1";
    const streamPort = Number(process.env.STREAM_HTTP_PORT || "80");
    try {
      await prisma.streamServer.create({
        data: {
          name: "Main Server",
          host: panelHost,
          port: streamPort,
          protocol: "http",
          maxClients: 1000,
          isActive: true,
          healthStatus: "online",
          healthMessage: "Auto-created by panel",
          lastHealthAt: new Date(),
          sortOrder: 0,
          panelSettings: {
            advanced: { serverRole: "main" },
          } as Prisma.InputJsonValue,
        },
      });
      return;
    } catch {
      // Ignore duplicate key errors
    }
  }

  const main = pickMainServer(servers);
  if (!main) return;

  const hasExplicitMain = servers.some(
    (s) => parseServerPanelSettings(s.panelSettings).advanced.serverRole === "main"
  );
  if (!hasExplicitMain) {
    const current = parseServerPanelSettings(main.panelSettings);
    const base =
      main.panelSettings && typeof main.panelSettings === "object" && !Array.isArray(main.panelSettings)
        ? (main.panelSettings as Record<string, unknown>)
        : {};
    await prisma.streamServer.update({
      where: { id: main.id },
      data: {
        panelSettings: {
          ...base,
          advanced: { ...current.advanced, serverRole: "main" },
        } as Prisma.InputJsonValue,
      },
    });
  }

  const needsOnline =
    main.healthStatus === "unknown" ||
    main.healthStatus === "offline" ||
    main.healthStatus === "degraded";

  if (!needsOnline) return;

  if (main.healthStatus === "offline" && !isLocalPanelHost(main.host)) return;

  await prisma.streamServer.update({
    where: { id: main.id },
    data: {
      healthStatus: "online",
      healthMessage: "Main server (panel)",
      lastHealthAt: new Date(),
    },
  });
}
