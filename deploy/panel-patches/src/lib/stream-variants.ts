import { resolveRotatorUrl } from "./dns-rotator";

export type BitrateVariant = {
  id: string;
  label: string;
  path: string;
  bandwidthKbps?: number;
  resolution?: string;
  isPrimary?: boolean;
};

export function parseBitrates(raw: unknown): BitrateVariant[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const o = item as Record<string, unknown>;
      const id = String(o.id ?? "").trim();
      const label = String(o.label ?? "").trim();
      const path = String(o.path ?? "").trim();
      if (!id || !label || !path) return null;
      return {
        id,
        label,
        path,
        bandwidthKbps: o.bandwidthKbps != null ? Number(o.bandwidthKbps) : undefined,
        resolution: o.resolution ? String(o.resolution) : undefined,
        isPrimary: Boolean(o.isPrimary),
      } satisfies BitrateVariant;
    })
    .filter(Boolean) as BitrateVariant[];
}

export function validateBitrates(raw: unknown): string | null {
  const variants = parseBitrates(raw);
  if (!raw || (Array.isArray(raw) && raw.length === 0)) return null;
  if (!variants.length) return "At least one valid bitrate variant is required";
  for (const v of variants) {
    if (/[;|$`]/.test(v.path)) return "Bitrate paths must not contain shell metacharacters";
  }
  return null;
}

export function validateTimeshiftSeconds(seconds: unknown): string | null {
  if (seconds == null || seconds === "") return null;
  const n = Number(seconds);
  if (!Number.isFinite(n) || n < 0) return "Timeshift offset must be a non-negative number of seconds";
  if (n > 86400 * 7) return "Timeshift offset cannot exceed 7 days";
  return null;
}

export function formatTimeshiftLabel(seconds: number | null | undefined): string | null {
  if (seconds == null || seconds <= 0) return null;
  if (seconds % 3600 === 0) return `+${seconds / 3600}h`;
  if (seconds % 60 === 0) return `+${seconds / 60}m`;
  return `+${seconds}s`;
}

export function getPrimaryBitrate(variants: BitrateVariant[]): BitrateVariant | null {
  if (!variants.length) return null;
  return variants.find((v) => v.isPrimary) ?? variants[0];
}

export function resolveBitratePlayUrl(baseUrl: string, variants: BitrateVariant[]): string {
  const primary = getPrimaryBitrate(variants);
  if (!primary) return baseUrl;
  if (/^https?:\/\//i.test(primary.path)) return primary.path;
  const base = baseUrl.replace(/\/$/, "");
  const path = primary.path.startsWith("/") ? primary.path : `/${primary.path}`;
  return `${base}${path}`;
}

type StreamLike = {
  streamUrl: string;
  dnsRotator?: unknown;
  bitrates?: unknown;
  server?: { dnsRotator?: unknown } | null;
};

export function resolveStreamPlayUrl(stream: StreamLike, seed?: string): string {
  let url = stream.streamUrl;
  const variants = parseBitrates(stream.bitrates);
  if (variants.length) {
    url = resolveBitratePlayUrl(url, variants);
  }
  const rotator = stream.dnsRotator ?? stream.server?.dnsRotator;
  return resolveRotatorUrl(url, rotator, seed);
}
