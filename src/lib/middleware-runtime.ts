import type { NextRequest } from "next/server";
import { allowedHostsFromEnv } from "@/lib/domains-host";
import { ipv4InAnyCidr, parseIpList, CLOUDFLARE_IPV4_FALLBACK, BUNNY_IPV4_FALLBACK } from "@/lib/cdn-ip-ranges";
import { lastUntrustedHop, parseForwardedHops, resolveClientIp } from "@/lib/client-ip";

/** Env-only — no fetch/Prisma (middleware self-fetch caused slow/hung pages). */
export function resolveAllowedHosts(): Set<string> {
  return new Set(allowedHostsFromEnv());
}

function peerIp(req: NextRequest): string {
  const real = req.headers.get("x-real-ip")?.trim();
  if (real) return real;
  return lastUntrustedHop(parseForwardedHops(req.headers.get("x-forwarded-for"))) ?? "";
}

function cloudflareCidrs(): string[] {
  const env = process.env.PANEL_CF_CIDRS;
  if (env) return parseIpList(env.replace(/,/g, "\n"));
  return CLOUDFLARE_IPV4_FALLBACK;
}

function bunnyCidrs(): string[] {
  const env = process.env.PANEL_BUNNY_CIDRS;
  if (env) return parseIpList(env.replace(/,/g, "\n"));
  return BUNNY_IPV4_FALLBACK;
}

export function clientIp(req: NextRequest): string {
  const remote = peerIp(req);

  if (
    process.env.PANEL_TRUST_CLOUDFLARE === "1" &&
    req.headers.get("cf-connecting-ip")
  ) {
    const cfIp = req.headers.get("cf-connecting-ip")!.trim();
    if (!remote || ipv4InAnyCidr(remote, cloudflareCidrs())) return cfIp;
  }

  if (process.env.PANEL_TRUST_BUNNY === "1") {
    const bunnyClient = lastUntrustedHop(parseForwardedHops(req.headers.get("x-forwarded-for")));
    if (bunnyClient && remote && ipv4InAnyCidr(remote, bunnyCidrs())) return bunnyClient;
  }

  return resolveClientIp(req.headers) ?? "";
}

/** Compare session IPs without ::ffff: / whitespace mismatches (Firefox vs nginx headers). */
export function normalizeSessionIp(ip: string): string {
  let raw = ip.trim();
  if (raw.startsWith("::ffff:")) raw = raw.slice(7);
  return raw;
}

export function shouldLogoutOnIpChange(): boolean {
  return (
    process.env.PANEL_LOGOUT_ON_IP_CHANGE === "1" ||
    process.env.PANEL_LOGOUT_ON_IP_CHANGE === "true"
  );
}

export function shouldBlockBots(): boolean {
  return process.env.PANEL_BLOCK_BOTS === "1" || process.env.PANEL_BLOCK_BOTS === "true";
}

export function shouldStealthPanel(): boolean {
  return process.env.PANEL_STEALTH === "1" || process.env.PANEL_STEALTH === "true";
}

/** @deprecated No-op; kept for settings save hooks. */
export function bustMiddlewareRuntimeCache() {}
