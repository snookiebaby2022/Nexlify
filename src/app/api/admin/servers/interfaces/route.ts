import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";
import { parseServerPanelSettings } from "@/lib/server-panel-settings";

export async function GET() {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const servers = await prisma.streamServer.findMany({
    select: { id: true, name: true, host: true, panelSettings: true },
    orderBy: { sortOrder: "asc" },
  });

  const seen = new Set<string>();
  const interfaces: { name: string; servers: string[] }[] = [];

  for (const server of servers) {
    const { network } = parseServerPanelSettings(server.panelSettings);
    const iface = network.interfaceName?.trim();
    if (!iface) continue;
    const key = iface.toLowerCase();
    if (seen.has(key)) {
      const row = interfaces.find((i) => i.name.toLowerCase() === key);
      if (row && !row.servers.includes(server.name)) row.servers.push(server.name);
      continue;
    }
    seen.add(key);
    interfaces.push({ name: iface, servers: [server.name] });
  }

  const defaults = ["eth0", "ens3", "enp0s3", "eno1"];
  for (const d of defaults) {
    if (!seen.has(d.toLowerCase())) {
      interfaces.push({ name: d, servers: [] });
    }
  }

  return NextResponse.json({ interfaces });
}
