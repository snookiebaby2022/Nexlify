/**
 * XUI / 1-stream style live catalog heal:
 * - Remap/purge known-bad hosts (tinypanel, xplatinmedia)
 * - Deactivate exact-name duplicates (migrate bouquets)
 * - Collapse FHD/HD/SD/HEVC siblings onto one upstream URL (one CDN pull)
 */
import { prisma } from "@/lib/prisma";
import { StreamType } from "@prisma/client";

const BAD_HOST_RE = /tinypanel\.info|xplatinmedia\.com/i;
const MIN_KEY_LEN = 8;

export type LiveFleetHealStats = {
  mode: "dry-run" | "apply";
  tinypanelPrimaryRemapped: number;
  tinypanelBackupCleared: number;
  tinypanelNoDonorDeactivated: number;
  exactDupGroups: number;
  exactDupDeactivated: number;
  qualityGroupsCollapsed: number;
  qualityRowsUpdated: number;
  after?: {
    activeLive: number;
    stillBadPrimary: number;
    stillBadBackup: number;
    sharedUpstreamKeys: number;
    maxRowsPerUpstream: number;
  };
};

export function liveQualityKey(name: string): string {
  let s = String(name ?? "").toLowerCase();
  s = s.replace(/\s*\/\s*icons\b/g, " ");
  s = s.replace(/\bicons\b/g, " ");
  s = s.replace(/\([^)]*\)/g, " ");
  s = s.replace(/\[[^\]]*\]/g, " ");
  s = s.replace(
    /\b(4k|uhd|fhd|hd|sd|1080p|720p|480p|576p|2160p|hevc|h\.?265|h\.?264|x265|x264|hdr10|hdr|eac3|ac3|5\.1|hb|lb)\b/g,
    " "
  );
  return s.replace(/[^a-z0-9]+/g, "");
}

