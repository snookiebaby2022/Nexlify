import { prisma } from "@/lib/prisma";
import { lineIsPlayable, type Line } from "@/lib/lines";
import { resolveStreamPlaybackUrl, type StreamWithProvider } from "@/lib/resolve-stream-url";
import { isIntegrationStreamUrl } from "@/lib/integration-stream-url";
import { resolveIntegrationPlaybackUrl } from "@/lib/integration-playback";
import { cacheGet, cacheSet } from "@/lib/cache";
import { applyPlaybackFingerprint } from "@/lib/playback-fingerprint";

export type LinePlaybackAuth = Pick<
  Line,
  | "id"
  | "password"
  | "status"
  | "expiresAt"
  | "lockToIp"
  | "allowedIps"
  | "maxConnections"
  | "allowedCountries"
  | "blockedCountries"
  | "forcedServerId"
>;

export type PlaybackContext = {
  clientIp?: string;
  userAgent?: string;
};

export async function getLineForPlaybackAuth(username: string): Promise<LinePlaybackAuth | null> {
  return prisma.line.findUnique({
    where: { username },
    select: {
      id: true,
      password: true,
      status: true,
      expiresAt: true,
      lockToIp: true,
      allowedIps: true,
      maxConnections: true,
      allowedCountries: true,
      blockedCountries: true,
      forcedServerId: true,
    },
  });
}

/** Cached resolved URL for authorized stream (45s). */
export async function resolvePlaybackUrlForLine(
  lineId: string,
  streamId: string,
  ctx?: PlaybackContext
): Promise<string | null> {
  const cacheKey = `playback:url:${lineId}:${streamId}`;
  const cached = await cacheGet<string>(cacheKey);
  if (cached) return cached;

  const line = await prisma.line.findUnique({
    where: { id: lineId },
    select: { forcedServerId: true },
  });

  const stream = await prisma.stream.findFirst({
    where: {
      id: streamId,
      isActive: true,
      ...(line?.forcedServerId ? { serverId: line.forcedServerId } : {}),
      bouquets: {
        some: {
          bouquet: {
            isActive: true,
            lines: { some: { lineId } },
          },
        },
      },
    },
    include: { provider: true, server: true },
  });
  if (!stream) return null;

  const { assertRestreamAllowedForStream } = await import("@/lib/restream-policy");
  const restreamBlock = await assertRestreamAllowedForStream(stream);
  if (restreamBlock) return null;

  let url: string;
  if (isIntegrationStreamUrl(stream.streamUrl)) {
    url =
      (await resolveIntegrationPlaybackUrl(stream.streamUrl)) ??
      stream.streamUrl;
  } else {
    url = resolveStreamPlaybackUrl(
      stream as StreamWithProvider,
      `${lineId}:${stream.id}`
    );
  }
  url = await applyPlaybackFingerprint(url, {
    lineId,
    clientIp: ctx?.clientIp,
    userAgent: ctx?.userAgent,
  });
  await cacheSet(cacheKey, url, 45);
  return url;
}

export async function resolveLivePlaybackRedirect(
  username: string,
  password: string,
  streamId: string,
  ctx?: PlaybackContext
): Promise<
  | { ok: true; lineId: string; playbackUrl: string }
  | { ok: false; reason: "auth" | "not_found" }
> {
  const line = await getLineForPlaybackAuth(username);
  if (!line || line.password !== password || !lineIsPlayable(line)) {
    return { ok: false, reason: "auth" };
  }
  const playbackUrl = await resolvePlaybackUrlForLine(line.id, streamId, ctx);
  if (!playbackUrl) return { ok: false, reason: "not_found" };
  return { ok: true, lineId: line.id, playbackUrl };
}
