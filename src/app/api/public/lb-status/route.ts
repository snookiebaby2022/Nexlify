import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildServerRoleContext, resolveServerRole } from "@/lib/ensure-main-server-online";
import { isServerHealthOnline } from "@/lib/server-tree";

export async function GET() {
  const servers = await prisma.streamServer.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      host: true,
      sortOrder: true,
      healthStatus: true,
      panelSettings: true,
      geoLbCountries: true,
      geoLbIsps: true,
    },
  });
  const ctx = buildServerRoleContext(servers);
  const lbs = servers
    .filter((s) => resolveServerRole(s, ctx) === "lb")
    .map((s) => ({
      id: s.id,
      name: s.name,
      online: isServerHealthOnline(s.healthStatus),
      health: s.healthStatus,
    }));

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    loadBalancers: lbs,
    online: lbs.filter((s) => s.online).length,
    total: lbs.length,
  });
}
