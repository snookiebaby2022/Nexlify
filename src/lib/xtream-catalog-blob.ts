import { StreamType } from "@prisma/client";
import type { LineWithBouquets } from "@/lib/lines";
import {
  activeBouquetIds,
  forEachLeanListingBatch,
  lineBouquetCacheToken,
} from "@/lib/lines";
import {
  catalogBlobPath,
  catalogFileAgeMs,
  catalogFileIsFresh,
  CATALOG_BLOB_VERSION,
  hashCatalogKey,
  withCatalogBuildLock,
  writeGzipJsonArrayFile,
} from "@/lib/catalog-disk-cache";
import { excludeDisabledFromExport } from "@/lib/export-policy";
import { buildCanonicalCategoryMaps, isXtreamAllCategoryParam } from "@/lib/xtream-category-canonical";
import {
  catalogStreamType,
  mapXtreamLiveItem,
  mapXtreamSeriesItem,
  mapXtreamVodItem,
} from "@/lib/xtream-catalog-items";
import { forEachSeriesSeedBatch } from "@/lib/xtream-stream-id";
import { iptvGzipFileResponse } from "@/lib/iptv-json";
import type { NextResponse } from "next/server";
import { yieldEventLoop } from "@/lib/yield-event-loop";

export type XtreamCatalogKind = "live" | "vod" | "series";

type CategoryFilter = string[] | "uncategorized" | "all" | "missing";

async function resolveCategoryFilter(
  kind: XtreamCatalogKind,
  categoryId?: string | null
): Promise<CategoryFilter> {
  if (isXtreamAllCategoryParam(categoryId)) return "all";
  const { resolveXtreamCategoryFilter } = await import("@/lib/xtream");
  const resolved = await resolveXtreamCategoryFilter(categoryId!, catalogStreamType(kind));
  return resolved === "all" ? "all" : resolved;
}

function filterCachePart(filter: CategoryFilter): string {
  if (filter === "all") return "all";
  if (filter === "uncategorized") return "uncat";
  if (filter === "missing") return "missing";
  return hashCatalogKey(filter.slice().sort());
}

export function xtreamCatalogBlobName(
  kind: XtreamCatalogKind,
  bouquetToken: string,
  filter: CategoryFilter,
  excludeDisabled: boolean
): string {
  const key = hashCatalogKey([
    CATALOG_BLOB_VERSION,
    kind,
    bouquetToken,
    filterCachePart(filter),
    excludeDisabled ? "1" : "0",
  ]);
  return `xtream-${kind}-${key}.json.gz`;
}

async function buildCatalogGzip(
  destPath: string,
  kind: XtreamCatalogKind,
  line: LineWithBouquets,
  filter: CategoryFilter,
  excludeDisabled: boolean,
  onFirstLiveIds?: (ids: string[]) => void
): Promise<void> {
  if (filter === "missing") {
    await writeGzipJsonArrayFile(destPath, async () => undefined);
    return;
  }

  const listingOpts = {
    excludeDisabled,
    type: catalogStreamType(kind),
    lean: true as const,
    uncategorizedOnly: filter === "uncategorized",
    categoryIds: Array.isArray(filter) ? filter : undefined,
  };

  if (kind === "series") {
    const bouquetIds = activeBouquetIds(line, excludeDisabled);
    const canonical = await buildCanonicalCategoryMaps(StreamType.SERIES);
    let index = 0;
    await writeGzipJsonArrayFile(destPath, async (writeItem) => {
      await forEachSeriesSeedBatch(
        bouquetIds,
        {
          uncategorizedOnly: filter === "uncategorized",
          categoryIds: Array.isArray(filter) ? filter : undefined,
        },
        async (batch) => {
          for (const seed of batch) {
            await writeItem(mapXtreamSeriesItem(seed, index, canonical));
            index += 1;
          }
        }
      );
    });
    return;
  }

  const canonical = await buildCanonicalCategoryMaps(
    kind === "vod" ? StreamType.MOVIE : StreamType.LIVE
  );
  let index = 0;
  const firstLiveIds: string[] = [];
  await writeGzipJsonArrayFile(destPath, async (writeItem) => {
    await forEachLeanListingBatch(line, listingOpts, async (batch) => {
      for (const stream of batch) {
        const mapped =
          kind === "vod"
            ? mapXtreamVodItem(stream, index, canonical)
            : mapXtreamLiveItem(stream, index, canonical);
        await writeItem(mapped);
        if (kind === "live" && firstLiveIds.length < 5) firstLiveIds.push(stream.id);
        index += 1;
      }
    });
  });
  if (kind === "live" && firstLiveIds.length) onFirstLiveIds?.(firstLiveIds);
  await yieldEventLoop();
}

/**
 * Serve get_live_streams / get_vod_streams / get_series from a bouquet-keyed
 * gzip blob. Shared by every line on the same bouquets — does not JSON.stringify
 * hundreds of thousands of rows on the request path after the first build.
 */
export async function serveXtreamCatalogJson(
  kind: XtreamCatalogKind,
  line: LineWithBouquets,
  req: Request,
  categoryId?: string | null,
  onFirstLiveIds?: (ids: string[]) => void
): Promise<NextResponse> {
  const excludeDisabled = await excludeDisabledFromExport();
  const filter = await resolveCategoryFilter(kind, categoryId);
  const name = xtreamCatalogBlobName(
    kind,
    lineBouquetCacheToken(line, excludeDisabled),
    filter,
    excludeDisabled
  );
  const destPath = catalogBlobPath(name);
  const age = await catalogFileAgeMs(destPath);

  const rebuild = async () => {
    const result = await withCatalogBuildLock(destPath, async () => {
      await buildCatalogGzip(destPath, kind, line, filter, excludeDisabled, onFirstLiveIds);
      return "built" as const;
    });
    if (result === "existing") return;
  };

  if (age != null) {
    if (!catalogFileIsFresh(age)) {
      void rebuild().catch((err) => {
        console.error("[xtream-catalog] background rebuild failed:", err instanceof Error ? err.message : err);
      });
    }
    return iptvGzipFileResponse(destPath, req, "application/json; charset=utf-8");
  }

  await rebuild();
  return iptvGzipFileResponse(destPath, req, "application/json; charset=utf-8");
}

/**
 * XCIPTV Update Content calls user_info / categories before get_live_streams.
 * Start gzip blobs then so the catalog request is a file stream, not a cold SQL build.
 */
export function warmXtreamCatalogs(line: LineWithBouquets): void {
  void (async () => {
    const excludeDisabled = await excludeDisabledFromExport();
    const token = lineBouquetCacheToken(line, excludeDisabled);
    // Sequential — parallel live+vod+series SQL rebuilds stall category/info APIs.
    for (const kind of ["live", "vod", "series"] as const) {
      const destPath = catalogBlobPath(xtreamCatalogBlobName(kind, token, "all", excludeDisabled));
      const age = await catalogFileAgeMs(destPath);
      if (age != null) continue;
      await withCatalogBuildLock(destPath, async () => {
        const again = await catalogFileAgeMs(destPath);
        if (again != null) return "existing" as const;
        await buildCatalogGzip(destPath, kind, line, "all", excludeDisabled);
        return "built" as const;
      });
    }
  })().catch((err) => {
    console.error("[xtream-catalog] warm failed:", err instanceof Error ? err.message : err);
  });
}
