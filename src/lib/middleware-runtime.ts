import type { NextRequest } from "next/server";
import { allowedHostsFromEnv } from "@/lib/domains-host";
import { ipv4InAnyCidr, parseIpList, CLOUDFLARE_IPV4_FALLBACK, BUNNY_IPV4_FALLBACK } from "@/lib/cdn-ip-ranges";

/** Env-only — no fetch/Prisma (middleware self-fetch caused slow/hung pages). */
export function resolveAllowedHosts(): Set<string> {
  return new Set(allowedHostsFromEnv());
}

function peerIp(req: NextRequest): string {
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",").pop()?.trim() ?? "";
  return "";
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
    const bunnyClient = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    if (bunnyClient && remote && ipv4InAnyCidr(remote, bunnyCidrs())) return bunnyClient;
  }

  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]?.trim() ?? "";
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return "";
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
