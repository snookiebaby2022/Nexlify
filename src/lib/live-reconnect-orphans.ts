/**
 * Reactivate inactive LIVE streams when a healthy sibling (same quality key)
 * now has a good upstream — undoes "no donor" deactivations from fleet heal.
 *
 * Does NOT revive exact-name duplicates that were intentionally deactivated
 * (no bouquets + non-bad URL already represented by an active sibling).
 */
import { prisma } from "@/lib/prisma";
import { StreamType } from "@prisma/client";
import {
  isBadLiveHostUrl,
  liveHostScore,
  liveQualityKey,
  liveQualityRank,
  liveUpstreamKey,
} from "@/lib/live-fleet-heal";

const MIN_KEY_LEN = 4;

export type ReconnectOrphansResult = {
  mode: "dry-run" | "apply";
  scannedInactive: number;
  candidates: number;
  reactivated: number;
  stillNoDonor: number;
  skippedDupNoise: number;
  samples: { name: string; to: string; action: string }[];
};

function redact(url: string): string {
  try {
    const u = new URL(url);
    u.pathname = u.pathname.replace(
      /\/(live|movie|series)\/[^/]+\/[^/]+\//i,
      "/$1/***/***/"
    );
    return `${u.host}${u.pathname}`;
  } catch {
    return "?";
  }
}

type Cand = { url: string; qualityRank: number; bouquets: number };

function pickBest(cands: Cand[]): Cand | null {
  const ok = cands.filter((c) => c.url && !isBadLiveHostUrl(c.url));
  if (!ok.length) return null;
  ok.sort((a, b) => {
    const hs = liveHostScore(b.url) - liveHostScore(a.url);
    if (hs) return hs;
    if (b.qualityRank !== a.qualityRank) return b.qualityRank - a.qualityRank;
    return b.bouquets - a.bouquets;
  });
  return ok[0] ?? null;
}

export async function runReconnectLiveOrphans(opts?: {
  dryRun?: boolean;
  limit?: number;
}): Promise<ReconnectOrphansResult> {
  const dryRun = opts?.dryRun === true;
  const limit = Math.max(1, Math.min(8000, opts?.limit ?? 5000));

  const out: ReconnectOrphansResult = {
    mode: dryRun ? "dry-run" : "apply",
    scannedInactive: 0,
    candidates: 0,
    reactivated: 0,
    stillNoDonor: 0,
    skippedDupNoise: 0,
    samples: [],
  };

  const inactive = await prisma.stream.findMany({
    where: {
      type: StreamType.LIVE,
      isRadio: false,
      isActive: false,
    },
    select: {
      id: true,
      name: true,
      streamUrl: true,
      backupUrl: true,
      _count: { select: { bouquets: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: limit,
  });
  out.scannedInactive = inactive.length;

  const active = await prisma.stream.findMany({
    where: { type: StreamType.LIVE, isRadio: false, isActive: true },
    select: {
      id: true,
      name: true,
      streamUrl: true,
      _count: { select: { bouquets: true } },
    },
  });

  const byQ = new Map<string, typeof active>();
  for (const a of active) {
    const k = liveQualityKey(a.name);
    if (k.length < MIN_KEY_LEN) continue;
    const list = byQ.get(k) || [];
    list.push(a);
    byQ.set(k, list);
  }

  for (const row of inactive) {
    const primaryBad = isBadLiveHostUrl(row.streamUrl);
    const hasBouquets = row._count.bouquets > 0;

    // Target: bad-host orphans, or inactive rows still on bouquets needing a feed.
    if (!primaryBad && !hasBouquets) {
      out.skippedDupNoise++;
      continue;
    }

    const key = liveQualityKey(row.name);
    // Short keys (A&E→ae, U&W→uw, TLC→tlc) still deserve a stem search.
    if (key.length < 2) {
      out.stillNoDonor++;
      continue;
    }

    out.candidates++;
    let sibs = key.length >= MIN_KEY_LEN ? byQ.get(key) || [] : [];

    // Loose fallback when exact quality key is short or has no active twin
    // (e.g. "Film4" vs "Film 4", "A&E", "U&W", "TLC").
    if (!sibs.length) {
      let stem = row.name
        .replace(/\([^)]*\)/g, " ")
        .replace(/\b(4k|uhd|fhd|hd|sd|1080p|720p|hevc|hb|lb)\b/gi, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 40);
      // Keep ampersand brands searchable
      if (stem.length < 3) stem = row.name.replace(/\b(fhd|hd|sd)\b/gi, " ").trim().slice(0, 24);
      if (stem.length >= 2) {
        const loose = await prisma.stream.findMany({
          where: {
            type: StreamType.LIVE,
            isRadio: false,
            isActive: true,
            id: { not: row.id },
            name: { contains: stem.slice(0, 24), mode: "insensitive" },
          },
          select: {
            id: true,
            name: true,
            streamUrl: true,
            _count: { select: { bouquets: true } },
          },
          take: 40,
        });
        const sameKey =
          key.length >= MIN_KEY_LEN
            ? loose.filter((s) => liveQualityKey(s.name) === key)
            : [];
        sibs = sameKey.length ? sameKey : loose;
      }
    }

    const donor = pickBest(
      sibs
        .filter((s) => s.id !== row.id)
        .map((s) => ({
          url: s.streamUrl,
          qualityRank: liveQualityRank(s.name),
          bouquets: s._count.bouquets,
        }))
    );

    if (!donor) {
      out.stillNoDonor++;
      continue;
    }

    const backup =
      pickBest(
        sibs
          .filter((s) => liveUpstreamKey(s.streamUrl) !== liveUpstreamKey(donor.url))
          .map((s) => ({
            url: s.streamUrl,
            qualityRank: liveQualityRank(s.name),
            bouquets: s._count.bouquets,
          }))
      )?.url ?? null;

    if (out.samples.length < 40) {
      out.samples.push({
        name: row.name,
        to: redact(donor.url),
        action: primaryBad ? "remap+activate" : "activate-on-donor",
      });
    }

    out.reactivated++;
    if (dryRun) continue;

    await prisma.stream.update({
      where: { id: row.id },
      data: {
        isActive: true,
        streamUrl: donor.url,
        backupUrl: backup && backup !== donor.url ? backup : row.backupUrl && !isBadLiveHostUrl(row.backupUrl) ? row.backupUrl : backup,
        isOnDemand: true,
        vodMode: "ON_DEMAND",
        autoRestart: false,
        lastProbeError: null,
      },
    });
  }

  return out;
}
