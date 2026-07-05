import { prisma } from "@/lib/prisma";
import { cacheGet, cacheSet } from "@/lib/cache";

const FINGERPRINT_PREFIX = "fingerprint:";

export type StreamFingerprint = {
  streamId: string;
  streamName: string;
  uniqueId: string;
  createdAt: number;
  isMarked: boolean;
};

export type FingerprintMatch = {
  streamId: string;
  matchedStreamId: string;
  similarity: number;
  detectedAt: number;
};

export async function generateStreamFingerprint(streamId: string): Promise<StreamFingerprint> {
  const stream = await prisma.stream.findUnique({ where: { id: streamId } });
  const fingerprint: StreamFingerprint = {
    streamId,
    streamName: stream?.name ?? "",
    uniqueId: `fp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
    isMarked: false,
  };

  const fingerprints = await getStreamFingerprints();
  fingerprints.push(fingerprint);
  await cacheSet(`${FINGERPRINT_PREFIX}all`, fingerprints, 86400);
  return fingerprint;
}

export async function getStreamFingerprints(): Promise<StreamFingerprint[]> {
  return (await cacheGet<StreamFingerprint[]>(`${FINGERPRINT_PREFIX}all`)) ?? [];
}

export async function detectFingerprintMatches(): Promise<FingerprintMatch[]> {
  const cached = await cacheGet<FingerprintMatch[]>(`${FINGERPRINT_PREFIX}matches`);
  if (cached) return cached;

  // In a real implementation, this would compare stream fingerprints
  // For now, return empty matches (would be populated by fingerprint comparison)
  const matches: FingerprintMatch[] = [];

  await cacheSet(`${FINGERPRINT_PREFIX}matches`, matches, 300);
  return matches;
}

export async function markStreamAsPirated(streamId: string): Promise<boolean> {
  const fingerprints = await getStreamFingerprints();
  const idx = fingerprints.findIndex((f) => f.streamId === streamId);
  if (idx < 0) return false;
  fingerprints[idx].isMarked = true;
  await cacheSet(`${FINGERPRINT_PREFIX}all`, fingerprints, 86400);
  return true;
}
