import { StreamType } from "@prisma/client";
import { fillMissingStreamArtwork, countArtworkFillTargets } from "@/lib/artwork-fill";
import {
  createArtworkFillReporter,
  type ArtworkFillMode,
  type ArtworkFillType,
} from "@/lib/artwork-fill-progress";
import type { IntegrationSyncReporter } from "@/lib/integration-sync-progress";
import { cleanAllPlexDisplayNames } from "@/lib/media-integrations";

let running = false;

function typesToStreamTypes(types: ArtworkFillType[]): StreamType[] {
  if (types.includes("ALL")) return [StreamType.LIVE, StreamType.MOVIE, StreamType.SERIES];
  const out: StreamType[] = [];
  if (types.includes("LIVE")) out.push(StreamType.LIVE);
  if (types.includes("MOVIE")) out.push(StreamType.MOVIE);
  if (types.includes("SERIES")) out.push(StreamType.SERIES);
  return out.length ? out : [StreamType.MOVIE, StreamType.SERIES];
}

export function artworkFillRunnerBusy(): boolean {
  return running;
}

export async function runArtworkFillJob(opts: {
  jobId: string;
  mode: ArtworkFillMode;
  types: ArtworkFillType[];
}): Promise<void> {
  if (running) return;
  running = true;
  const reporter = createArtworkFillReporter(opts.jobId, opts.mode, opts.types);
  const streamTypes = typesToStreamTypes(opts.types);
  const fast = opts.mode === "fast";

  try {
    const total = await countArtworkFillTargets(streamTypes);
    await reporter.counts({ total, current: 0, remaining: total });

    await reporter.step("prepare", "Cleaning legacy Plex title suffixes…");
    const plexReporter: IntegrationSyncReporter = {
      jobId: opts.jobId,
      step: async (phase, message) => reporter.step(phase, message),
      note: async (message) => reporter.note(message),
      counts: async (patch) =>
        reporter.counts({
          current: patch.titleCurrent ?? patch.current,
          total: patch.titleTotal ?? patch.total,
        }),
      done: async (message) => reporter.note(message),
      fail: async (error) => reporter.note(error),
      snapshot: () => reporter.snapshot() as unknown as import("@/lib/integration-sync-types").IntegrationSyncProgress,
    };
    await cleanAllPlexDisplayNames(plexReporter);

    let rounds = 0;
    const totals = {
      updated: 0,
      fromProvider: 0,
      fromPlex: 0,
      fromSeriesCover: 0,
      fromTmdb: 0,
      fromLiveLogo: 0,
    };
    let lastRemaining = total + 1;

    while (rounds < (fast ? 3 : 40)) {
      if (reporter.isCancelled()) {
        await reporter.fail("Cancelled");
        return;
      }

      rounds++;
      await reporter.step(
        fast ? "fast" : "full",
        fast
          ? `Fast pass ${rounds}: Plex proxy + IPTV catalogs…`
          : `Full pass ${rounds}: Plex + IPTV + TMDB…`
      );

      const result = await fillMissingStreamArtwork({
        types: streamTypes,
        tmdbLimit: fast ? 0 : 120,
        liveLogoLimit: fast ? 20 : 60,
        includePlexBackfill: rounds === 1,
        reporter,
      });

      totals.updated += result.updated;
      totals.fromProvider += result.fromProvider;
      totals.fromPlex += result.fromPlex;
      totals.fromSeriesCover += result.fromSeriesCover;
      totals.fromTmdb += result.fromTmdb;
      totals.fromLiveLogo += result.fromLiveLogo;

      await reporter.counts({
        ...totals,
        remaining: result.remaining,
        tmdbConfigured: result.tmdbConfigured,
        current: Math.max(0, total - result.remaining),
      });

      if (result.remaining <= 0) break;
      if (fast) break;
      if (result.remaining >= lastRemaining && result.updated === 0) break;
      lastRemaining = result.remaining;
    }

    const snap = reporter.snapshot();
    if (reporter.isCancelled()) {
      await reporter.fail("Cancelled");
      return;
    }

    const msg = [
      `Updated ${snap.updated.toLocaleString()} poster(s)`,
      snap.fromPlex ? `${snap.fromPlex.toLocaleString()} Plex` : "",
      snap.fromProvider ? `${snap.fromProvider.toLocaleString()} IPTV catalog` : "",
      snap.fromTmdb ? `${snap.fromTmdb.toLocaleString()} TMDB` : "",
      snap.fromLiveLogo ? `${snap.fromLiveLogo.toLocaleString()} live logos` : "",
      snap.remaining > 0 ? `${snap.remaining.toLocaleString()} still missing` : "all set",
    ]
      .filter(Boolean)
      .join(" · ");

    await reporter.done(msg);
  } catch (e) {
    await reporter.fail(e instanceof Error ? e.message : "Poster fetch failed");
  } finally {
    running = false;
  }
}
