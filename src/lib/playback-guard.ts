import type { Line } from "@prisma/client";
import { checkLineUserAgent } from "@/lib/line-restrictions";
import { checkLineIpAccess } from "@/lib/line-ip-lock";
import { lineHasConnectionCapacity } from "@/lib/connections";
import { checkPlaybackRateLimit } from "@/lib/playback-rate-limit";
import { cacheGetOrSet } from "@/lib/cache";
import { checkPlaybackBlocklist } from "@/lib/playback-blocklist";
import { lookupGeo, lineCountryAllowed } from "@/lib/geoip";
import { getSettingGroup } from "@/lib/panel-settings";
import { checkDdosShield } from "@/lib/ddos-shield";

export type PlaybackDenyReason =
  | "ip"
  | "connections"
  | "rate"
  | "blocklist"
  | "country"
  | "vpn"
  | "user_agent"
  | "ddos"
  | "reputation"
  | "isp"
  | "kicked";

export type PlaybackGuardLine = {
  id: string;
  lockToIp: boolean;
  allowedIps: string | null;
  maxConnections: number;
  allowedCountries: string | null;
  blockedCountries: string | null;
  allowedUserAgents: string | null;
  disallowedUserAgents: string | null;
  blockedIsps: string | null;
};

export function asPlaybackGuardLine(
  line: Pick<
    Line,
    "id" | "lockToIp" | "allowedIps" | "maxConnections" | "allowedCountries" | "blockedCountries"
  > & {
    allowedUserAgents?: string | null;
    disallowedUserAgents?: string | null;
    blockedIsps?: string | null;
  }
): PlaybackGuardLine {
  return {
    id: line.id,
    lockToIp: line.lockToIp,
    allowedIps: line.allowedIps,
    maxConnections: line.maxConnections,
    allowedCountries: line.allowedCountries,
    blockedCountries: line.blockedCountries,
    allowedUserAgents: line.allowedUserAgents ?? null,
    disallowedUserAgents: line.disallowedUserAgents ?? null,
    blockedIsps: line.blockedIsps ?? null,
  };
}

export type PlaybackGuardOptions = {
  /** Skip max-connection check (playlist / Xtream API listing; playback routes stay strict). */
  listingOnly?: boolean;
  /** When set, same IP+stream reconnect is allowed even at max connections (Smarters channel replay). */
  streamId?: string;
  /** HLS media segments: skip geo/VPN/reputation (those add seconds per segment). */
  hotPath?: boolean;
};

export async function assertPlaybackAllowed(
  line: PlaybackGuardLine,
  clientIp: string | undefined,
  userAgent?: string,
  options?: PlaybackGuardOptions
): Promise<PlaybackDenyReason | null> {
  // Global timeout — fail-open if checks take too long to avoid blocking IPTV apps
  const GUARD_TIMEOUT_MS = 2000;
  const guardPromise = assertPlaybackAllowedInner(line, clientIp, userAgent, options);
  const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), GUARD_TIMEOUT_MS));
  return Promise.race([guardPromise, timeoutPromise]);
}

async function assertPlaybackAllowedInner(
  line: PlaybackGuardLine,
  clientIp: string | undefined,
  userAgent?: string,
  options?: PlaybackGuardOptions
): Promise<PlaybackDenyReason | null> {
  // Hard kick deny TTL — block reconnect after admin/reseller Kick
  const { isSessionKicked } = await import("@/lib/connections");
  if (await isSessionKicked(line.id, clientIp)) return "kicked";

  if (options?.hotPath) {
    if (!checkLineIpAccess(line, clientIp)) return "ip";
    if (!checkLineUserAgent(line, userAgent)) return "user_agent";
    if (!options?.listingOnly) {
      const hasCapacity = await lineHasConnectionCapacity(line.id, line.maxConnections, {
        streamId: options?.streamId,
        clientIp,
      });
      if (!hasCapacity) return "connections";
    }
    return null;
  }

  if (clientIp) {
    const ddos = await checkDdosShield(clientIp);
    if (!ddos.ok) return "ddos";

    const { shouldBlockByReputation } = await import("@/lib/ip-reputation");
    const rep = await shouldBlockByReputation(clientIp);
    if (rep.block) {
      if (rep.reason === "vpn_proxy") return "vpn";
      const { dispatchWebhook } = await import("@/lib/webhook-events");
      void dispatchWebhook("security.vpn_blocked", {
        ip: clientIp,
        lineId: line.id,
        reason: rep.reason,
        fraudScore: rep.reputation.fraudScore,
      });
      if (rep.reputation.isVpn || rep.reputation.isProxy) return "vpn";
      return "reputation";
    }
    if (rep.flag) {
      const { dispatchWebhook } = await import("@/lib/webhook-events");
      void dispatchWebhook("security.fraud_flagged", {
        ip: clientIp,
        lineId: line.id,
        fraudScore: rep.reputation.fraudScore,
      });
    }
  }
  if (!checkLineIpAccess(line, clientIp)) return "ip";
  if (!checkLineUserAgent(line, userAgent)) return "user_agent";

  let geo: Awaited<ReturnType<typeof lookupGeo>> | null = null;
  if (clientIp) {
    geo = await lookupGeo(clientIp);
    const block = await checkPlaybackBlocklist(
      clientIp,
      userAgent,
      geo?.asn,
      geo?.isp
    );
    if (block) return "blocklist";

    if (!lineCountryAllowed(line, geo?.countryCode ?? null)) return "country";

    // Per-line ISP blocking
    if (line.blockedIsps && geo?.isp) {
      const blockedIsps = line.blockedIsps.split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
      const isp = geo.isp.toLowerCase();
      if (blockedIsps.some(blocked => isp.includes(blocked))) return "isp";
    }

    const geoSettings = await getSettingGroup("geo");
    if (geoSettings.enabled && geoSettings.blockVpnHosting && geo?.isVpnOrHosting) {
      if (geoSettings.autoBlockVpnToBlocklist && clientIp) {
        const { maybeAutoBlockVpn } = await import("@/lib/vpn-auto-block");
        void maybeAutoBlockVpn({
          clientIp,
          lineId: line.id,
          isp: geo.isp,
          asn: geo.asn,
        });
      }
      return "vpn";
    }
  }

  if (!options?.listingOnly) {
    const hasCapacity = await lineHasConnectionCapacity(line.id, line.maxConnections, {
      streamId: options?.streamId,
      clientIp,
    });
    if (!hasCapacity) return "connections";
  }
  if (clientIp && !checkPlaybackRateLimit(line.id, clientIp)) return "rate";
  return null;
}

export function playbackDenyMessage(reason: PlaybackDenyReason): string {
  switch (reason) {
    case "ip":
      return "IP not allowed for this line";
    case "connections":
      return "Max connections reached";
    case "rate":
      return "Rate limit exceeded";
    case "blocklist":
      return "Access blocked";
    case "country":
      return "Country not allowed";
    case "vpn":
      return "VPN or hosting not allowed";
    case "user_agent":
      return "User-Agent not allowed for this line";
    case "isp":
      return "ISP not allowed for this line";
    case "ddos":
      return "Access temporarily blocked (DDoS shield)";
    case "reputation":
      return "Access blocked (security policy)";
    case "kicked":
      return "Session kicked — reconnect blocked briefly";
    default:
      return "Playback denied";
  }
}

/** Stalker/MAG actions that require geo, blocklist, and connection checks. */
export const STALKER_GUARDED_ACTIONS = new Set([
  "handshake",
  "get_profile",
  "get_main_info",
  "get_categories",
  "get_ordered_list",
  "create_link",
]);
