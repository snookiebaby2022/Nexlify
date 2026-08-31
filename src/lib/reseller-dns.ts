import { prisma } from "@/lib/prisma";
import { isValidPanelDomain, normalizeDomain } from "@/lib/domains-host";

/** All reseller DNS hostnames (for panel Host allowlist + IPTV login). */
export async function listResellerDnsHosts(): Promise<string[]> {
  const rows = await prisma.panelUser.findMany({
    where: { resellerDns: { not: null } },
    select: { resellerDns: true },
  });
  const hosts = new Set<string>();
  for (const row of rows) {
    const d = normalizeDomain(String(row.resellerDns ?? ""));
    if (d && isValidPanelDomain(d)) hosts.add(d);
  }
  return [...hosts];
}

/** Repair XUI-imported values like `http://host:2086/` → bare hostname. */
export async function repairResellerDnsInDatabase(): Promise<number> {
  const rows = await prisma.panelUser.findMany({
    where: { resellerDns: { not: null } },
    select: { id: true, resellerDns: true },
  });
  let fixed = 0;
  for (const row of rows) {
    const raw = String(row.resellerDns ?? "").trim();
    if (!raw) continue;
    let normalized: string | null;
    try {
      normalized = normalizeResellerDnsInput(raw);
    } catch {
      normalized = null;
    }
    if (!normalized) {
      await prisma.panelUser.update({ where: { id: row.id }, data: { resellerDns: null } });
      fixed++;
      continue;
    }
    if (row.resellerDns !== normalized) {
      await prisma.panelUser.update({ where: { id: row.id }, data: { resellerDns: normalized } });
      fixed++;
    }
  }
  return fixed;
}

/**
 * Merge reseller DNS into panel domains + .env so every PM2 worker and middleware
 * allows reseller portals on their own hostname.
 */
export async function syncResellerDnsIntoExtraDomains(): Promise<string[]> {
  await repairResellerDnsInDatabase();
  const resellerHosts = await listResellerDnsHosts();
  const { getPanelDomainsSettings, savePanelDomainsSettings, syncPanelDomainsEnv } =
    await import("@/lib/domains");
  const settings = await getPanelDomainsSettings();

  const extras = new Set(settings.extraDomains);
  let changed = false;
  for (const h of resellerHosts) {
    if (h !== settings.primaryDomain && !extras.has(h)) {
      extras.add(h);
      changed = true;
    }
  }

  const merged = changed
    ? await savePanelDomainsSettings({ extraDomains: [...extras] })
    : settings;

  syncPanelDomainsEnv(merged, resellerHosts);

  try {
    const { persistPanelDomainsToEnv } = await import("@/lib/panel-public-hosts");
    const allExtras = new Set([...merged.extraDomains, ...resellerHosts]);
    persistPanelDomainsToEnv(merged.primaryDomain, [...allExtras]);
  } catch {
    /* .env may be absent in dev */
  }

  return resellerHosts;
}

export async function repairAndSyncResellerDns(): Promise<{ repaired: number; hosts: string[] }> {
  const repaired = await repairResellerDnsInDatabase();
  const hosts = await syncResellerDnsIntoExtraDomains();
  return { repaired, hosts };
}

export function normalizeResellerDnsInput(raw: unknown): string | null {
  if (raw == null || raw === "") return null;
  const d = normalizeDomain(String(raw));
  if (!d) return null;
  if (!isValidPanelDomain(d)) {
    throw new Error(`Invalid reseller DNS domain: ${d}`);
  }
  return d;
}
