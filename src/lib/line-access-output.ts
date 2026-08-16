/** Xtream / XUI-style Access Output formats for a line. */

export type AccessOutputId = "hls" | "mpegts" | "rtmp";

export const ACCESS_OUTPUT_OPTIONS: {
  id: AccessOutputId;
  label: string;
  /** Tokens stored in Line.allowedOutput (comma-separated). */
  tokens: string[];
}[] = [
  { id: "hls", label: "HLS", tokens: ["hls", "m3u8"] },
  { id: "mpegts", label: "MPEGTS", tokens: ["ts"] },
  { id: "rtmp", label: "RTMP", tokens: ["rtmp"] },
];

/** Default: all formats enabled (matches XUI Access Output all-checked). */
export const DEFAULT_ALLOWED_OUTPUT = "hls,m3u8,ts,rtmp";

export function parseAccessOutput(raw: string | null | undefined): Set<AccessOutputId> {
  const tokens = new Set(
    String(raw ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
  const selected = new Set<AccessOutputId>();
  for (const opt of ACCESS_OUTPUT_OPTIONS) {
    if (opt.tokens.some((t) => tokens.has(t))) selected.add(opt.id);
  }
  return selected;
}

export function serializeAccessOutput(selected: Iterable<AccessOutputId>): string {
  const set = new Set(selected);
  const tokens: string[] = [];
  for (const opt of ACCESS_OUTPUT_OPTIONS) {
    if (set.has(opt.id)) tokens.push(...opt.tokens);
  }
  return tokens.length ? tokens.join(",") : DEFAULT_ALLOWED_OUTPUT;
}

export function defaultAccessOutputSelection(): Set<AccessOutputId> {
  return new Set(ACCESS_OUTPUT_OPTIONS.map((o) => o.id));
}

export function normalizeAllowedOutputInput(raw: unknown): string | undefined {
  if (raw == null) return undefined;
  const s = String(raw).trim();
  if (!s) return DEFAULT_ALLOWED_OUTPUT;
  const selected = parseAccessOutput(s);
  if (!selected.size) return DEFAULT_ALLOWED_OUTPUT;
  return serializeAccessOutput(selected);
}
