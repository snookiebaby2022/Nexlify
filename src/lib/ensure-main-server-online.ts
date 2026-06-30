import { prisma } from "@/lib/prisma";
import { isLocalPanelHost } from "@/lib/panel-local-server";
import { parseServerPanelSettings } from "@/lib/server-panel-settings";

type ServerRow = {
  id: string;
  host: string;
  sortOrder: number;
  healthStatus: string;
  panelSettings?: unknown;
};

function pickMainServer(servers: ServerRow[]): ServerRow | undefined {
  if (!servers.length) return undefined;
  const minSort = Math.min(...servers.map((s) => s.sortOrder ?? 0));
  return (
    servers.find((s) => parseServerPanelSettings(s.panelSettings).advanced.serverRole === "main") ??
    servers.find((s) => (s.sortOrder ?? 0) === minSort)
  );
}

/** Mark the main/panel server online when health was never probed (typical fresh install). */
export async function ensureMainServerOnline(): Promise<void> {
  const servers = await prisma.streamServer.findMany({
    select: { id: true, host: true, sortOrder: true, healthStatus: true, panelSettings: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  const main = pickMainServer(servers);
  if (!main) return;

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
