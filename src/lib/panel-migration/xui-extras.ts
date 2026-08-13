/**
 * XUI.one / Xtream-lineage extras that the base SQL mapper does not cover:
 * - streams_servers / streams_sys → per-stream server assignment
 * - streams_series + streams_episodes → SERIES metadata / episode streams
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
 * Merge XUI `streams_servers` / `streams_sys` onto stream rows when
 * `server_id` is missing on the stream itself.
 */
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
 * Modern XUI.one: episodes usually live as rows in `streams`, linked via
 * `streams_episodes` (stream_id + series_id + season/episode). Enrich those
 * existing streams with SERIES metadata. Also create rows from episodes that
 * carry their own stream_source (classic dumps).
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
  if (!episodes) return { streams: [], warnings };

  const seriesMeta = loadSeriesMeta(allTables);
  const byLegacy = new Map(existingStreams.map((s) => [s.legacyId, s]));
  const existingIds = new Set(existingStreams.map((s) => s.legacyId));
  const created: MigrationStreamRow[] = [];
  let enriched = 0;

  for (const row of episodes.rows) {
    const r = rowToRecord(episodes.columns, row);
    const epId = String(r.id ?? r.episode_id ?? "");
    const linkedStreamId = String(r.stream_id ?? r.episode_stream_id ?? "");
    const seriesId = String(r.series_id ?? r.show_id ?? "");
    const meta = seriesId ? seriesMeta.get(seriesId) : undefined;
    const seriesName =
      meta?.name ||
      String(r.series_name ?? "").trim() ||
      (seriesId ? `Series ${seriesId}` : "Series");
    const seasonNum = Number(
      r.season_num ?? r.season ?? r.season_number ?? r.seasonid ?? NaN
    );
    const episodeNum = Number(
      r.episode_num ?? r.episode ?? r.episode_number ?? r.sort ?? NaN
    );
    const epTitle = String(r.title ?? r.name ?? r.episode_name ?? "").trim();

    // Path A: episode points at an existing streams.id (modern XUI.one)
    if (linkedStreamId && byLegacy.has(linkedStreamId)) {
      const s = byLegacy.get(linkedStreamId)!;
      s.type = "SERIES";
      s.seriesName = seriesName;
      if (Number.isFinite(seasonNum) && seasonNum > 0) s.seasonNum = seasonNum;
      if (Number.isFinite(episodeNum) && episodeNum > 0) s.episodeNum = episodeNum;
      if (!s.categoryLegacyId && meta?.categoryLegacyId) {
        s.categoryLegacyId = meta.categoryLegacyId;
      }
      if (!s.streamIcon && meta?.icon) s.streamIcon = meta.icon;
      if (epTitle && !s.name.toLowerCase().includes(epTitle.toLowerCase())) {
        s.name = epTitle;
      }
      enriched++;
      continue;
    }

    // Path B: episode row has its own URL (classic / alternate dumps)
    const { primary: url, backup } = streamUrlsFromSource(
      r.stream_source ?? r.source ?? r.url ?? r.stream_url
    );
    if (!url) continue;

    const legacyId = epId ? `series_ep_${epId}` : "";
    if (!legacyId || existingIds.has(legacyId)) continue;

    const name =
      epTitle ||
      (Number.isFinite(seasonNum) && Number.isFinite(episodeNum)
        ? `${seriesName} S${seasonNum}E${episodeNum}`
        : `${seriesName} episode ${epId}`);

    const createdRow: MigrationStreamRow = {
      legacyId,
      name,
      streamUrl: url,
      backupUrl: backup,
      type: "SERIES",
      streamIcon: r.stream_icon ? String(r.stream_icon) : meta?.icon,
      categoryLegacyId:
        flattenIdList(r.category_id)[0] ?? meta?.categoryLegacyId,
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
    };
    created.push(createdRow);
    existingIds.add(legacyId);
  }

  // Series catalog rows with no episode URL still help naming — optional no-op.
  if (enriched) {
    warnings.push(
      `Enriched ${enriched} existing stream(s) with series/episode metadata from streams_episodes (${source}).`
    );
  }
  if (created.length) {
    warnings.push(
      `Mapped ${created.length} series episode stream(s) from episode tables (${source}).`
    );
  } else if (!enriched && seriesMeta.size) {
    warnings.push(
      `Found ${seriesMeta.size} series in streams_series but no linkable episodes (need stream_id or stream_source on streams_episodes).`
    );
  }

  return { streams: created, warnings };
}
