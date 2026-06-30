/** Count streams in a bouquet by content type (XUI-style columns). */
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
