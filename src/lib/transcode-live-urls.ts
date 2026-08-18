export function matchTranscodingProfile(
  hint: string | null | undefined,
  profiles: { name: string; [k: string]: unknown }[]
): { name: string; [k: string]: unknown } | null {
  if (!hint || !profiles.length) return null;
  const h = hint.toLowerCase();
  return profiles.find((p) => p.name.toLowerCase() === h) ?? null;
}

export function packagerDiskStreamId(
  streamId: string,
  profile?: { name: string } | null
): string {
  if (profile?.name) return `${streamId}-${profile.name}`;
  return streamId;
}

export function parseLivePlaybackStreamKey(raw: string): {
  cleanId: string;
  transcodeHint: string | null;
} {
  const match = raw.match(/^(.+?)(?:\+(.+))?$/);
  if (!match) return { cleanId: raw, transcodeHint: null };
  return { cleanId: match[1], transcodeHint: match[2] ?? null };
}

export async function resolveTranscodeVariantNumeric(
  numericId: number,
  _opts?: { username?: string }
): Promise<string | null> {
  return null;
}
