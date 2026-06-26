import type { Line } from "@prisma/client";
import { checkLineIpAccess } from "@/lib/line-ip-lock";
import { lineHasConnectionCapacity } from "@/lib/connections";
import { checkPlaybackRateLimit } from "@/lib/playback-rate-limit";
import { cacheGetOrSet } from "@/lib/cache";
import { checkPlaybackBlocklist } from "@/lib/playback-blocklist";
import { lookupGeo, lineCountryAllowed } from "@/lib/geoip";
import { getSettingGroup } from "@/lib/panel-settings";

export type PlaybackDenyReason =
  | "ip"
  | "connections"
  | "rate"
  | "blocklist"
  | "country"
  | "vpn";

export type PlaybackGuardLine = Pick<
  Line,
  | "id"
  | "lockToIp"
  | "allowedIps"
  | "maxConnections"
  | "allowedCountries"
  | "blockedCountries"
>;

export async function assertPlaybackAllowed(
  line: PlaybackGuardLine,
  clientIp: string | undefined,
  userAgent?: string
): Promise<PlaybackDenyReason | null> {
  if (!checkLineIpAccess(line, clientIp)) return "ip";

  let geo = null;
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

    const geoSettings = await getSettingGroup("geo");
    if (geoSettings.enabled && geoSettings.blockVpnHosting && geo?.isVpnOrHosting) {
      return "vpn";
    }
  }

  const hasCapacity = await cacheGetOrSet(`line:capacity:${line.id}`, 5, () =>
    lineHasConnectionCapacity(line.id, line.maxConnections)
  );
  if (!hasCapacity) return "connections";
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
