/**
 * XUI.one / Xtream-lineage extras that the base SQL mapper does not cover:
 * - streams_sys → per-stream server assignment
 * - series + series_episodes → SERIES stream rows
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
    const parsed = JSON.parse(s);
    return streamUrlsFromSource(parsed);
  } catch {
    return { primary: s };
  }
}

/**
 * Merge XUI `streams_sys` (stream_id, server_id, …) onto stream rows when
 * `server_id` is missing on the stream itself.
 */
export function enrichStreamsFromSys(
  allTables: Map<string, SqlTableData[]>,
  streams: SqlTableData | null
): { streams: SqlTableData | null; warnings: string[] } {
  const warnings: string[] = [];
  if (!streams) return { streams, warnings };

  const sys = findMerged(allTables, [
    "streams_sys",
    "stream_sys",
    "streams_servers",
    "stream_servers",
  ]);
  if (!sys) return { streams, warnings };

  const byStream = new Map<string, string>();
  for (const row of sys.rows) {
    const r = rowToRecord(sys.columns, row);
    const sid = String(r.stream_id ?? r.id ?? "");
    const serverId = String(r.server_id ?? r.streaming_server_id ?? "");
    if (!sid || !serverId || serverId === "0") continue;
    // Prefer the first server assignment; XUI may have multi-server rows.
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
      `Applied server_id from streams_sys for ${filled} stream(s) (${byStream.size} sys mappings).`
    );
  }
  return { streams, warnings };
}

/**
 * Map XUI `series` + `series_episodes` into SERIES stream rows (episodes with URLs).
 */
export function mapSeriesEpisodesFromSql(
  allTables: Map<string, SqlTableData[]>,
  source: MigrationSource,
  existingStreamIds: Set<string>
): { streams: MigrationStreamRow[]; warnings: string[] } {
  const warnings: string[] = [];
  const episodes = findMerged(allTables, [
    "series_episodes",
    "episodes",
    "streams_series",
  ]);
  if (!episodes) return { streams: [], warnings };

  const seriesTable = findMerged(allTables, ["series", "tv_series"]);
  const seriesNameById = new Map<string, string>();
  const seriesCategoryById = new Map<string, string>();
  const seriesIconById = new Map<string, string>();
  if (seriesTable) {
    for (const row of seriesTable.rows) {
      const r = rowToRecord(seriesTable.columns, row);
      const id = String(r.id ?? "");
      if (!id) continue;
      const title = String(r.title ?? r.name ?? r.series_name ?? "").trim();
      if (title) seriesNameById.set(id, title);
      const cat = flattenIdList(r.category_id)[0];
      if (cat) seriesCategoryById.set(id, cat);
      if (r.cover) seriesIconById.set(id, String(r.cover));
      else if (r.stream_icon) seriesIconById.set(id, String(r.stream_icon));
    }
  }

  const out: MigrationStreamRow[] = [];
  for (const row of episodes.rows) {
    const r = rowToRecord(episodes.columns, row);
    const epId = String(r.id ?? r.episode_id ?? "");
    const legacyId = epId ? `series_ep_${epId}` : "";
    if (!legacyId || existingStreamIds.has(legacyId) || existingStreamIds.has(epId)) continue;

    const { primary: url, backup } = streamUrlsFromSource(
      r.stream_source ?? r.source ?? r.url ?? r.stream_url
    );
    if (!url) continue;

    const seriesId = String(r.series_id ?? r.show_id ?? "");
    const seriesName =
      seriesNameById.get(seriesId) ||
      String(r.series_name ?? r.title ?? r.name ?? "").trim() ||
      (seriesId ? `Series ${seriesId}` : "Series");
    const seasonNum = Number(r.season_num ?? r.season ?? r.season_number ?? NaN);
    const episodeNum = Number(r.episode_num ?? r.episode ?? r.episode_number ?? NaN);
    const epTitle = String(r.title ?? r.name ?? "").trim();
    const name =
      epTitle ||
      (Number.isFinite(seasonNum) && Number.isFinite(episodeNum)
        ? `${seriesName} S${seasonNum}E${episodeNum}`
        : `${seriesName} episode ${epId}`);

    out.push({
      legacyId,
      name,
      streamUrl: url,
      backupUrl: backup,
      type: "SERIES",
      streamIcon: r.stream_icon
        ? String(r.stream_icon)
        : seriesIconById.get(seriesId),
      categoryLegacyId:
        flattenIdList(r.category_id)[0] ?? seriesCategoryById.get(seriesId),
      seriesName,
      seasonNum: Number.isFinite(seasonNum) && seasonNum > 0 ? seasonNum : undefined,
      episodeNum: Number.isFinite(episodeNum) && episodeNum > 0 ? episodeNum : undefined,
      containerExtension: r.container_extension
        ? String(r.container_extension)
        : r.target_container
          ? String(r.target_container)
          : undefined,
      isActive: Number(r.is_deleted ?? 0) !== 1,
      serverLegacyId:
        r.server_id != null && String(r.server_id) !== "0"
          ? String(r.server_id)
          : undefined,
      sortOrder: Number(r.sort_order ?? r.order ?? NaN) || undefined,
    });
  }

  if (out.length) {
    warnings.push(
      `Mapped ${out.length} series episode(s) from XUI series tables (${source}).`
    );
  }
  return { streams: out, warnings };
}
