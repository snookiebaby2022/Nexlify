/**
 * XUI.one / Xtream-lineage extras:
 * - streams_servers → server assignment
 * - streams_types → live/movie/series/radio type keys
 * - streams_series + streams_episodes → SERIES episode metadata
 */

import type { MigrationSource, MigrationStreamRow } from "./types";
import { mergeSqlTables, rowToRecord, type SqlTableData } from "./sql-parse";
import { flattenIdList } from "./sql-junctions";

function findMerged(
  allTables: Map<string, SqlTableData[]>,
  names: string[]
): SqlTableData | null {
  for (const name of names) {
    const chunks = allTables.get(name.toLowerCase()) ?? [];
    const merged = mergeSqlTables(chunks);
    if (merged && merged.rows.length) return merged;
  }
  return null;
}

function streamUrlsFromSource(val: unknown): { primary: string; backup?: string } {
  if (val == null || val === "") return { primary: "" };
  if (Array.isArray(val)) {
    const urls = val.map((x) => String(x ?? "").trim()).filter(Boolean);
    return { primary: urls[0] ?? "", backup: urls[1] };
  }
  const s = String(val).trim();
  if (!s) return { primary: "" };
  try {
    return streamUrlsFromSource(JSON.parse(s));
  } catch {
    return { primary: s };
  }
}

/** Map streams_types id / type_key → LIVE | MOVIE | SERIES (+ radio flag). */
export function loadStreamsTypeMap(
  allTables: Map<string, SqlTableData[]>
): Map<string, { type: "LIVE" | "MOVIE" | "SERIES"; isRadio?: boolean }> {
  const out = new Map<string, { type: "LIVE" | "MOVIE" | "SERIES"; isRadio?: boolean }>();
  const table = findMerged(allTables, ["streams_types", "stream_types", "types"]);
  if (!table) {
    // Classic XC/XUI numeric defaults
    out.set("1", { type: "LIVE" });
    out.set("2", { type: "MOVIE" });
    out.set("3", { type: "LIVE" }); // created live
    out.set("4", { type: "LIVE", isRadio: true });
    out.set("5", { type: "SERIES" });
    return out;
  }
  for (const row of table.rows) {
    const r = rowToRecord(table.columns, row);
    const id = String(r.id ?? r.type_id ?? "");
    const key = String(
      r.type_key ?? r.key ?? r.type_name ?? r.name ?? r.type ?? ""
    ).toLowerCase();
    let type: "LIVE" | "MOVIE" | "SERIES" = "LIVE";
    let isRadio = false;
    if (
      key.includes("movie") ||
      key.includes("vod") ||
      key === "2" ||
      Number(r.type_output ?? r.stream_type) === 2
    ) {
      type = "MOVIE";
    } else if (key.includes("series") || key.includes("episode") || key === "5") {
      type = "SERIES";
    } else if (key.includes("radio") || key === "4") {
      type = "LIVE";
      isRadio = true;
    } else {
      type = "LIVE";
    }
    if (id) out.set(id, { type, isRadio });
    if (key) out.set(key, { type, isRadio });
  }
  // Ensure classic fallbacks exist
  if (!out.has("1")) out.set("1", { type: "LIVE" });
  if (!out.has("2")) out.set("2", { type: "MOVIE" });
  if (!out.has("5")) out.set("5", { type: "SERIES" });
  if (!out.has("4")) out.set("4", { type: "LIVE", isRadio: true });
  return out;
}

export function resolveStreamType(
  typeVal: unknown,
  typeMap: Map<string, { type: "LIVE" | "MOVIE" | "SERIES"; isRadio?: boolean }>
): { type: "LIVE" | "MOVIE" | "SERIES"; isRadio: boolean } {
  const raw = String(typeVal ?? "").trim();
  const lower = raw.toLowerCase();
  const fromMap = typeMap.get(raw) ?? typeMap.get(lower);
  if (fromMap) return { type: fromMap.type, isRadio: Boolean(fromMap.isRadio) };

  const n = Number(typeVal);
  if (n === 2) return { type: "MOVIE", isRadio: false };
  if (n === 5) return { type: "SERIES", isRadio: false };
  if (n === 4) return { type: "LIVE", isRadio: true };
  if (lower.includes("movie") || lower === "vod") return { type: "MOVIE", isRadio: false };
  if (lower.includes("series") || lower.includes("episode"))
    return { type: "SERIES", isRadio: false };
  if (lower.includes("radio")) return { type: "LIVE", isRadio: true };
  return { type: "LIVE", isRadio: false };
}

