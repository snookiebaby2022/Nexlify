import { prisma } from "@/lib/prisma";
import { isLocalPanelHost } from "@/lib/panel-local-server";
import {
  parseServerPanelSettings,
  readExplicitServerRole,
} from "@/lib/server-panel-settings";
import type { Prisma } from "@prisma/client";

type ServerRow = {
  id: string;
  host: string;
  sortOrder: number;
  healthStatus: string;
  panelSettings?: unknown;
  name?: string | null;
  geoLbCountries?: unknown;
  geoLbIsps?: unknown;
};

export type ServerRoleKind = "main" | "lb" | "standard";

type RoleServer = {
  id?: string;
  host?: string | null;
  sortOrder?: number | null;
  panelSettings?: unknown;
  geoLbCountries?: unknown;
  geoLbIsps?: unknown;
  name?: string | null;
};

/**
 * Pick the single inferred main when no server has an explicit `serverRole: "main"`.
 * Prefer the panel host, else a server named "Main Server", else lowest sortOrder / name.
 */
export function pickInferredMainId(servers: RoleServer[]): string | null {
  if (!servers.length) return null;
  const hasExplicitMain = servers.some(
    (s) => readExplicitServerRole(s.panelSettings) === "main"
  );
  if (hasExplicitMain) return null;

  const withId = servers.filter((s) => s.id);
  const local = withId.find((s) => s.host && isLocalPanelHost(String(s.host)));
  if (local?.id) return local.id;

  const namedMain = withId.find((s) =>
    /^main(\s+server)?$/i.test(String(s.name ?? "").trim())
  );
  if (namedMain?.id) return namedMain.id;

  const minSort = Math.min(...withId.map((s) => s.sortOrder ?? 0));
  const tied = withId.filter((s) => (s.sortOrder ?? 0) === minSort);
  tied.sort((a, b) => String(a.name ?? "").localeCompare(String(b.name ?? "")));
  return tied[0]?.id ?? withId[0]?.id ?? null;
}

/**
 * Resolve main / LB / standard.
 * - Explicit `serverRole` in stored JSON wins (customers may mark more than one main).
 * - With no explicit role: at most ONE inferred main; all other untagged servers are LBs.
 */
export function resolveServerRole(
  server: RoleServer,
  ctxOrMinSort: number | { inferredMainId?: string | null; hasExplicitMain?: boolean }
): ServerRoleKind {
  const explicit = readExplicitServerRole(server.panelSettings);
  if (explicit === "main" || explicit === "lb") return explicit;
  if (explicit === "standard") {
    const hasGeo =
      (Array.isArray(server.geoLbCountries) && server.geoLbCountries.length > 0) ||
      (Array.isArray(server.geoLbIsps) && server.geoLbIsps.length > 0);
    if (hasGeo) return "lb";
    return "standard";
  }

  const hasGeo =
    (Array.isArray(server.geoLbCountries) && server.geoLbCountries.length > 0) ||
    (Array.isArray(server.geoLbIsps) && server.geoLbIsps.length > 0);
  if (hasGeo) return "lb";

  if (typeof ctxOrMinSort === "number") {
    return "lb";
  }

  const inferred = ctxOrMinSort.inferredMainId;
  if (inferred && server.id && server.id === inferred) return "main";
  return "lb";
}

function roleContext(servers: RoleServer[]) {
  const hasExplicitMain = servers.some(
    (s) => readExplicitServerRole(s.panelSettings) === "main"
  );
  return {
    hasExplicitMain,
    inferredMainId: pickInferredMainId(servers),
  };
}

export function buildServerRoleContext(servers: RoleServer[]) {
  return roleContext(servers);
}

/** Main server(s) first, then LB, then standard — stable by sortOrder / name. */
export function sortServersMainFirst<T extends RoleServer>(servers: T[]): T[] {
  if (servers.length <= 1) return servers;
  const ctx = roleContext(servers);
  const rank = (r: ServerRoleKind) => (r === "main" ? 0 : r === "lb" ? 1 : 2);
  return [...servers].sort((a, b) => {
    const d = rank(resolveServerRole(a, ctx)) - rank(resolveServerRole(b, ctx));
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

function mergeRole(
  panelSettings: unknown,
  serverRole: "main" | "lb"
): Prisma.InputJsonValue {
  const current = parseServerPanelSettings(panelSettings);
  const base =
    panelSettings && typeof panelSettings === "object" && !Array.isArray(panelSettings)
      ? (panelSettings as Record<string, unknown>)
      : {};
  return {
    ...base,
    advanced: { ...current.advanced, serverRole },
  } as Prisma.InputJsonValue;
}

/** Auto-create a Main Server entry if none exists, then mark it online and tag LBs. */
export async function ensureMainServerOnline(): Promise<void> {
  const servers = await prisma.streamServer.findMany({
    select: {
      id: true,
      host: true,
      sortOrder: true,
      healthStatus: true,
      panelSettings: true,
      name: true,
      geoLbCountries: true,
      geoLbIsps: true,
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

  for (const s of servers) {
    if (readExplicitServerRole(s.panelSettings)) continue;
    const role: "main" | "lb" = s.id === main.id ? "main" : "lb";
    try {
      await prisma.streamServer.update({
        where: { id: s.id },
        data: { panelSettings: mergeRole(s.panelSettings, role) },
      });
    } catch {
      /* ignore */
    }
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
