export function matchTranscodingProfile<
  T extends {
    name: string;
    resolution: string;
    bitrate: number;
    codec: string;
    gpuAcceleration: boolean;
  },
>(hint: string | null | undefined, profiles: T[]): T | null {
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
  token: string;
  profileHint: string | null;
  hlsSegmentIndex: number | null;
} {
  const stripped = raw.replace(/\.(ts|m3u8|hls)$/i, "");
  let base = stripped;
  let hlsSegmentIndex: number | null = null;

  const xuiSeg = stripped.match(/^(.*)_(\d+)$/);
  if (xuiSeg) {
    base = xuiSeg[1] ?? stripped;
    hlsSegmentIndex = Number(xuiSeg[2]);
  } else {
    const seg = stripped.match(/^(.*?)\/(?:hls\/)?(?:seg)?(\d+)$/i);
    if (seg) {
      base = seg[1] ?? stripped;
      hlsSegmentIndex = Number(seg[2]);
    }
  }
  const match = base.match(/^(.+?)(?:\+(.+))?$/);
  const cleanId = match?.[1] ?? base;
  const transcodeHint = match?.[2] ?? null;
  return {
    cleanId,
    transcodeHint,
    token: cleanId,
    profileHint: transcodeHint,
    hlsSegmentIndex,
  };
}

export async function resolveTranscodeVariantNumeric(
  _numericId: number,
  _opts?: { username?: string }
): Promise<{ streamId: string; profileId?: string } | null> {
  return null;
}
