import type { Line, Stream } from "@prisma/client";

type StreamAdultCheck = Pick<Stream, "name"> & {
  isAdult?: boolean;
  category?: { name: string } | null;
};

export function checkLineUserAgent(
  line: { allowedUserAgents?: string | null; disallowedUserAgents?: string | null },
  userAgent?: string
): boolean {
  const ua = (userAgent ?? "").toLowerCase();

  const disallowed = (line.disallowedUserAgents ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (disallowed.some((pat) => ua.includes(pat))) return false;

  const allowed = (line.allowedUserAgents ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
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
