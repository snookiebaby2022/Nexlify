import type { NextRequest } from "next/server";

function cleanIp(raw: string | null | undefined): string | undefined {
  let s = String(raw ?? "").trim();
  if (!s) return undefined;
  if (s.startsWith("::ffff:")) s = s.slice(7);
  if (s === "unknown" || s === "null") return undefined;
  return s || undefined;
}

function isLoopback(ip: string): boolean {
  return ip === "127.0.0.1" || ip === "::1" || ip === "0.0.0.0";
}

function isPublicish(ip: string): boolean {
  if (isLoopback(ip)) return false;
  if (ip.startsWith("10.")) return false;
  if (ip.startsWith("192.168.")) return false;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)) return false;
  return true;
}

/** Viewer IP for live-auth / connections. Prefer public hops; ignore loopback. */
export function getClientIp(req: NextRequest): string | undefined {
  const named = [
    req.headers.get("cf-connecting-ip"),
    req.headers.get("true-client-ip"),
    req.headers.get("x-nexlify-client-ip"),
    req.headers.get("x-nexlify-viewer-ip"),
    req.headers.get("x-client-ip"),
    req.headers.get("x-real-ip"),
  ];
  const hops: string[] = [];
  for (const h of named) {
    const ip = cleanIp(h);
    if (ip) hops.push(ip);
  }
  const xff = req.headers.get("x-forwarded-for") ?? "";
  for (const part of xff.split(",")) {
    const ip = cleanIp(part);
    if (ip) hops.push(ip);
  }

  const publicHop = hops.find((ip) => isPublicish(ip));
  if (publicHop) return publicHop;
  const any = hops.find((ip) => !isLoopback(ip));
  return any;
}
