import { StreamType } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const PLUGIN_BOUQUET_NAME = "Plugin imports";

export function preferredVodBouquetName(type: "MOVIE" | "SERIES"): string {
  return type === "MOVIE" ? "Movies" : "TV Series";
}

/** Pick an existing Movies / TV Series package bouquet (not a generic VOD dump). */
export function matchVodBouquetId(
  type: "MOVIE" | "SERIES",
  bouquets: { id: string; name: string }[]
): string | null {
  const patterns =
    type === "MOVIE"
      ? [/^movies$/i]
      : [/^tv\s*series$/i, /^tvseries$/i];
  for (const re of patterns) {
    const hit = bouquets.find((b) => re.test(b.name.trim()));
    if (hit) return hit.id;
  }
  return null;
}

export async function ensurePluginImportBouquetId(): Promise<string> {
  const existing = await prisma.bouquet.findFirst({
    where: { name: PLUGIN_BOUQUET_NAME },
    select: { id: true },
  });
  if (existing) return existing.id;

  const created = await prisma.bouquet.create({
    data: { name: PLUGIN_BOUQUET_NAME, isActive: true, sortOrder: 9000 },
    select: { id: true },
  });
  return created.id;
}

export async function findPluginImportBouquetId(): Promise<string | null> {
  const existing = await prisma.bouquet.findFirst({
    where: { name: PLUGIN_BOUQUET_NAME },
    select: { id: true },
  });
  return existing?.id ?? null;
}

export async function ensureVodBouquetId(type: "MOVIE" | "SERIES"): Promise<string> {
  const bouquets = await prisma.bouquet.findMany({ select: { id: true, name: true } });
  const existing = matchVodBouquetId(type, bouquets);
  if (existing) return existing;
  const name = preferredVodBouquetName(type);
  const created = await prisma.bouquet.create({
    data: { name, isActive: true, sortOrder: type === "MOVIE" ? 20 : 21 },
    select: { id: true },
  });
  return created.id;
}

export async function linkStreamToPluginBouquet(streamId: string, sortOrder = 9000) {
  const bouquetId = await ensurePluginImportBouquetId();
  await prisma.bouquetStream.upsert({
    where: { bouquetId_streamId: { bouquetId, streamId } },
    create: { bouquetId, streamId, sortOrder },
    update: { sortOrder },
  });
}

/** Movies → Movies bouquet, TV → TV Series bouquet; drop Plugin imports so apps don't list them twice. */
export async function linkStreamToVodBouquet(
  streamId: string,
  type: StreamType,
  sortOrder = 0
) {
  if (type !== StreamType.MOVIE && type !== StreamType.SERIES) {
    await linkStreamToPluginBouquet(streamId, sortOrder);
    return;
  }
  const kind = type === StreamType.SERIES ? "SERIES" : "MOVIE";
  const bouquetId = await ensureVodBouquetId(kind);
  await prisma.bouquetStream.upsert({
    where: { bouquetId_streamId: { bouquetId, streamId } },
    create: { bouquetId, streamId, sortOrder },
    update: { sortOrder },
  });
  const pluginId = await findPluginImportBouquetId();
  if (pluginId) {
    await prisma.bouquetStream.deleteMany({ where: { bouquetId: pluginId, streamId } });
  }
}

async function attachBouquetToAllActiveLines(bouquetId: string) {
  const lines = await prisma.line.findMany({
    where: { status: "ACTIVE" },
    select: { id: true },
  });
  const have = new Set<string>();
  for (let i = 0; i < lines.length; i += 500) {
    const chunk = lines.slice(i, i + 500).map((l) => l.id);
    const existing = await prisma.lineBouquet.findMany({
      where: { bouquetId, lineId: { in: chunk } },
      select: { lineId: true },
    });
    for (const row of existing) have.add(row.lineId);
  }
  const data = lines.filter((l) => !have.has(l.id)).map((l) => ({ lineId: l.id, bouquetId }));
  for (let i = 0; i < data.length; i += 500) {
    await prisma.lineBouquet.createMany({ data: data.slice(i, i + 500), skipDuplicates: true });
  }
}

/** Attach plugin bouquet to all active lines so synced content is playable immediately. */
export async function attachPluginBouquetToAllLines() {
  const bouquetId = await ensurePluginImportBouquetId();
  await attachBouquetToAllActiveLines(bouquetId);
}

export async function attachVodBouquetsToAllLines() {
  const movieId = await ensureVodBouquetId("MOVIE");
  const seriesId = await ensureVodBouquetId("SERIES");
  await attachBouquetToAllActiveLines(movieId);
  await attachBouquetToAllActiveLines(seriesId);
}

const LINK_CHUNK = 400;

export async function relinkPlexStreamsToVodBouquets(integrationId: string): Promise<{
  movies: number;
  series: number;
}> {
  const prefix = `nexlify://plex/${integrationId}/`;
  const movieBq = await ensureVodBouquetId("MOVIE");
  const seriesBq = await ensureVodBouquetId("SERIES");
  const pluginId = await findPluginImportBouquetId();
  const vodDump = await prisma.bouquet.findFirst({
    where: { name: { equals: "VOD", mode: "insensitive" } },
    select: { id: true },
  });

  const movieIds: string[] = [];
  const seriesIds: string[] = [];
  let cursor: string | undefined;
  for (;;) {
    const rows = await prisma.stream.findMany({
      where: { streamUrl: { startsWith: prefix }, type: { in: [StreamType.MOVIE, StreamType.SERIES] } },
      select: { id: true, type: true },
      take: 2000,
      orderBy: { id: "asc" },
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (!rows.length) break;
    for (const row of rows) {
      if (row.type === StreamType.MOVIE) movieIds.push(row.id);
      else seriesIds.push(row.id);
    }
    cursor = rows[rows.length - 1]!.id;
    if (rows.length < 2000) break;
  }

  const unlinkIds = [pluginId, vodDump && vodDump.id !== movieBq && vodDump.id !== seriesBq ? vodDump.id : null].filter(
    (id): id is string => Boolean(id)
  );

  const link = async (ids: string[], bouquetId: string) => {
    for (let i = 0; i < ids.length; i += LINK_CHUNK) {
      const chunk = ids.slice(i, i + LINK_CHUNK);
      await prisma.bouquetStream.createMany({
        data: chunk.map((streamId) => ({ bouquetId, streamId, sortOrder: 0 })),
        skipDuplicates: true,
      });
      for (const extraId of unlinkIds) {
        if (extraId === bouquetId) continue;
        await prisma.bouquetStream.deleteMany({
          where: { bouquetId: extraId, streamId: { in: chunk } },
        });
      }
    }
  };

  await link(movieIds, movieBq);
  await link(seriesIds, seriesBq);
  return { movies: movieIds.length, series: seriesIds.length };
}
