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

/** XUI stores allowed_outputs as JSON-ish id lists: [1,2,3] → m3u8, ts, rtmp. */
const XUI_OUTPUT_ID_MAP: Record<string, AccessOutputId> = {
  "1": "hls",
  "2": "mpegts",
  "3": "rtmp",
};

function tokenizeAllowedOutput(raw: string | null | undefined): string[] {
  const s = String(raw ?? "").trim();
  if (!s) return [];
  // XUI: "[1,2,3]" or "1,2,3" or JSON array
  if (s.startsWith("[") && s.endsWith("]")) {
    try {
      const parsed = JSON.parse(s.replace(/'/g, '"'));
      if (Array.isArray(parsed)) return parsed.map((v) => String(v).trim().toLowerCase()).filter(Boolean);
    } catch {
      return s
        .slice(1, -1)
        .split(",")
        .map((t) => t.trim().replace(/^["']|["']$/g, "").toLowerCase())
        .filter(Boolean);
    }
  }
  return s
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
}

export function parseAccessOutput(raw: string | null | undefined): Set<AccessOutputId> {
  const tokens = tokenizeAllowedOutput(raw);
  const selected = new Set<AccessOutputId>();
  for (const token of tokens) {
    const mapped = XUI_OUTPUT_ID_MAP[token];
    if (mapped) {
      selected.add(mapped);
      continue;
    }
    for (const opt of ACCESS_OUTPUT_OPTIONS) {
      if (opt.tokens.includes(token) || opt.id === token) selected.add(opt.id);
    }
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

/** Formats for Xtream `user_info.allowed_output_formats` (never leave XUI `[1,2,3]` raw). */
export function toXtreamAllowedOutputFormats(raw: string | null | undefined): string[] {
  const selected = parseAccessOutput(raw);
  if (!selected.size) return DEFAULT_ALLOWED_OUTPUT.split(",");
  return serializeAccessOutput(selected).split(",").filter(Boolean);
}
