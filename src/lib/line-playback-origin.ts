import { prisma } from "./prisma";
import { buildServerRoleContext, resolveServerRole } from "./ensure-main-server-online";
import { resolveStickyLineLoadBalancerId } from "./server-load";
import {
  collectMainMediaHostPool,
  directMediaOriginForServer,
} from "./stream-server-domain";

const SESSION_KEY_PREFIX = "line-playback-origin:";

/**
 * Persist one healthy direct media edge per line. Xtream/MAG clients advertise
 * one server host per account, so a stable line assignment is the only way to
 * keep every channel on that account on the same LB without relaying video
 * through the panel.
 *
 * Advertised hostname preference (direct-edge, no panel hairpin):
 * 1) LB Domain Name only when DNS A/AAAA includes that LB IP
 * 2) else a main Domain Name / rotator hostname that DNS-points at the LB
 * 3) else the LB IP
 * Never advertise the main panel IP (or hosts that resolve to it) while a healthy LB exists.
 */
export async function resolveLinePlaybackOrigin(lineId: string, fallbackOrigin: string): Promise<string> {
  const sessionKey = `${SESSION_KEY_PREFIX}${lineId}`;
  const prior = await prisma.loadBalancerSession.findUnique({
    where: { sessionKey },
    select: { serverId: true },
  });
  const serverId = await resolveStickyLineLoadBalancerId(prior?.serverId);
  if (!serverId) return fallbackOrigin;

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
  });
  const roleCtx = buildServerRoleContext(servers);
  const lb = servers.find((s) => s.id === serverId);
  if (!lb) return fallbackOrigin;

  const main = servers.find((s) => resolveServerRole(s, roleCtx) === "main") ?? null;
  const mainPoolHosts = collectMainMediaHostPool(main);
  const panelHost = main?.host ?? null;

  const origin = await directMediaOriginForServer(lb, {
    mainPoolHosts,
    lineId,
    panelHost,
  });
  // Healthy LB exists — never fall back to panel/media hairpin origin.
  if (!origin) {
    const proto =
      String(lb.protocol || "http").toLowerCase() === "https" ? "https" : "http";
    return `${proto}://${lb.host}`;
  }

  await prisma.loadBalancerSession.upsert({
    where: { sessionKey },
    create: { sessionKey, lineId, serverId, isActive: true },
    update: { serverId, isActive: true, lastSeenAt: new Date() },
  });
  return origin;
}
