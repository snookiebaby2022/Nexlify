import { prisma } from "@/lib/prisma";
import { lookupGeo } from "@/lib/geoip";

/** Record geo analytics for dashboard / world map. */
export async function recordConnectionGeography(opts: {
  lineId?: string;
  streamId?: string;
  ip?: string;
}): Promise<void> {
  if (!opts.ip) return;
  const geo = await lookupGeo(opts.ip);
  if (!geo?.countryCode) return;

  const country = geo.countryName ?? geo.countryCode;
  const existing = await prisma.connectionGeography.findFirst({
    where: {
      lineId: opts.lineId ?? null,
      streamId: opts.streamId ?? null,
      countryCode: geo.countryCode,
    },
    orderBy: { lastSeenAt: "desc" },
  });

  if (existing) {
    await prisma.connectionGeography.update({
      where: { id: existing.id },
      data: {
        connectionCount: { increment: 1 },
        lastSeenAt: new Date(),
        region: geo.isp ?? existing.region,
      },
    });
    return;
  }

  await prisma.connectionGeography.create({
    data: {
      lineId: opts.lineId,
      streamId: opts.streamId,
      country,
      countryCode: geo.countryCode,
      region: geo.isp,
      connectionCount: 1,
    },
  });
}