export function liveExactNameKey(name: string): string {
  return String(name ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function liveQualityRank(name: string): number {
  const n = String(name ?? "").toLowerCase();
  if (/\b(4k|uhd|2160p)\b/.test(n)) return 5;
  if (/\bfhd\b|\b1080p\b/.test(n)) return 4;
  if (/\bhevc\b|\bh\.?265\b/.test(n)) return 3;
  if (/\bhd\b|\b720p\b/.test(n)) return 2;
  if (/\bsd\b|\b480p\b|\b576p\b/.test(n)) return 1;
  return 0;
}

export function liveHostOf(url: string): string {
  try {
    return new URL(String(url || "").trim()).hostname.toLowerCase();
  } catch {
    return "";
  }
}

export function liveUpstreamKey(url: string): string {
  try {
    const u = new URL(String(url || "").trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") return "";
    return `${u.protocol}//${u.host.toLowerCase()}${u.pathname}`;
  } catch {
    return "";
  }
}

export function isBadLiveHostUrl(url: string | null | undefined): boolean {
  if (!url || !/^https?:\/\//i.test(String(url).trim())) return true;
  return BAD_HOST_RE.test(liveHostOf(url));
}

export function liveHostScore(url: string): number {
  const h = liveHostOf(url);
  if (!h) return -100;
  if (BAD_HOST_RE.test(h)) return -80;
  if (/junki3monk3y/.test(h)) return 100;
  if (/zee-portal/.test(h)) return 85;
  if (/nowtvgo/.test(h)) return 75;
  if (/optv|mybmcdn|cdn/.test(h)) return 65;
  return 45;
}

type Cand = { url: string; qualityRank?: number; viewers?: number };

function pickBestUrl(candidates: Cand[]): Cand | null {
  const ranked = [...candidates]
    .filter((c) => c.url && /^https?:\/\//i.test(c.url) && !isBadLiveHostUrl(c.url))
    .sort((a, b) => {
      const hs = liveHostScore(b.url) - liveHostScore(a.url);
      if (hs) return hs;
      const qr = (b.qualityRank || 0) - (a.qualityRank || 0);
      if (qr) return qr;
      return (b.viewers || 0) - (a.viewers || 0);
    });
  return ranked[0] ?? null;
}

async function migrateBouquets(fromId: string, toId: string): Promise<void> {
  const links = await prisma.bouquetStream.findMany({ where: { streamId: fromId } });
  for (const link of links) {
    const exists = await prisma.bouquetStream.findUnique({
      where: { bouquetId_streamId: { bouquetId: link.bouquetId, streamId: toId } },
    });
    if (!exists) {
      await prisma.bouquetStream.create({
        data: {
          bouquetId: link.bouquetId,
          streamId: toId,
          sortOrder: link.sortOrder,
        },
      });
    }
    await prisma.bouquetStream.delete({
      where: { bouquetId_streamId: { bouquetId: link.bouquetId, streamId: fromId } },
    });
  }
}

export async function runLiveFleetHeal(opts?: {
  dryRun?: boolean;
}): Promise<LiveFleetHealStats> {
  const dryRun = opts?.dryRun === true;
  const apply = !dryRun;

  const stats: LiveFleetHealStats = {
    mode: dryRun ? "dry-run" : "apply",
    tinypanelPrimaryRemapped: 0,
    tinypanelBackupCleared: 0,
    tinypanelNoDonorDeactivated: 0,
    exactDupGroups: 0,
    exactDupDeactivated: 0,
    qualityGroupsCollapsed: 0,
    qualityRowsUpdated: 0,
  };

  const rows = await prisma.stream.findMany({
    where: { type: StreamType.LIVE, isRadio: false, isActive: true },
    select: {
      id: true,
      name: true,
      streamUrl: true,
      backupUrl: true,
      categoryId: true,
      lastProbeOk: true,
      lastSpliceOk: true,
      createdAt: true,
      _count: { select: { bouquets: true } },
    },
  });

  const since = new Date(Date.now() - 15 * 60 * 1000);
  const viewerRows = await prisma.liveConnection.groupBy({
    by: ["streamId"],
    where: { lastSeenAt: { gte: since }, streamId: { not: null } },
    _count: { _all: true },
  });
  const viewers = new Map(viewerRows.map((v) => [v.streamId!, v._count._all]));

  type Row = (typeof rows)[number] & { viewers: number };
  const byId = new Map<string, Row>(
    rows.map((r) => [r.id, { ...r, viewers: viewers.get(r.id) || 0 }])
  );

  const byQ = new Map<string, Row[]>();
  for (const r of byId.values()) {
    const k = liveQualityKey(r.name);
    if (k.length < MIN_KEY_LEN) continue;
    const list = byQ.get(k) || [];
    list.push(r);
    byQ.set(k, list);
  }

  const touched = new Set<string>();

  for (const r of [...byId.values()]) {
    const primaryBad = isBadLiveHostUrl(r.streamUrl);
    const backupBad = Boolean(r.backupUrl && isBadLiveHostUrl(r.backupUrl));
    if (!primaryBad && !backupBad) continue;

    const k = liveQualityKey(r.name);
    const sibs = (byQ.get(k) || []).filter((s) => s.id !== r.id);
    const donor = pickBestUrl(
      sibs.map((s) => ({
        url: s.streamUrl,
        qualityRank: liveQualityRank(s.name),
        viewers: s.viewers,
      }))
    );

    const data: {
      streamUrl?: string;
      backupUrl?: string | null;
      isActive?: boolean;
      isOnDemand?: boolean;
      vodMode?: "ON_DEMAND";
      autoRestart?: boolean;
    } = {};

    if (primaryBad) {
      if (donor) {
        data.streamUrl = donor.url;
        stats.tinypanelPrimaryRemapped++;
      } else {
        data.isActive = false;
        stats.tinypanelNoDonorDeactivated++;
      }
    }
    if (backupBad) {
      const bakDonor = pickBestUrl(
        sibs
          .map((s) => ({
            url: s.streamUrl,
            qualityRank: liveQualityRank(s.name),
            viewers: s.viewers,
          }))
          .filter(
            (c) =>
              liveUpstreamKey(c.url) !== liveUpstreamKey(data.streamUrl || r.streamUrl)
          )
      );
      data.backupUrl = bakDonor ? bakDonor.url : null;
      stats.tinypanelBackupCleared++;
    }

    if (!Object.keys(data).length) continue;
    data.isOnDemand = true;
    data.vodMode = "ON_DEMAND";
    data.autoRestart = false;

    if (apply) {
      await prisma.stream.update({ where: { id: r.id }, data });
      touched.add(r.id);
      if (data.isActive === false) {
        await prisma.liveConnection.deleteMany({ where: { streamId: r.id } });
        byId.delete(r.id);
      } else {
        const cur = byId.get(r.id);
        if (cur) {
          if (data.streamUrl) cur.streamUrl = data.streamUrl;
          if ("backupUrl" in data) cur.backupUrl = data.backupUrl ?? null;
        }
      }
    }
  }

  const exactGroups = new Map<string, Row[]>();
  for (const r of byId.values()) {
    const key = `${liveExactNameKey(r.name)}::${r.categoryId || ""}`;
    if (!liveExactNameKey(r.name)) continue;
    const list = exactGroups.get(key) || [];
    list.push(r);
    exactGroups.set(key, list);
  }

  for (const group of exactGroups.values()) {
    if (group.length < 2) continue;
    stats.exactDupGroups++;
    const ranked = [...group].sort((a, b) => {
      const hs = liveHostScore(b.streamUrl) - liveHostScore(a.streamUrl);
      if (hs) return hs;
      if ((b.viewers || 0) !== (a.viewers || 0)) return (b.viewers || 0) - (a.viewers || 0);
      if (b._count.bouquets !== a._count.bouquets) return b._count.bouquets - a._count.bouquets;
      const aOk = a.lastProbeOk === true || a.lastSpliceOk === true ? 1 : 0;
      const bOk = b.lastProbeOk === true || b.lastSpliceOk === true ? 1 : 0;
      if (bOk !== aOk) return bOk - aOk;
      return a.createdAt.getTime() - b.createdAt.getTime();
    });
    const keep = ranked[0]!;
    const drops = ranked.slice(1);
    for (const drop of drops) {
      stats.exactDupDeactivated++;
      if (!apply) continue;
      await migrateBouquets(drop.id, keep.id);
      await prisma.stream.update({ where: { id: drop.id }, data: { isActive: false } });
      await prisma.liveConnection.deleteMany({ where: { streamId: drop.id } });
      touched.add(drop.id);
      byId.delete(drop.id);
    }
  }

  byQ.clear();
  for (const r of byId.values()) {
    const k = liveQualityKey(r.name);
    if (k.length < MIN_KEY_LEN) continue;
    const list = byQ.get(k) || [];
    list.push(r);
    byQ.set(k, list);
  }

  for (const group of byQ.values()) {
    if (group.length < 2) continue;
    const urls = new Set(group.map((g) => liveUpstreamKey(g.streamUrl)).filter(Boolean));
    if (urls.size < 2) continue;

    const ranks = new Set(group.map((g) => liveQualityRank(g.name)));
    const hasMultiQuality = ranks.size >= 2 || group.some((g) => liveQualityRank(g.name) > 0);
    if (!hasMultiQuality && group.length > 8) continue;

    const best = pickBestUrl(
      group.map((g) => ({
        url: g.streamUrl,
        qualityRank: liveQualityRank(g.name),
        viewers: g.viewers,
      }))
    );
    if (!best) continue;

    const alt = pickBestUrl(
      group
        .map((g) => ({
          url: g.streamUrl,
          qualityRank: liveQualityRank(g.name),
          viewers: g.viewers,
        }))
        .filter(
          (c) =>
            liveUpstreamKey(c.url) !== liveUpstreamKey(best.url) && !isBadLiveHostUrl(c.url)
        )
    );

    let changed = 0;
    for (const g of group) {
      const needPrimary = liveUpstreamKey(g.streamUrl) !== liveUpstreamKey(best.url);
      const needBackupClear = isBadLiveHostUrl(g.backupUrl);
      const needBackupSet =
        Boolean(alt) && liveUpstreamKey(g.backupUrl || "") !== liveUpstreamKey(alt!.url);
      if (!needPrimary && !needBackupClear && !needBackupSet) continue;
      changed++;
      if (!apply) continue;
      await prisma.stream.update({
        where: { id: g.id },
        data: {
          streamUrl: best.url,
          backupUrl: alt ? alt.url : needBackupClear ? null : g.backupUrl,
          isOnDemand: true,
          vodMode: "ON_DEMAND",
          autoRestart: false,
        },
      });
      touched.add(g.id);
      const cur = byId.get(g.id);
      if (cur) {
        cur.streamUrl = best.url;
        cur.backupUrl = alt ? alt.url : needBackupClear ? null : cur.backupUrl;
      }
    }
    if (changed) {
      stats.qualityGroupsCollapsed++;
      stats.qualityRowsUpdated += changed;
    }
  }

  if (apply && touched.size) {
    await prisma.liveConnection.deleteMany({
      where: { streamId: { in: [...touched] } },
    });
  }

  const after = await prisma.stream.findMany({
    where: { type: StreamType.LIVE, isRadio: false, isActive: true },
    select: { streamUrl: true, backupUrl: true },
  });
  let stillBadPrimary = 0;
  let stillBadBackup = 0;
  const urlCount = new Map<string, number>();
  for (const r of after) {
    if (isBadLiveHostUrl(r.streamUrl)) stillBadPrimary++;
    if (r.backupUrl && isBadLiveHostUrl(r.backupUrl)) stillBadBackup++;
    const uk = liveUpstreamKey(r.streamUrl);
    if (!uk) continue;
    urlCount.set(uk, (urlCount.get(uk) || 0) + 1);
  }
  const shares = [...urlCount.values()];
  stats.after = {
    activeLive: after.length,
    stillBadPrimary,
    stillBadBackup,
    sharedUpstreamKeys: shares.filter((n) => n >= 2).length,
    maxRowsPerUpstream: shares.length ? Math.max(...shares) : 0,
  };

  return stats;
}
