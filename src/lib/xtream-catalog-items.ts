import { StreamType } from "@prisma/client";
import type { StreamForLine } from "@/lib/lines";
import type { SeriesSeedRow } from "@/lib/xtream-stream-id";
import type { CanonicalCategoryMaps } from "@/lib/xtream-category-canonical";
import { canonicalNumericForCategory } from "@/lib/xtream-category-canonical";
import { formatTimeshiftLabel } from "@/lib/stream-variants";
import { resolveEpgId } from "@/lib/subscription-export";
import {
  xtreamSafeText,
  xtreamUnix,
  xtreamCategoryIds,
  xtreamCatalogDirectSource,
  xtreamListingExtension,
} from "@/lib/xtream-safe";
import { cuidToNum } from "@/lib/xtream-stream-id";
import { xtreamListingRating } from "@/lib/vod-meta";

function exportCategoryNumericId(
  stream: { type: StreamType; categoryId?: string | null; categoryType?: string | null },
  canonical: CanonicalCategoryMaps,
  expected: "LIVE" | "MOVIE" | "SERIES" | "RADIO"
): string {
  if (!stream.categoryId) return "0";
  const folderType = stream.categoryType?.toUpperCase();
  if (folderType && folderType !== expected) return "0";
  if (expected === "LIVE") {
    if (stream.type !== StreamType.LIVE) return "0";
    if (folderType === "RADIO") return "0";
  }
  if (expected === "MOVIE" && stream.type !== StreamType.MOVIE) return "0";
  if (expected === "SERIES" && stream.type !== StreamType.SERIES) return "0";
  if (expected === "RADIO") {
    if (stream.type !== StreamType.LIVE || folderType !== "RADIO") return "0";
  }
  return canonicalNumericForCategory(canonical, stream.categoryId);
}

export function mapXtreamLiveItem(
  s: StreamForLine,
  index: number,
  canonical: CanonicalCategoryMaps
) {
  const catchup = s.vodMode === "CATCHUP" || s.isShifted;
  const archiveDays = s.archiveDays ?? 0;
  const timeshiftHours = s.timeshiftSeconds ? Math.ceil(s.timeshiftSeconds / 3600) : 0;
  const shiftLabel = formatTimeshiftLabel(s.timeshiftSeconds);
  const numCategoryId = exportCategoryNumericId(s, canonical, "LIVE");
  const name = xtreamSafeText(shiftLabel ? `${s.name} (${shiftLabel})` : s.name) || "Live";
  return {
    num: index + 1,
    name,
    stream_type: "live" as const,
    stream_id: cuidToNum(s.id),
    stream_icon: xtreamSafeText(s.streamIcon),
    epg_channel_id: xtreamSafeText(resolveEpgId(s)),
    epg_id: xtreamSafeText(resolveEpgId(s)),
    added: xtreamUnixString(s.createdAt),
    category_id: numCategoryId,
    category_ids: xtreamCategoryIds(numCategoryId),
    custom_sid: "",
    tv_archive: catchup || timeshiftHours > 0 ? 1 : 0,
    direct_source: xtreamCatalogDirectSource(),
    tv_archive_duration: catchup ? archiveDays || timeshiftHours || 7 : timeshiftHours || 0,
    updated_at: xtreamUnix(s.updatedAt),
  };
}

export function mapXtreamVodItem(
  s: StreamForLine,
  index: number,
  canonical: CanonicalCategoryMaps
) {
  const numCategoryId = exportCategoryNumericId(s, canonical, "MOVIE");
  const stars = xtreamListingRating(s.vodRating);
  const icon = xtreamSafeText(s.streamIcon);
  const added = xtreamUnix(s.createdAt) || xtreamUnix(s.updatedAt);
  return {
    num: index + 1,
    name: xtreamSafeText(s.name) || "Movie",
    stream_type: "movie" as const,
    stream_id: cuidToNum(s.id),
    stream_icon: icon,
    movie_image: icon,
    rating: stars.rating,
    rating_5based: stars.rating_5based,
    added: String(added),
    updated_at: added,
    last_modified: String(added),
    is_adult: s.isAdult ? 1 : 0,
    category_id: numCategoryId,
    category_ids: xtreamCategoryIds(numCategoryId),
    container_extension: xtreamListingExtension(
      s.containerExtension,
      "mp4",
      s.urlExt ?? s.streamUrl
    ),
    custom_sid: "",
    direct_source: xtreamCatalogDirectSource(),
  };
}

export function mapXtreamSeriesItem(
  s: SeriesSeedRow,
  index: number,
  canonical: CanonicalCategoryMaps
) {
  const numCategoryId = exportCategoryNumericId(
    { type: StreamType.SERIES, categoryId: s.categoryId },
    canonical,
    "SERIES"
  );
  const modified = xtreamUnix(s.updatedAt);
  const stars = xtreamListingRating(s.vodRating);
  const cover = xtreamSafeText(s.streamIcon);
  return {
    num: index + 1,
    name: xtreamSafeText(s.name) || "Series",
    series_id: cuidToNum(s.id),
    cover,
    cover_big: cover,
    plot: xtreamSafeText(s.vodPlot),
    cast: "",
    director: "",
    genre: "",
    releaseDate: "",
    last_modified: String(modified),
    rating: stars.rating,
    rating_5based: stars.rating_5based,
    backdrop_path: [] as string[],
    youtube_trailer: "",
    episode_run_time: "0",
    category_id: numCategoryId,
    category_ids: xtreamCategoryIds(numCategoryId),
  };
}

export function catalogStreamType(kind: "live" | "vod" | "series"): StreamType {
  if (kind === "vod") return StreamType.MOVIE;
  if (kind === "series") return StreamType.SERIES;
  return StreamType.LIVE;
}
