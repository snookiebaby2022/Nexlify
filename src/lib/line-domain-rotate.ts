import { prisma } from "@/lib/prisma";
import { buildServerRoleContext, resolveServerRole } from "@/lib/ensure-main-server-online";
import { cacheDel } from "@/lib/cache";

const SESSION_KEY_PREFIX = "line-playback-origin:";

/** Move a line onto the next healthy load-balancer so its advertised DNS host changes. */
export async function rotateLinePlaybackDomain(lineId: string): Promise<{
  serverId: string;
  serverName: string;
  host: string;
}> {
  const line = await prisma.line.findUnique({
    where: { id: lineId },
    select: { id: true },
  });
  if (!line) throw new Error("Line not found");

  const servers = await prisma.streamServer.findMany({
    select: {
      id: true,
      host: true,
      domain: true,
      protocol: true,
      dnsRotator: true,
      panelSettings: true,
      geoLbCountries: true,
      geoLbIsps: true,
      sortOrder: true,
      name: true,
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  const roleCtx = buildServerRoleContext(servers);
  const lbs = servers.filter((s) => resolveServerRole(s, roleCtx) !== "main");
  if (!lbs.length) throw new Error("No load-balancer servers to rotate onto");

  const sessionKey = `${SESSION_KEY_PREFIX}${lineId}`;
  const prior = await prisma.loadBalancerSession.findUnique({
    where: { sessionKey },
    select: { serverId: true },
  });
  const idx = prior?.serverId ? lbs.findIndex((s) => s.id === prior.serverId) : -1;
  const next = lbs[(idx + 1) % lbs.length]!;

  await prisma.loadBalancerSession.upsert({
    where: { sessionKey },
    create: { sessionKey, lineId, serverId: next.id, isActive: true },
    update: { serverId: next.id, isActive: true, lastSeenAt: new Date() },
  });
  await cacheDel(`xtream:acct:shell:${lineId}:`);
  return {
    serverId: next.id,
    serverName: next.name,
    host: next.domain?.split(",")[0]?.trim() || next.host,
  };
}
