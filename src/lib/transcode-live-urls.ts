import { prisma } from "@/lib/prisma";
import { parseLiveStreamMeta } from "@/lib/stream-live-meta";
import {
  getTranscodingProfiles,
  type TranscodingProfile,
} from "@/lib/transcoding-profiles";
import { cuidToNum } from "@/lib/xtream-stream-id";

const MAX_VARIANT_EXTRAS = 200;

export function transcodeVariantNumericId(streamId: string, profileId: string): number {
  return cuidToNum(`tc:${profileId}:${streamId}`);
}

export function transcodeProfileSlug(profile: Pick<TranscodingProfile, "id" | "name">): string {
  const slug = profile.name.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 16);
  return slug || profile.id.replace(/[^a-zA-Z0-9]/g, "").slice(-12) || "tc";
}

export function parseLivePlaybackStreamKey(raw: string): { token: string; profileHint: string | null } {
  const cleaned = String(raw ?? "")
    .replace(/\.(ts|m3u8|mp4|mkv|avi|mov|webm|hls)$/i, "")
    .trim();
  const m = cleaned.match(/^(\d+)[_-]([A-Za-z0-9][A-Za-z0-9._-]{0,40})$/);
  if (m) return { token: m[1]!, profileHint: m[2]! };
  return { token: cleaned, profileHint: null };
}

export function streamHasExplicitTranscodeProfile(agentStartCmd: string | null | undefined): boolean {
  const profile = parseLiveStreamMeta(agentStartCmd).transcodeProfile;
  return Boolean(profile && profile !== "none");
}

export function matchTranscodingProfile(
  hint: string | null | undefined,
  profiles: TranscodingProfile[]
): TranscodingProfile | null {
  const h = String(hint ?? "").trim().toLowerCase();
  if (!h || !profiles.length) return null;
  return (
    profiles.find((p) => p.id.toLowerCase() === h) ||
    profiles.find((p) => transcodeProfileSlug(p) === h) ||
    profiles.find((p) => p.name.toLowerCase().replace(/[^a-z0-9]+/g, "") === h) ||
    profiles.find((p) => String(cuidToNum(p.id)) === h) ||
    profiles.find((p) => p.id.toLowerCase().endsWith(h)) ||
    null
  );
}

export function packagerDiskStreamId(streamId: string, profile?: Pick<TranscodingProfile, "id" | "name"> | null): string {
  if (!profile) return streamId;
  return `${streamId}__${transcodeProfileSlug(profile)}`;
}

type LiveApiRow = {
  num: number;
  name: string;
  stream_type: string;
  stream_id: number;
  custom_sid: string;
  [key: string]: unknown;
};

export function buildTranscodeVariantLiveRows<T extends LiveApiRow>(
  streams: Array<{ id: string; agentStartCmd?: string | null }>,
  baseRows: T[],
  profiles: TranscodingProfile[],
  maxExtras = MAX_VARIANT_EXTRAS
): T[] {
  const use = profiles.filter((p) => p.isActive);
  const list = use.length ? use : profiles;
  if (!list.length || !streams.length) return baseRows;

  const extras: T[] = [];
  for (let i = 0; i < streams.length && extras.length < maxExtras; i++) {
    const stream = streams[i]!;
    if (!streamHasExplicitTranscodeProfile(stream.agentStartCmd)) continue;
    const base = baseRows[i];
    if (!base) continue;
    for (const profile of list) {
      if (extras.length >= maxExtras) break;
      extras.push({
        ...base,
        name: `${base.name} [${profile.name}]`,
        stream_id: transcodeVariantNumericId(stream.id, profile.id),
        stream_type: "live",
        custom_sid: `tc:${profile.id}`,
      });
    }
  }
  if (!extras.length) return baseRows;
  return [...baseRows, ...extras].map((row, i) => ({ ...row, num: i + 1 }));
}

export async function resolveTranscodeVariantNumeric(
  numericId: number,
  opts?: { username?: string; lineId?: string }
): Promise<{ streamId: string; profileId: string } | null> {
  const profiles = await getTranscodingProfiles();
  if (!profiles.length || !Number.isFinite(numericId)) return null;

  let lineId = opts?.lineId ?? null;
  if (!lineId && opts?.username) {
    const row = await prisma.line.findUnique({
      where: { username: opts.username },
      select: { id: true },
    });
    lineId = row?.id ?? null;
  }

  const ids = lineId
    ? (
        await prisma.$queryRaw<{ id: string }[]>`
          SELECT DISTINCT s.id AS id
          FROM "LineBouquet" lb
          INNER JOIN "BouquetStream" bs ON bs."bouquetId" = lb."bouquetId"
          INNER JOIN "Stream" s ON s.id = bs."streamId"
          WHERE lb."lineId" = ${lineId}
            AND s."isActive" = true
            AND s."agentStartCmd" LIKE 'NEXLIFY_LIVE:%'
        `
      ).map((r) => r.id)
    : (
        await prisma.stream.findMany({
          where: { isActive: true, agentStartCmd: { startsWith: "NEXLIFY_LIVE:" } },
          select: { id: true },
          take: 2_000,
          orderBy: { updatedAt: "desc" },
        })
      ).map((r) => r.id);

  for (const streamId of ids) {
    for (const profile of profiles) {
      if (transcodeVariantNumericId(streamId, profile.id) === numericId) {
        return { streamId, profileId: profile.id };
      }
    }
  }
  return null;
}
