import { prisma } from "./prisma";
import { resolveStickyLineLoadBalancerId } from "./server-load";
import { directMediaOriginForServer } from "./stream-server-domain";

const SESSION_KEY_PREFIX = "line-playback-origin:";

/**
 * Persist one healthy direct media edge per line. Xtream/MAG clients advertise
 * one server host per account, so a stable line assignment is the only way to
 * keep every channel on that account on the same LB without relaying video
 * through the panel.
 *
 * Domain is re-read from the StreamServer row on every call so admin domain
 * edits appear on the next player_api / playlist refresh without disconnects.
 * Main-role servers are never selected while an LB is available.
 */
export async function resolveLinePlaybackOrigin(lineId: string, fallbackOrigin: string): Promise<string> {
  const sessionKey = `${SESSION_KEY_PREFIX}${lineId}`;
  const prior = await prisma.loadBalancerSession.findUnique({
    where: { sessionKey },
    select: { serverId: true },
  });
  const serverId = await resolveStickyLineLoadBalancerId(prior?.serverId);
  if (!serverId) return fallbackOrigin;

  const server = await prisma.streamServer.findUnique({
    where: { id: serverId },
    select: { id: true, host: true, domain: true, protocol: true },
  });
  const origin = server ? await directMediaOriginForServer(server) : null;
  if (!origin) return fallbackOrigin;

  await prisma.loadBalancerSession.upsert({
    where: { sessionKey },
    create: { sessionKey, lineId, serverId, isActive: true },
    update: { serverId, isActive: true, lastSeenAt: new Date() },
  });
  return origin;
}
