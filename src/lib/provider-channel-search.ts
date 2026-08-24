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
  source?: "panel" | "provider";
};

export async function searchProviderChannels(
  query: string,
  opts?: {
    streamType?: StreamType | "LIVE" | "MOVIE" | "SERIES";
    limit?: number;
    providerId?: string;
  }
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

  const providerFilter: Prisma.StreamWhereInput = opts?.providerId
    ? { providerId: opts.providerId }
    : {};

  const or: Prisma.StreamWhereInput[] = [
    { name: { contains: q, mode: "insensitive" } },
    { channelId: { contains: q, mode: "insensitive" } },
    { providerPath: { contains: q, mode: "insensitive" } },
  ];
  // Skip ILIKE on streamUrl for names like "BBC" — that scan is huge and times out.
  if (/https?:\/\//i.test(q) || q.includes("/")) {
    or.push({ streamUrl: { contains: q, mode: "insensitive" } });
  }

  const rows = await prisma.stream.findMany({
    where: {
      ...typeFilter,
      ...providerFilter,
      isActive: true,
      OR: or,
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
    .filter((r) => r.streamUrl?.trim() || (r.providerId && r.provider?.isActive !== false))
    .map((r) => ({
      streamId: r.id,
      streamName: r.name,
      streamType: r.type,
      providerId: r.providerId ?? "",
      providerName: r.provider?.name ?? "Direct URL",
      providerType: r.provider?.providerType ?? null,
      providerPath: r.providerPath,
      streamUrl: r.streamUrl,
      source: "panel" as const,
    }));
}
