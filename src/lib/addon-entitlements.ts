import { prisma } from "@/lib/prisma";
import { isBundleProductId } from "@/lib/bundle-entitlements";

const ACTIVE_STATUSES = ["ACTIVE", "UNUSED"] as const;

export async function addonEntitlementsForPanelKey(licenseKey: string) {
  const key = licenseKey.toUpperCase().trim();
  const license = await prisma.license.findUnique({
    where: { key },
    include: { user: { select: { email: true } } },
  });

  if (!license) {
    return { valid: false as const, reason: "Panel license not found" };
  }

  const now = new Date();
  const rows = await prisma.addonEntitlement.findMany({
    where: {
      status: { in: [...ACTIVE_STATUSES] },
      OR: [
        { panelLicenseId: license.id },
        { email: license.user.email },
      ],
      AND: [
        {
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
      ],
    },
    orderBy: { service: "asc" },
  });

  return {
    valid: true as const,
    panelLicenseKey: license.key,
    addons: rows.map((r) => ({
      service: r.service,
      label: serviceLabel(r.service),
      status: r.status,
      expiresAt: r.expiresAt?.toISOString() ?? null,
      whmcsServiceId: r.whmcsServiceId,
    })),
  };
}

function serviceLabel(service: string): string {
  const labels: Record<string, string> = {
    plex: "Plex",
    emby: "Emby",
    jellyfin: "Jellyfin",
    youtube: "YouTube",
    spotify: "Spotify",
    apple_music: "Apple Music",
    deezer: "Deezer",
    youtube_music: "YouTube Music",
    statistics: "Statistics",
    proxy_plugins: "Proxy plugins",
  };
  return labels[service] ?? service;
}

export async function isAddonProductId(productId: number): Promise<boolean> {
  if (isBundleProductId(productId)) return true;
  const row = await prisma.addonProduct.findFirst({
    where: { whmcsProductId: productId, active: true },
    select: { id: true },
  });
  return Boolean(row);
}

export async function isAddonWhmcsService(serviceId: string): Promise<boolean> {
  const row = await prisma.addonEntitlement.findFirst({
    where: {
      OR: [{ whmcsServiceId: serviceId }, { whmcsServiceId: { startsWith: `${serviceId}:` } }],
    },
    select: { id: true },
  });
  return Boolean(row);
}
