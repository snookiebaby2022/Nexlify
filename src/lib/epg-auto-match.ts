/**
 * Fuzzy EPG channel matching for live streams.
 * Used by import, stream create, cron backfill, and the admin auto-match UI.
 */
import { prisma } from "./prisma";

export type EpgChannelCandidate = {
  id: string;
  displayName: string;
};

export type EpgMatchResult = {
  epgChannelId: string;
  epgChannelName: string;
  score: number;
  method: "exact_id" | "exact_name" | "fuzzy_name";
};

const DEFAULT_THRESHOLD = 0.72;

export function normalizeEpgToken(str: string): string {
  return String(str ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .replace(/hd|sd|fhd|uhd|4k|8k|hevc|h265|h264/g, "")
    .replace(/channel|tv|television|iptv/g, "")
    .trim();
}

export function epgNameSimilarity(a: string, b: string): number {
  const na = normalizeEpgToken(a);
  const nb = normalizeEpgToken(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.9;

  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) return 1;

  const matrix: number[][] = [];
  for (let i = 0; i <= na.length; i++) matrix[i] = [i];
  for (let j = 0; j <= nb.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= na.length; i++) {
    for (let j = 1; j <= nb.length; j++) {
      const cost = na[i - 1] === nb[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return 1 - matrix[na.length][nb.length] / maxLen;
}

/** Distinct EPG channel IDs from programs (channelId is the XMLTV id). */
export async function listEpgChannelCandidates(limit = 8000): Promise<EpgChannelCandidate[]> {
  const rows = await prisma.epgProgram.findMany({
    select: { channelId: true },
    distinct: ["channelId"],
    orderBy: { channelId: "asc" },
    take: limit,
  });
  return rows.map((r) => ({
    id: r.channelId,
    // Prefer humanized channel id (BBC One HD) over random program titles
    displayName: r.channelId.replace(/[._]+/g, " ").replace(/\s+/g, " ").trim(),
  }));
}

export function findBestEpgMatch(
  streamName: string,
  channels: EpgChannelCandidate[],
  opts?: { channelId?: string | null; threshold?: number }
): EpgMatchResult | null {
  const threshold = opts?.threshold ?? DEFAULT_THRESHOLD;
  const streamChannelId = opts?.channelId?.trim() || "";

  if (streamChannelId) {
    const exactId = channels.find(
      (c) =>
        c.id === streamChannelId ||
        normalizeEpgToken(c.id) === normalizeEpgToken(streamChannelId)
    );
    if (exactId) {
      return {
        epgChannelId: exactId.id,
        epgChannelName: exactId.displayName,
        score: 1,
        method: "exact_id",
      };
    }
  }

  let best: EpgMatchResult | null = null;
  for (const channel of channels) {
    if (normalizeEpgToken(streamName) === normalizeEpgToken(channel.displayName)) {
      return {
        epgChannelId: channel.id,
        epgChannelName: channel.displayName,
        score: 1,
        method: "exact_name",
      };
    }
    const score = epgNameSimilarity(streamName, channel.displayName);
    if (score >= threshold && (!best || score > best.score)) {
      best = {
        epgChannelId: channel.id,
        epgChannelName: channel.displayName,
        score,
        method: "fuzzy_name",
      };
    }
    // Also compare against raw channel id tokens
    const idScore = epgNameSimilarity(streamName, channel.id);
    if (idScore >= threshold && (!best || idScore > best.score)) {
      best = {
        epgChannelId: channel.id,
        epgChannelName: channel.displayName,
        score: idScore,
        method: "fuzzy_name",
      };
    }
  }
  return best;
}

export async function autoAssignEpgToStream(opts: {
  streamId: string;
  name: string;
  channelId?: string | null;
  epgChannelId?: string | null;
  threshold?: number;
  channels?: EpgChannelCandidate[];
  /** When true, replace an existing epgChannelId that does not match any guide channel. */
  forceRematch?: boolean;
}): Promise<EpgMatchResult | null> {
  const channels = opts.channels ?? (await listEpgChannelCandidates());
  if (channels.length === 0) return null;

  const existing = opts.epgChannelId?.trim() || "";
  if (existing && !opts.forceRematch) {
    const known = channels.some(
      (c) => c.id === existing || normalizeEpgToken(c.id) === normalizeEpgToken(existing)
    );
    if (known) return null;
    const live = await prisma.epgProgram.findFirst({
      where: { channelId: existing, stop: { gte: new Date() } },
      select: { id: true },
    });
    if (live) return null;
  }

  const match = findBestEpgMatch(opts.name, channels, {
    channelId: opts.channelId || existing || null,
    threshold: opts.threshold,
  });
  if (!match) return null;
  if (existing && match.epgChannelId === existing) return null;

  await prisma.stream.update({
    where: { id: opts.streamId },
    data: { epgChannelId: match.epgChannelId },
  });

  // Best-effort audit row (ignore if no sources)
  try {
    const source = await prisma.epgSource.findFirst({
      where: { isActive: true },
      select: { id: true },
      orderBy: { lastSync: "desc" },
    });
    if (source) {
      await prisma.epgAutoAssignment.create({
        data: {
          sourceId: source.id,
          streamId: opts.streamId,
          matchedChannelId: match.epgChannelId,
          matchScore: match.score,
          matchMethod: match.method,
          isConfirmed: match.score >= 0.95,
        },
      });
    }
  } catch {
    /* ignore audit failures */
  }

  return match;
}

/** Backfill EPG for LIVE streams missing a working epgChannelId. */
export async function autoAssignMissingEpg(opts?: {
  limit?: number;
  threshold?: number;
}): Promise<{ scanned: number; assigned: number }> {
  const limit = opts?.limit ?? 200;
  const channels = await listEpgChannelCandidates();
  if (channels.length === 0) return { scanned: 0, assigned: 0 };

  const feedIds = new Set(channels.map((c) => c.id));
  const streams = await prisma.stream.findMany({
    where: { type: "LIVE" },
    select: { id: true, name: true, channelId: true, epgChannelId: true },
    orderBy: { updatedAt: "desc" },
    take: Math.max(limit * 3, 400),
  });

  const now = new Date();
  const needing: typeof streams = [];
  for (const s of streams) {
    const id = s.epgChannelId?.trim() || "";
    if (!id) {
      needing.push(s);
    } else if (!feedIds.has(id)) {
      const live = await prisma.epgProgram.findFirst({
        where: { channelId: id, stop: { gte: now } },
        select: { id: true },
      });
      if (!live) needing.push(s);
    }
    if (needing.length >= limit) break;
  }

  let assigned = 0;
  for (const s of needing) {
    const match = await autoAssignEpgToStream({
      streamId: s.id,
      name: s.name,
      channelId: s.channelId,
      epgChannelId: s.epgChannelId,
      threshold: opts?.threshold,
      channels,
      forceRematch: true,
    });
    if (match) assigned++;
  }
  return { scanned: needing.length, assigned };
}
