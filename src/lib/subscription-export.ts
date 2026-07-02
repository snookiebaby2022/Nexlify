import type { Stream } from "@prisma/client";

export function resolveChannelId(stream: Pick<Stream, "id" | "channelId" | "epgChannelId">): string {
  return stream.channelId?.trim() || stream.id;
}

export function resolveEpgId(stream: Pick<Stream, "id" | "epgChannelId">): string {
  return stream.epgChannelId?.trim() || stream.id;
}

/** CSV header for MAG / stalker / EPG tooling. */
export function buildEpgMapCsv(
  streams: (Stream & { category?: { name: string } | null })[],
  opts?: { includeInactive?: boolean }
): string {
  const rows = streams.filter((s) => opts?.includeInactive || s.isActive);
  const lines = ["stream_id,epg_id,channel_name,category,type"];
  for (const s of rows) {
    const name = s.name.replace(/"/g, '""');
    const cat = (s.category?.name ?? "").replace(/"/g, '""');
    lines.push(
      `"${resolveChannelId(s)}","${resolveEpgId(s)}","${name}","${cat}","${s.type}"`
    );
  }
  return lines.join("\n");
}

export function buildSubscriptionsExportCsv(
  lines: {
    username: string;
    password: string;
    status: string;
    expiresAt: Date;
    maxConnections: number;
    externalId: string | null;
    bouquets: { bouquet: { name: string } }[];
  }[]
): string {
  const header =
    "username,password,status,expires_at,max_connections,service_id,bouquets";
  const body = lines.map((l) => {
    const bouquets = l.bouquets.map((b) => b.bouquet.name).join("; ");
    return [
      l.username,
      l.password,
      l.status,
      l.expiresAt.toISOString(),
      l.maxConnections,
      l.externalId ?? "",
      bouquets.replace(/"/g, '""'),
    ]
      .map((v) => `"${v}"`)
      .join(",");
  });
  return [header, ...body].join("\n");
}
