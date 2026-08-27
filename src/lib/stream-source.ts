const SOURCE_SCHEMES =
  /^(https?:\/\/|file:\/\/|rtmp:\/\/|rtmps:\/\/|srt:\/\/|udp:\/\/|v4l2:\/\/|video4linux2:\/\/|dshow:\/\/|decklink:\/\/|avfoundation:\/\/)/i;

/** Trim and fix common URL typos (e.g. https:/host → https://host). */
export function normalizeStreamSource(input: string): string {
  let s = input.trim();
  // Single slash after scheme — must run before path resolution or URL becomes file:///media/https:/...
  s = s.replace(/^(https?):\/(?!\/)/i, "$1://");
  return s;
}

export function isValidStreamSource(source: string): boolean {
  const s = normalizeStreamSource(source);
  if (!s) return false;
  if (SOURCE_SCHEMES.test(s)) return true;
  if (s.startsWith("/") || /^[a-zA-Z]:\\/.test(s)) return true;
  return false;
}

export function sourceRequiredForType(type: string): boolean {
  return type === "MOVIE" || type === "SERIES";
}

export function hasProviderSource(body: {
  providerId?: string | null;
  providerPath?: string | null;
  hostedExternally?: boolean;
}): boolean {
  return Boolean(body.providerId?.trim() && body.providerPath?.trim());
}

/** Tick “hosted by provider” with an existing URL — no catalog import required. */
export function hasHostedDirectSource(body: {
  hostedExternally?: boolean;
  streamUrl?: string;
  source?: string;
}): boolean {
  if (!body.hostedExternally) return false;
  const source = normalizeStreamSource(String(body.source ?? body.streamUrl ?? ""));
  return Boolean(source && isValidStreamSource(source));
}

export function validateStreamCreate(body: {
  type?: string;
  streamUrl?: string;
  source?: string;
  seriesName?: string | null;
  seasonNum?: number | null;
  episodeNum?: number | null;
  providerId?: string | null;
  providerPath?: string | null;
  hostedExternally?: boolean;
  vodMode?: string;
  archiveDays?: number | null;
}): string | null {
  const type = body.type ?? "LIVE";
  const providerSource = hasProviderSource(body);
  const hostedDirect = hasHostedDirectSource(body);
  const source = normalizeStreamSource(String(body.source ?? body.streamUrl ?? ""));

  if (body.hostedExternally && !providerSource && !hostedDirect && !source) {
    return "Paste the provider URL, or pick a provider and path";
  }
  if (sourceRequiredForType(type) && !providerSource && !hostedDirect && !source) {
    return "Source or provider hosting is required for movies and episodes";
  }
  if (!sourceRequiredForType(type) && type === "LIVE" && !providerSource && !hostedDirect && !source) {
    return "Stream URL is required";
  }
  if (providerSource && !body.providerId?.trim()) {
    return "Provider is required when using provider path";
  }
  if (providerSource && !body.providerPath?.trim()) {
    return "Provider path or ID is required";
  }
  if (source && !providerSource && !isValidStreamSource(source)) {
    return "Source must be a URL (http/https/rtmp), a capture device (v4l2://, dshow://), or a file path";
  }
  if (type === "SERIES") {
    if (!body.seriesName?.trim()) return "Series name is required for episodes";
    if (body.seasonNum == null || body.episodeNum == null) {
      return "Season and episode numbers are required";
    }
  }
  if (body.vodMode === "CATCHUP" && body.archiveDays != null) {
    const days = Number(body.archiveDays);
    if (!Number.isFinite(days) || days < 1) {
      return "Archive days must be a positive number for catch-up";
    }
  }
  return null;
}

export const VOD_MODE_OPTIONS = [
  { value: "LIVE", label: "Live (default)" },
  { value: "ON_DEMAND", label: "On demand / VOD replay" },
  { value: "CATCHUP", label: "Catch-up / timeshift" },
] as const;
