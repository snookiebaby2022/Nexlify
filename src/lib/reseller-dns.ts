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

/**
 * Merge reseller DNS into PANEL_EXTRA_DOMAINS so middleware allows reseller
 * portals on their own domain alongside the panel primary domain.
 * IPTV `.php` routes are already Host-agnostic; this unlocks reseller UI +
 * consistent server_info when clients dial the reseller domain.
 */
export async function syncResellerDnsIntoExtraDomains(): Promise<string[]> {
  const { getPanelDomainsSettings, syncPanelDomainsEnv } = await import("@/lib/domains");
  const settings = await getPanelDomainsSettings();
  const resellerHosts = await listResellerDnsHosts();
  syncPanelDomainsEnv(settings, resellerHosts);
  return resellerHosts;
}

export function normalizeResellerDnsInput(raw: unknown): string | null {
  if (raw == null) return null;
  const d = normalizeDomain(String(raw));
  if (!d) return null;
  if (!isValidPanelDomain(d)) {
    throw new Error(`Invalid reseller DNS domain: ${d}`);
  }
  return d;
}