export function enrichStreamsFromSys(
  allTables: Map<string, SqlTableData[]>,
  streams: SqlTableData | null
): { streams: SqlTableData | null; warnings: string[] } {
  const warnings: string[] = [];
  if (!streams) return { streams, warnings };

  const sys = findMerged(allTables, [
    "streams_servers",
    "streams_sys",
    "stream_sys",
    "stream_servers",
  ]);
  if (!sys) return { streams, warnings };

  const byStream = new Map<string, string>();
  for (const row of sys.rows) {
    const r = rowToRecord(sys.columns, row);
    const sid = String(r.stream_id ?? r.id ?? "");
    const serverId = String(r.server_id ?? r.streaming_server_id ?? "");
    if (!sid || !serverId || serverId === "0") continue;
    if (!byStream.has(sid)) byStream.set(sid, serverId);
  }
  if (!byStream.size) return { streams, warnings };

  let serverIdx = streams.columns.findIndex((c) => c === "server_id");
  if (serverIdx < 0) {
    streams.columns.push("server_id");
    serverIdx = streams.columns.length - 1;
    for (const row of streams.rows) row.push(null);
  }
  const idIdx = streams.columns.findIndex((c) => c === "id" || c === "stream_id");
  let filled = 0;
  for (const row of streams.rows) {
    const id = idIdx >= 0 ? String(row[idIdx] ?? "") : "";
    const existing = row[serverIdx];
    if (existing != null && String(existing) !== "" && String(existing) !== "0") continue;
    const mapped = byStream.get(id);
    if (!mapped) continue;
    row[serverIdx] = mapped;
    filled++;
  }
  if (filled) {
    warnings.push(
      `Applied server_id from streams_servers/sys for ${filled} stream(s) (${byStream.size} mappings).`
    );
  }
  return { streams, warnings };
}

type SeriesMeta = {
  name: string;
  categoryLegacyId?: string;
  icon?: string;
};

function loadSeriesMeta(allTables: Map<string, SqlTableData[]>): Map<string, SeriesMeta> {
  const seriesTable = findMerged(allTables, [
    "streams_series",
    "series",
    "tv_series",
  ]);
  const out = new Map<string, SeriesMeta>();
  if (!seriesTable) return out;
  for (const row of seriesTable.rows) {
    const r = rowToRecord(seriesTable.columns, row);
    const id = String(r.id ?? r.series_id ?? "");
    if (!id) continue;
    const title = String(
      r.title ?? r.name ?? r.series_name ?? r.stream_display_name ?? ""
    ).trim();
    out.set(id, {
      name: title || `Series ${id}`,
      categoryLegacyId: flattenIdList(r.category_id)[0],
      icon: r.cover
        ? String(r.cover)
        : r.stream_icon
          ? String(r.stream_icon)
          : r.image
            ? String(r.image)
            : undefined,
    });
  }
  return out;
}

/**
 * Enrich/create SERIES episode streams from streams_episodes + streams_series.
 * Modern XUI.one: episode rows usually point at an existing `streams.id` via stream_id.
 */
