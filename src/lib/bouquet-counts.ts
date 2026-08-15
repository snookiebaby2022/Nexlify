/** Count streams in a bouquet by content type (XUI-style columns). */
import { Prisma } from "@prisma/client";

export type BouquetContentCounts = {
  streams: number;
  movies: number;
  series: number;
  stations: number;
  total: number;
};

export function bouquetContentCounts(
  streams: { stream: { type: string; isRadio?: boolean } }[]
): BouquetContentCounts {
  let live = 0;
  let movies = 0;
  let series = 0;
  let stations = 0;
  for (const row of streams) {
    const s = row.stream;
    if (s.isRadio) stations += 1;
    else if (s.type === "MOVIE") movies += 1;
    else if (s.type === "SERIES") series += 1;
    else live += 1;
  }
  return {
    streams: live,
    movies,
    series,
    stations,
    total: streams.length,
  };
}

export function emptyBouquetContentCounts(): BouquetContentCounts {
  return { streams: 0, movies: 0, series: 0, stations: 0, total: 0 };
}

type PrismaRaw = {
  $queryRaw: <T = unknown>(query: TemplateStringsArray, ...values: unknown[]) => Promise<T>;
};

/** Fast per-bouquet counts without loading every BouquetStream row into memory. */
export async function bouquetContentCountsByBouquetId(
  prisma: PrismaRaw,
  bouquetIds?: string[]
): Promise<Map<string, BouquetContentCounts>> {
  type Row = {
    bouquetId: string;
    streams: number;
    movies: number;
    series: number;
    stations: number;
    total: number;
  };

  const rows =
    bouquetIds && bouquetIds.length > 0
      ? await prisma.$queryRaw<Row[]>`
          SELECT
            bs."bouquetId" AS "bouquetId",
            COUNT(*) FILTER (WHERE s."isRadio" = false AND s.type = 'LIVE')::int AS streams,
            COUNT(*) FILTER (WHERE s."isRadio" = false AND s.type = 'MOVIE')::int AS movies,
            COUNT(*) FILTER (WHERE s."isRadio" = false AND s.type = 'SERIES')::int AS series,
            COUNT(*) FILTER (WHERE s."isRadio" = true)::int AS stations,
            COUNT(*)::int AS total
          FROM "BouquetStream" bs
          INNER JOIN "Stream" s ON s.id = bs."streamId"
          WHERE bs."bouquetId" IN (${Prisma.join(bouquetIds)})
          GROUP BY bs."bouquetId"
        `
      : await prisma.$queryRaw<Row[]>`
          SELECT
            bs."bouquetId" AS "bouquetId",
            COUNT(*) FILTER (WHERE s."isRadio" = false AND s.type = 'LIVE')::int AS streams,
            COUNT(*) FILTER (WHERE s."isRadio" = false AND s.type = 'MOVIE')::int AS movies,
            COUNT(*) FILTER (WHERE s."isRadio" = false AND s.type = 'SERIES')::int AS series,
            COUNT(*) FILTER (WHERE s."isRadio" = true)::int AS stations,
            COUNT(*)::int AS total
          FROM "BouquetStream" bs
          INNER JOIN "Stream" s ON s.id = bs."streamId"
          GROUP BY bs."bouquetId"
        `;

  const map = new Map<string, BouquetContentCounts>();
  for (const r of rows) {
    map.set(String(r.bouquetId), {
      streams: Number(r.streams) || 0,
      movies: Number(r.movies) || 0,
      series: Number(r.series) || 0,
      stations: Number(r.stations) || 0,
      total: Number(r.total) || 0,
    });
  }
  return map;
}
