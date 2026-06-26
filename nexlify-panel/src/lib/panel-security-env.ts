import { getSettingGroup } from "@/lib/panel-settings";
import { CLOUDFLARE_IPV4_FALLBACK, parseIpList } from "@/lib/cdn-ip-ranges";

export function syncPanelSecurityEnv(settings: Record<string, unknown>) {
  const on = Boolean(settings.logoutOnIpChange);
  if (on) process.env.PANEL_LOGOUT_ON_IP_CHANGE = "1";
  else delete process.env.PANEL_LOGOUT_ON_IP_CHANGE;

  if (Boolean(settings.blockBots)) process.env.PANEL_BLOCK_BOTS = "1";
  else delete process.env.PANEL_BLOCK_BOTS;

  if (Boolean(settings.stealthPanel)) process.env.PANEL_STEALTH = "1";
  else delete process.env.PANEL_STEALTH;

  if (Boolean(settings.trustCloudflareIp)) process.env.PANEL_TRUST_CLOUDFLARE = "1";
  else delete process.env.PANEL_TRUST_CLOUDFLARE;

  if (Boolean(settings.trustBunnyIp)) process.env.PANEL_TRUST_BUNNY = "1";
  else delete process.env.PANEL_TRUST_BUNNY;

  const cf = parseIpList(String(settings.cloudflareIpv4 ?? ""));
  const cfList = cf.length ? cf.join(",") : CLOUDFLARE_IPV4_FALLBACK.join(",");
  process.env.PANEL_CF_CIDRS = cfList;

  const bunny = parseIpList(String(settings.bunnyIpv4 ?? ""));
  if (bunny.length) process.env.PANEL_BUNNY_CIDRS = bunny.join(",");
  else delete process.env.PANEL_BUNNY_CIDRS;
}

export async function warmPanelSecurityEnv() {
  try {
    const security = await getSettingGroup("security");
    syncPanelSecurityEnv(security);
  } catch {
    /* DB unavailable during build */
  }
}
