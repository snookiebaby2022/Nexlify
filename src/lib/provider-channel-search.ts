import { StreamType, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type ProviderChannelMatch = {
  streamId: string;
  streamName: string;
  streamType: string;
  providerId: string;
  providerName: string;
  providerType: string | null;
  providerPath: string | null;
  streamUrl: string;
};

export async function searchProviderChannels(
  query: string,
  opts?: { streamType?: StreamType | "LIVE" | "MOVIE" | "SERIES"; limit?: number }
): Promise<ProviderChannelMatch[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const limit = Math.min(Math.max(opts?.limit ?? 40, 1), 80);
  const t = opts?.streamType != null ? String(opts.streamType) : "";
  const typeFilter: Prisma.StreamWhereInput =
    t === "LIVE"
      ? { type: StreamType.LIVE }
      : t === "MOVIE"
        ? { type: StreamType.MOVIE }
        : t === "SERIES"
          ? { type: StreamType.SERIES }
          : {};

  const rows = await prisma.stream.findMany({
    where: {
      ...typeFilter,
      isActive: true,
      providerId: { not: null },
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { providerPath: { contains: q, mode: "insensitive" } },
        { channelId: { contains: q, mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      name: true,
      type: true,
      providerId: true,
      providerPath: true,
      streamUrl: true,
      provider: { select: { id: true, name: true, providerType: true, isActive: true } },
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    take: limit,
  });

  return rows
    .filter((r) => r.providerId && r.provider?.isActive)
    .map((r) => ({
      streamId: r.id,
      streamName: r.name,
      streamType: r.type,
      providerId: r.providerId!,
      providerName: r.provider!.name,
      providerType: r.provider!.providerType,
      providerPath: r.providerPath,
      streamUrl: r.streamUrl,
    }));
}
