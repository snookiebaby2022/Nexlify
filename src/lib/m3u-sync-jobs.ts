import { prisma } from "./prisma";
import {
  isRemoteM3uUrl,
  resolveM3uDefaultType,
  syncM3uFromUrl,
  type M3uContentType,
} from "./m3u-watch-sync";
import { ImportKind } from "@prisma/client";

export type M3uSyncRunResult = {
  imported: number;
  skipped: number;
  errors?: string[];
};

/** Run one M3U sync from a remote provider URL (movies, series, live, or mixed). */
export async function runM3uUrlSync(
  url: string,
  opts: {
    contentType: string;
    categoryId?: string | null;
    serverId?: string | null;
    autoTmdb?: boolean;
    autoCategory?: boolean;
  }
): Promise<M3uSyncRunResult> {
  const forced = resolveM3uDefaultType(opts.contentType);
  const defaultType: M3uContentType =
    opts.contentType === "MIXED" || opts.contentType === "M3U"
      ? "MIXED"
      : forced ?? "MIXED";

  return syncM3uFromUrl(url, {
    defaultType,
    categoryId: opts.categoryId,
    serverId: opts.serverId,
    autoTmdb: opts.autoTmdb,
    autoCategory: opts.autoCategory,
    defaultOnDemand: defaultType === "LIVE" ? true : undefined,
  });
}

/** Process due scheduled M3uSyncJob rows (live + VOD provider playlists). */
export async function runDueM3uSyncJobs(limit = 5): Promise<{
  processed: number;
  imported: number;
  skipped: number;
  errors: string[];
}> {
  const now = new Date();
  const jobs = await prisma.m3uSyncJob.findMany({
    where: {
      status: "active",
      OR: [{ nextSyncAt: null }, { nextSyncAt: { lte: now } }],
    },
    orderBy: [{ nextSyncAt: "asc" }, { createdAt: "asc" }],
    take: limit,
  });

  let processed = 0;
  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const job of jobs) {
    if (!isRemoteM3uUrl(job.url)) {
      errors.push(`${job.name}: invalid URL`);
      await prisma.m3uSyncJob.update({
        where: { id: job.id },
        data: {
          lastResult: { error: "invalid URL", at: now.toISOString() },
          nextSyncAt: new Date(Date.now() + job.syncIntervalMins * 60_000),
        },
      });
      continue;
    }

    try {
      const contentType = String(job.streamType ?? "MIXED");
      const result = await runM3uUrlSync(job.url, {
        contentType,
        categoryId: job.categoryId,
        serverId: job.serverId,
        autoTmdb: job.autoTmdb,
        autoCategory: job.autoCategory,
      });

      imported += result.imported;
      skipped += result.skipped;
      processed++;

      if (job.autoAssignEpg !== false && result.imported > 0) {
        try {
          const { autoAssignMissingEpg } = await import("./epg-auto-match");
          await autoAssignMissingEpg({ limit: Math.min(500, Math.max(50, result.imported * 2)) });
        } catch {
          /* non-fatal */
        }
      }

      const intervalMs = Math.max(5, job.syncIntervalMins) * 60_000;
      await prisma.m3uSyncJob.update({
        where: { id: job.id },
        data: {
          lastSyncAt: now,
          nextSyncAt: new Date(Date.now() + intervalMs),
          lastResult: {
            at: now.toISOString(),
            imported: result.imported,
            skipped: result.skipped,
            errors: result.errors ?? [],
          },
        },
      });

      await prisma.importJob.create({
        data: {
          kind: ImportKind.M3U,
          source: job.url,
          streamType: contentType === "SERIES" ? "SERIES" : contentType === "MOVIE" ? "MOVIE" : "LIVE",
          imported: result.imported,
          skipped: result.skipped,
          status: "done",
          message: `M3U sync "${job.name}": ${result.imported} imported, ${result.skipped} skipped`,
        },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${job.name}: ${msg}`);
      await prisma.m3uSyncJob.update({
        where: { id: job.id },
        data: {
          lastSyncAt: now,
          nextSyncAt: new Date(Date.now() + Math.max(5, job.syncIntervalMins) * 60_000),
          lastResult: { at: now.toISOString(), error: msg },
        },
      });
    }
  }

  return { processed, imported, skipped, errors };
}

/** Sync a watch folder when its path is a remote M3U URL. */
export async function runWatchFolderM3uSync(folder: {
  id: string;
  name: string;
  path: string;
  type: string;
  categoryId: string | null;
  serverId: string | null;
}): Promise<M3uSyncRunResult> {
  return runM3uUrlSync(folder.path, {
    contentType: folder.type,
    categoryId: folder.categoryId,
    serverId: folder.serverId,
    autoTmdb: true,
    autoCategory: true,
  });
}
