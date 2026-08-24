import { createHmac, timingSafeEqual } from "crypto";
import { CategoryType, StreamType } from "@prisma/client";
import { generateLinePassword } from "./credential-generate";

/** Cryptographically random line/reseller password (XUI create_* defaults). */
export function generatePassword(length = 12): string {
  return generateLinePassword(length);
}

/** parseInt that cannot return NaN for Prisma `take` / date math. */
export function parseBoundedInt(
  raw: string | null | undefined,
  fallback: number,
  min: number,
  max: number
): number {
  const n = parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** XUI.one stream type: live|movie|series or 1|2|3. */
export function parseStreamType(raw: string | null | undefined): StreamType | null {
  const v = String(raw ?? "").trim().toLowerCase();
  if (!v) return null;
  if (v === "1" || v === "live" || v === "tv") return StreamType.LIVE;
  if (v === "2" || v === "movie" || v === "movies" || v === "vod") return StreamType.MOVIE;
  if (v === "3" || v === "series" || v === "show" || v === "shows") return StreamType.SERIES;
  const upper = v.toUpperCase();
  if (upper === StreamType.LIVE || upper === StreamType.MOVIE || upper === StreamType.SERIES) {
    return upper as StreamType;
  }
  return null;
}

export function parseCategoryType(raw: string | null | undefined): CategoryType | null {
  const stream = parseStreamType(raw);
  if (stream) return stream as unknown as CategoryType;
  const v = String(raw ?? "").trim().toUpperCase();
  if (v === "RADIO") return CategoryType.RADIO;
  if (v === CategoryType.LIVE || v === CategoryType.MOVIE || v === CategoryType.SERIES) {
    return v as CategoryType;
  }
  return null;
}

/** HMAC payload must exclude the signature query param (XUI-style signing). */
export function hmacPayloadFromSearchParams(params: URLSearchParams): string {
  const copy = new URLSearchParams(params);
  copy.delete("hmac");
  return copy.toString();
}

export function hmacHex(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export function hmacHexEqual(provided: string, expected: string): boolean {
  const a = provided.trim().toLowerCase();
  const b = expected.trim().toLowerCase();
  if (!a || a.length !== b.length || !/^[0-9a-f]+$/.test(a)) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
  } catch {
    return false;
  }
}
