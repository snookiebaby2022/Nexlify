import type { Line, Stream } from "@prisma/client";

type StreamAdultCheck = Pick<Stream, "name"> & {
  isAdult?: boolean;
  category?: { name: string } | null;
};

/** Split UA restriction fields into patterns. Empty / `[]` / JSON empty array = no restriction. */
export function parseUserAgentPatterns(raw?: string | null): string[] {
  const text = (raw ?? "").trim();
  if (!text || text === "[]" || text === "null" || text === "{}") return [];

  if (
    (text.startsWith("[") && text.endsWith("]")) ||
    (text.startsWith("{") && text.endsWith("}"))
  ) {
    try {
      const parsed = JSON.parse(text) as unknown;
      if (Array.isArray(parsed)) {
        return parsed
          .map((v) => String(v ?? "").trim().toLowerCase())
          .filter(Boolean);
      }
      if (parsed && typeof parsed === "object") {
        return Object.values(parsed as Record<string, unknown>)
          .map((v) => String(v ?? "").trim().toLowerCase())
          .filter(Boolean);
      }
    } catch {
      // fall through to delimiter split
    }
  }

  return text
    .split(/[\n,;|]+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => Boolean(s) && s !== "[]" && s !== "null");
}

/** Persist form/migration UA fields as comma list, or null when unrestricted. */
export function normalizeUserAgentField(raw?: string | null): string | null {
  const patterns = parseUserAgentPatterns(raw);
  if (patterns.length === 0) return null;
  // Keep original casing lightly: re-parse without lowercasing for storage
  const text = (raw ?? "").trim();
  if (text.startsWith("[") && text.endsWith("]")) {
    try {
      const parsed = JSON.parse(text) as unknown;
      if (Array.isArray(parsed)) {
        const kept = parsed.map((v) => String(v ?? "").trim()).filter(Boolean);
        return kept.length ? kept.join(",") : null;
      }
    } catch {
      /* ignore */
    }
  }
  return (
    text
      .split(/[\n,;|]+/)
      .map((s) => s.trim())
      .filter((s) => Boolean(s) && s !== "[]" && s !== "null")
      .join(",") || null
  );
}

export function checkLineUserAgent(
  line: { allowedUserAgents?: string | null; disallowedUserAgents?: string | null },
  userAgent?: string
): boolean {
  const ua = (userAgent ?? "").toLowerCase();

  const disallowed = parseUserAgentPatterns(line.disallowedUserAgents);
  if (disallowed.some((pat) => ua.includes(pat))) return false;

  const allowed = parseUserAgentPatterns(line.allowedUserAgents);
  // Empty allow-list (null, "", "[]", JSON []) means no restriction
  if (allowed.length > 0 && !allowed.some((pat) => ua.includes(pat))) return false;

  return true;
}

export function streamLooksAdult(stream: StreamAdultCheck): boolean {
  if (stream.isAdult === true) return true;
  const hay = `${stream.name} ${stream.category?.name ?? ""}`.toLowerCase();
  return /\b(adult|xxx|18\+|porn|erotic|sex)\b/.test(hay);
}

export function lineCanWatchStream(
  line: { canWatchAdult?: boolean },
  stream: StreamAdultCheck
): boolean {
  if (line.canWatchAdult !== false) return true;
  return !streamLooksAdult(stream);
}
