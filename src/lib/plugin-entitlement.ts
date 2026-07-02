import { prisma } from "@/lib/prisma";
import { getPlanLimits } from "@/lib/plan-limits";
import { isPanelDemoHost } from "@/lib/panel-demo-host";
import {
  getStoredPanelLicenseKey,
  syncAddonLicensesFromBilling,
} from "@/lib/billing-addon-sync";

/** Maps integration types / routes to addon license service ids. */
const PLUGIN_SERVICE_MAP: Record<string, string> = {
  plex: "plex",
  emby: "emby",
  jellyfin: "jellyfin",
  youtube: "youtube",
  spotify: "spotify",
  apple_music: "apple_music",
  deezer: "deezer",
  youtube_music: "youtube_music",
  statistics: "statistics",
  proxy_plugins: "proxy_plugins",
  stats: "statistics",
  proxies: "proxy_plugins",
  transcoding_pro: "transcoding_pro",
  lb_pro: "lb_pro",
  archive_timeshift: "archive_timeshift",
  security_shield: "security_shield",
  analytics_ai: "analytics_ai",
  dvr_recording: "dvr_recording",
  full_enterprise: "full_enterprise",
};

let lastBillingSyncAt = 0;
const BILLING_SYNC_COOLDOWN_MS = 45_000;

async function maybeSyncAddonsFromBilling(): Promise<void> {
  const now = Date.now();
  if (now - lastBillingSyncAt < BILLING_SYNC_COOLDOWN_MS) return;
  const panelKey = await getStoredPanelLicenseKey();
  if (!panelKey) return;
  lastBillingSyncAt = now;
  try {
    await syncAddonLicensesFromBilling(panelKey);
  } catch {
    /* billing sync is best-effort */
  }
}

export function pluginServiceId(typeOrRoute: string): string {
  const key = typeOrRoute.toLowerCase().trim();
  return PLUGIN_SERVICE_MAP[key] ?? key;
}

export async function hasActiveAddonLicense(service: string): Promise<boolean> {
  const now = new Date();
  const lic = await prisma.addonLicense.findFirst({
    where: {
      service,
      isActive: true,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
  });
  return Boolean(lic);
}

export async function isPluginEntitled(
  typeOrRoute: string,
  panelHost?: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (panelHost && isPanelDemoHost(panelHost)) {
    return { ok: true };
  }

  const limits = await getPlanLimits(panelHost);
  if (limits.allPlugins) return { ok: true };

  const service = pluginServiceId(typeOrRoute);
  if (await hasActiveAddonLicense(service)) return { ok: true };
  if (service !== "full_enterprise" && (await hasActiveAddonLicense("full_enterprise"))) {
    return { ok: true };
  }

  await maybeSyncAddonsFromBilling();
  if (await hasActiveAddonLicense(service)) return { ok: true };
  if (service !== "full_enterprise" && (await hasActiveAddonLicense("full_enterprise"))) {
    return { ok: true };
  }

  return {
    ok: false,
    error: `Plugin not licensed (${service}). Purchase the addon in WHMCS or upgrade to Top Tier for all plugins.`,
  };
}

export async function pluginEntitlementResponse(
  typeOrRoute: string,
  panelHost?: string
): Promise<Response | null> {
  const check = await isPluginEntitled(typeOrRoute, panelHost);
  if (check.ok) return null;
  const { NextResponse } = await import("next/server");
  return NextResponse.json({ error: check.error }, { status: 403 });
}