export function mapSeriesEpisodesFromSql(
  allTables: Map<string, SqlTableData[]>,
  source: MigrationSource,
  existingStreams: MigrationStreamRow[]
): { streams: MigrationStreamRow[]; warnings: string[] } {
  const warnings: string[] = [];
  const episodes = findMerged(allTables, [
    "streams_episodes",
    "series_episodes",
    "episodes",
  ]);
  if (!episodes) {
    const seriesOnly = loadSeriesMeta(allTables);
    if (seriesOnly.size) {
      warnings.push(
        `Found ${seriesOnly.size} TV series in streams_series but no streams_episodes table to link episodes.`
      );
    }
    return { streams: [], warnings };
  }

  const seriesMeta = loadSeriesMeta(allTables);
  const byLegacy = new Map(existingStreams.map((s) => [s.legacyId, s]));
  const existingIds = new Set(existingStreams.map((s) => s.legacyId));
  const created: MigrationStreamRow[] = [];
  let enriched = 0;

  for (const row of episodes.rows) {
    const r = rowToRecord(episodes.columns, row);
    const epId = String(r.id ?? r.episode_id ?? "");
    const linkedStreamId = String(
      r.stream_id ?? r.episode_stream_id ?? r.movie_stream_id ?? ""
    );
    const seriesId = String(r.series_id ?? r.show_id ?? r.seriesid ?? "");
    const meta = seriesId ? seriesMeta.get(seriesId) : undefined;
    const seriesName =
      meta?.name ||
      String(r.series_name ?? "").trim() ||
      (seriesId ? `Series ${seriesId}` : "Series");

    // season may be season_num OR season_id (numeric) OR nested in season JSON
    let seasonNum = Number(
      r.season_num ?? r.season ?? r.season_number ?? r.season_id ?? r.seasonid ?? NaN
    );
    let episodeNum = Number(
      r.episode_num ??
        r.episode ??
        r.episode_number ??
        r.sort ??
        r.sort_order ??
        r.order ??
        NaN
    );
    // Some dumps store episode index only; keep finite positives
    if (!Number.isFinite(seasonNum) || seasonNum <= 0) seasonNum = NaN;
    if (!Number.isFinite(episodeNum) || episodeNum <= 0) episodeNum = NaN;

    const epTitle = String(
      r.title ?? r.name ?? r.episode_name ?? r.stream_display_name ?? ""
    ).trim();

    if (linkedStreamId && byLegacy.has(linkedStreamId)) {
      const s = byLegacy.get(linkedStreamId)!;
      s.type = "SERIES";
      s.seriesName = seriesName;
      if (Number.isFinite(seasonNum)) s.seasonNum = seasonNum;
      if (Number.isFinite(episodeNum)) s.episodeNum = episodeNum;
      if (!s.categoryLegacyId && meta?.categoryLegacyId) {
        s.categoryLegacyId = meta.categoryLegacyId;
      }
      if (!s.streamIcon && meta?.icon) s.streamIcon = meta.icon;
      if (!s.containerExtension) s.containerExtension = "mp4";
      // Prefer a clear episode label when the stream name is generic
      if (epTitle) {
        s.name = epTitle;
      } else if (Number.isFinite(seasonNum) && Number.isFinite(episodeNum)) {
        s.name = `${seriesName} S${String(seasonNum).padStart(2, "0")}E${String(episodeNum).padStart(2, "0")}`;
      } else if (seriesName && !s.name.toLowerCase().includes(seriesName.toLowerCase())) {
        s.name = `${seriesName} — ${s.name}`;
      }
      enriched++;
      continue;
    }

    const { primary: url, backup } = streamUrlsFromSource(
      r.stream_source ?? r.source ?? r.url ?? r.stream_url
    );
    if (!url) continue;

    const legacyId = epId ? `series_ep_${epId}` : linkedStreamId ? `series_ep_stream_${linkedStreamId}` : "";
    if (!legacyId || existingIds.has(legacyId)) continue;

    const name =
      epTitle ||
      (Number.isFinite(seasonNum) && Number.isFinite(episodeNum)
        ? `${seriesName} S${String(seasonNum).padStart(2, "0")}E${String(episodeNum).padStart(2, "0")}`
        : `${seriesName} episode ${epId || linkedStreamId}`);

    created.push({
      legacyId,
      name,
      streamUrl: url,
      backupUrl: backup,
      type: "SERIES",
      streamIcon: r.stream_icon ? String(r.stream_icon) : meta?.icon,
      categoryLegacyId: flattenIdList(r.category_id)[0] ?? meta?.categoryLegacyId,
      seriesName,
      seasonNum: Number.isFinite(seasonNum) ? seasonNum : undefined,
      episodeNum: Number.isFinite(episodeNum) ? episodeNum : undefined,
      containerExtension: r.container_extension
        ? String(r.container_extension)
        : r.target_container
          ? String(r.target_container)
          : "mp4",
      isActive: Number(r.is_deleted ?? 0) !== 1,
      serverLegacyId:
        r.server_id != null && String(r.server_id) !== "0"
          ? String(r.server_id)
          : undefined,
      sortOrder: Number(r.sort_order ?? r.order ?? NaN) || undefined,
    });
    existingIds.add(legacyId);
  }

  if (enriched) {
    warnings.push(
      `Tagged ${enriched} TV episode stream(s) from streams_episodes (${seriesMeta.size} series catalog rows, ${source}).`
    );
  }
  if (created.length) {
    warnings.push(`Created ${created.length} TV episode stream(s) from episode URLs (${source}).`);
  }
  if (!enriched && !created.length && seriesMeta.size) {
    warnings.push(
      `Found ${seriesMeta.size} series in streams_series and ${episodes.rows.length} episode rows, but none linked via stream_id/stream_source — check streams_episodes columns.`
    );
  }

  return { streams: created, warnings };
}

/** Ensure MOVIE streams get a container extension when missing. */
export function finalizeVodStreamDefaults(streams: MigrationStreamRow[]): void {
  for (const s of streams) {
    if (s.type === "MOVIE" || s.type === "SERIES") {
      if (!s.containerExtension) s.containerExtension = "mp4";
    }
  }
}
