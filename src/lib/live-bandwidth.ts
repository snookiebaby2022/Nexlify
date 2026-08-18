export const ECO_DISK_PROFILE = { name: "eco" };

export function ecoLiveProfile(): { name: string } | null {
  return ECO_DISK_PROFILE;
}

export function getLiveBandwidthSettings(): {
  enabled: boolean;
  targetBandwidthKbps?: number;
} {
  return { enabled: false };
}

export function isEcoProfileHint(hint: string | null | undefined): boolean {
  return (hint ?? "").toLowerCase() === "eco";
}

export function pickLowestBandwidthHlsVariant(
  variants: { bandwidth?: number; resolution?: string }[]
): { bandwidth?: number; resolution?: string } | null {
  if (!variants.length) return null;
  return variants.reduce((best, v) =>
    (v.bandwidth ?? Infinity) < (best.bandwidth ?? Infinity) ? v : best
  );
}
