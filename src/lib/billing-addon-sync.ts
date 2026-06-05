import { prisma } from "@/lib/prisma";

const WHMCS_NOTE_PREFIX = "whmcs:";

function whmcsNote(serviceId: string) {
  return `${WHMCS_NOTE_PREFIX}${serviceId}`;
}

export async function syncAddonLicensesFromBilling(panelLicenseKey: string): Promise<number> {
  const apiBase = process.env.NEXLIFY_LICENSE_API_URL?.trim().replace(/\/$/, "");
  const apiSecret =
    process.env.NEXLIFY_PANEL_API_SECRET?.trim() ??
    process.env.PANEL_API_SECRET?.trim();
  if (!apiBase || !panelLicenseKey) return 0;

  let localApi = apiBase;
  if (process.env.NEXLIFY_LICENSE_API_LOCAL === "1") {
    try {
      const u = new URL(apiBase);
      localApi = `http://127.0.0.1:${u.port || "3001"}`;
    } catch {
      localApi = "http://127.0.0.1:3001";
    }
  }

  const url = `${localApi}/api/licenses/addons?key=${encodeURIComponent(panelLicenseKey)}`;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (apiSecret) headers["x-panel-api-key"] = apiSecret;

  let res: Response;
  try {
    res = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) });
  } catch {
    return 0;
  }
  if (!res.ok) return 0;

  const data = (await res.json()) as {
    valid?: boolean;
    addons?: {
      service: string;
      label: string;
      expiresAt: string | null;
      whmcsServiceId: string;
      status: string;
    }[];
  };
  if (!data.valid || !data.addons?.length) return 0;

  let synced = 0;
  const activeServiceIds = new Set<string>();

  for (const addon of data.addons) {
    if (addon.status === "REVOKED" || addon.status === "SUSPENDED" || addon.status === "EXPIRED") {
      continue;
    }
    activeServiceIds.add(addon.whmcsServiceId);
    const note = whmcsNote(addon.whmcsServiceId);
    const existing = await prisma.addonLicense.findFirst({
      where: { service: addon.service, notes: note },
    });
    const expiresAt = addon.expiresAt ? new Date(addon.expiresAt) : null;
    if (existing) {
      await prisma.addonLicense.update({
        where: { id: existing.id },
        data: {
          label: addon.label,
          isActive: true,
          expiresAt,
        },
      });
    } else {
      await prisma.addonLicense.create({
        data: {
          service: addon.service,
          label: addon.label,
          notes: note,
          expiresAt,
          isActive: true,
        },
      });
    }
    synced++;
  }

  const billingRows = await prisma.addonLicense.findMany({
    where: { notes: { startsWith: WHMCS_NOTE_PREFIX } },
  });
  for (const row of billingRows) {
    const sid = row.notes?.slice(WHMCS_NOTE_PREFIX.length) ?? "";
    if (sid && !activeServiceIds.has(sid)) {
      await prisma.addonLicense.update({
        where: { id: row.id },
        data: { isActive: false },
      });
    }
  }

  return synced;
}

export async function getStoredPanelLicenseKey(): Promise<string | null> {
  const raw = await prisma.panelSetting.findUnique({ where: { key: "license.raw" } });
  if (raw?.value?.trim()) return raw.value.trim();
  const envKey = process.env.NEXLIFY_LICENSE_KEY?.trim();
  return envKey ?? null;
}
