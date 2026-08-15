import { importFromM3uContent } from "./import-media";

export type M3uContentType = "LIVE" | "MOVIE" | "SERIES" | "MIXED";

export type M3uSyncOptions = {
  defaultType?: M3uContentType;
  categoryId?: string | null;
  serverId?: string | null;
  autoCategory?: boolean;
  autoTmdb?: boolean;
  /** LIVE imports only — default on-demand for panel M3U imports */
  defaultOnDemand?: boolean;
  sortOrderStart?: number;
  reorderExisting?: boolean;
};

export function isRemoteM3uUrl(source: string): boolean {
  return /^https?:\/\//i.test(source.trim());
}

/** Map watch-folder / sync-job type to import default. MIXED/M3U → guess per entry. */
export function resolveM3uDefaultType(
  folderType: string
): "LIVE" | "MOVIE" | "SERIES" | undefined {
  if (folderType === "MOVIE") return "MOVIE";
  if (folderType === "SERIES") return "SERIES";
  if (folderType === "LIVE") return "LIVE";
  return undefined;
}

export async function fetchM3uContent(url: string, timeoutMs = 120_000): Promise<string> {
  const res = await fetch(url.trim(), {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { "User-Agent": "Nexlify-M3U-Sync/1.0" },
  });
  if (!res.ok) throw new Error(`Failed to fetch M3U: HTTP ${res.status}`);
  const content = await res.text();
  if (!content.trim()) throw new Error("M3U response was empty");
  if (!content.includes("#EXTM3U") && !content.includes("#EXTINF:")) {
    throw new Error("Response does not look like an M3U playlist");
  }
  return content;
}

export async function syncM3uFromUrl(url: string, opts: M3uSyncOptions = {}) {
  const content = await fetchM3uContent(url);
  const forced = opts.defaultType === "MIXED" ? undefined : opts.defaultType;
  const isLive = forced === "LIVE";

  return importFromM3uContent(content, {
    defaultType: forced,
    categoryId: opts.categoryId,
    serverId: opts.serverId,
    autoCategory: opts.autoCategory !== false,
    autoTmdb: opts.autoTmdb !== false,
    defaultOnDemand: opts.defaultOnDemand ?? (isLive ? true : undefined),
    sortOrderStart: opts.sortOrderStart ?? 0,
    reorderExisting: opts.reorderExisting ?? true,
    // Keep live (and VOD) display names in sync with the upstream playlist.
    updateNamesOnSync: true,
  });
}
