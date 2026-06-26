export type VodImportRow = {
  name: string;
  source: string;
  category?: string;
  stream_icon?: string;
  container_extension?: string;
  series_name?: string;
  season_num?: number;
  episode_num?: number;
  provider_id?: string;
  provider_path?: string;
  hosted_externally?: boolean;
};

function normalizeRow(raw: Record<string, unknown>): VodImportRow | null {
  const name = String(raw.name ?? raw.title ?? "").trim();
  const source = String(raw.source ?? raw.url ?? raw.stream_url ?? raw.path ?? "").trim();
  if (!name || !source) return null;

  const season = raw.season_num ?? raw.season ?? raw.seasonNum;
  const episode = raw.episode_num ?? raw.episode ?? raw.episodeNum;

  return {
    name,
    source,
    category: raw.category ? String(raw.category) : undefined,
    stream_icon: raw.stream_icon
      ? String(raw.stream_icon)
      : raw.streamIcon
        ? String(raw.streamIcon)
        : undefined,
    container_extension: raw.container_extension
      ? String(raw.container_extension)
      : raw.containerExtension
        ? String(raw.containerExtension)
        : undefined,
    series_name: raw.series_name
      ? String(raw.series_name)
      : raw.seriesName
        ? String(raw.seriesName)
        : undefined,
    season_num: season != null ? Number(season) : undefined,
    episode_num: episode != null ? Number(episode) : undefined,
    provider_id: raw.provider_id
      ? String(raw.provider_id)
      : raw.providerId
        ? String(raw.providerId)
        : undefined,
    provider_path: raw.provider_path
      ? String(raw.provider_path)
      : raw.providerPath
        ? String(raw.providerPath)
        : undefined,
    hosted_externally:
      raw.hosted_externally != null
        ? Boolean(raw.hosted_externally)
        : raw.hostedExternally != null
          ? Boolean(raw.hostedExternally)
          : undefined,
  };
}

/** Parse JSON array or JSONL (one object per line) VOD import files. */
export function parseVodImportFile(content: string): VodImportRow[] {
  const trimmed = content.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith("[")) {
    const arr = JSON.parse(trimmed) as unknown;
    if (!Array.isArray(arr)) throw new Error("JSON root must be an array");
    return arr
      .map((item) => normalizeRow(item as Record<string, unknown>))
      .filter((r): r is VodImportRow => r != null);
  }

  const rows: VodImportRow[] = [];
  for (const line of trimmed.split(/\r?\n/)) {
    const l = line.trim();
    if (!l || l.startsWith("#")) continue;
    const obj = JSON.parse(l) as Record<string, unknown>;
    const row = normalizeRow(obj);
    if (row) rows.push(row);
  }
  return rows;
}

export const VOD_IMPORT_FORMAT_EXAMPLE = `[
  {
    "name": "Example Movie",
    "source": "/media/movies/example.mp4",
    "category": "Action",
    "stream_icon": "https://example.com/poster.jpg",
    "container_extension": "mp4"
  },
  {
    "name": "Hosted Movie",
    "provider_id": "clxxx_provider_id",
    "provider_path": "movies/12345.mp4",
    "hosted_externally": true
  }
]`;

export const VOD_EPISODE_IMPORT_EXAMPLE = `[
  {
    "name": "Pilot",
    "source": "/media/series/My Show/Season 01/S01E01.mkv",
    "series_name": "My Show",
    "season_num": 1,
    "episode_num": 1,
    "container_extension": "mkv"
  }
]`;
