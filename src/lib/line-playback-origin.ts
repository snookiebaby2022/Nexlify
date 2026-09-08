import { prisma } from "./prisma";
import { resolvePlaybackLoadBalancerId } from "./server-load";

const SESSION_KEY_PREFIX = "line-playback-origin:";

function hostname(value: string | null | undefined): string {
  return String(value || "")
    .trim()
    .split(",")[0]
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "");
}

function originForEdge(server: { host: string; domain: string | null; protocol: string | null }): string | null {
  const host = hostname(server.domain) || hostname(server.host);
  if (!host) return null;
  // Remote-edge installs own public HTTP :80. Do not use a StreamServer's
  // control/agent port here: the client must reach the media edge directly.
  return `${String(server.protocol || "http").toLowerCase() === "https" ? "https" : "http"}://${host}`;
}

/**
 * Persist one healthy direct media edge per line. Xtream/MAG clients advertise
 * one server host per account, so a stable line assignment is the only way to
 * keep every channel on that account on the same LB without relaying video
 * through the panel.
 */
export async function resolveLinePlaybackOrigin(lineId: string, fallbackOrigin: string): Promise<string> {
  const sessionKey = `${SESSION_KEY_PREFIX}${lineId}`;
  const prior = await prisma.loadBalancerSession.findUnique({
    where: { sessionKey },
    select: { serverId: true },
  });
  const serverId = await resolvePlaybackLoadBalancerId(prior?.serverId);
  if (!serverId) return fallbackOrigin;

  const server = await prisma.streamServer.findUnique({
    where: { id: serverId },
    select: { id: true, host: true, domain: true, protocol: true },
  });
  const origin = server ? originForEdge(server) : null;
  if (!origin) return fallbackOrigin;

  await prisma.loadBalancerSession.upsert({
    where: { sessionKey },
    create: { sessionKey, lineId, serverId, isActive: true },
    update: { serverId, isActive: true, lastSeenAt: new Date() },
  });
  return origin;
}
