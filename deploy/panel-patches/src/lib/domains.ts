import { getSettingGroup, setSettingGroup } from "@/lib/panel-settings";
import { buildPanelOrigin } from "@/lib/panel-server";
import {
  isValidPanelDomain,
  normalizeDomain,
  allowedHostsFromEnv,
} from "@/lib/domains-host";

export { normalizeDomain, isValidPanelDomain, allowedHostsFromEnv };

export type PanelDomainsSettings = {
  primaryDomain: string;
  extraDomains: string[];
  sslEnabled: boolean;
  forceHttps: boolean;
  fullSslEncryption: boolean;
  certbotEmail: string;
  certFullChainPath: string;
  certKeyPath: string;
  lastCertbotRun: {
    at: string;
    ok: boolean;
    message: string;
    domains: string[];
  } | null;
};

export function sanitizeDomainList(domains: unknown, primary?: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const primaryNorm = primary ? normalizeDomain(primary) : "";

  const list = Array.isArray(domains) ? domains : [];
  for (const item of list) {
    const d = normalizeDomain(String(item ?? ""));
    if (!d || !isValidPanelDomain(d)) continue;
    if (primaryNorm && d === primaryNorm) continue;
    if (seen.has(d)) continue;
    seen.add(d);
    out.push(d);
  }
  return out;
}

export async function getPanelDomainsSettings(): Promise<PanelDomainsSettings> {
  const raw = await getSettingGroup("domains");
  return parsePanelDomainsSettings(raw);
}

export function parsePanelDomainsSettings(raw: Record<string, unknown>): PanelDomainsSettings {
  const primaryDomain = normalizeDomain(String(raw.primaryDomain ?? ""));
  const extraDomains = sanitizeDomainList(raw.extraDomains, primaryDomain);
  const last = raw.lastCertbotRun;
  let lastCertbotRun: PanelDomainsSettings["lastCertbotRun"] = null;
  if (last && typeof last === "object") {
    const l = last as Record<string, unknown>;
    lastCertbotRun = {
      at: String(l.at ?? ""),
      ok: Boolean(l.ok),
      message: String(l.message ?? ""),
      domains: Array.isArray(l.domains) ? l.domains.map((d) => String(d)) : [],
    };
  }

  return {
    primaryDomain,
    extraDomains,
    sslEnabled: Boolean(raw.sslEnabled),
    forceHttps: Boolean(raw.forceHttps),
    fullSslEncryption: Boolean(raw.fullSslEncryption),
    certbotEmail: String(raw.certbotEmail ?? "").trim(),
    certFullChainPath: String(raw.certFullChainPath ?? "").trim(),
    certKeyPath: String(raw.certKeyPath ?? "").trim(),
    lastCertbotRun,
  };
}

export async function savePanelDomainsSettings(
  patch: Partial<PanelDomainsSettings>
): Promise<PanelDomainsSettings> {
  const current = await getPanelDomainsSettings();
  const primaryDomain = patch.primaryDomain != null ? normalizeDomain(patch.primaryDomain) : current.primaryDomain;
  if (primaryDomain && !isValidPanelDomain(primaryDomain)) {
    throw new Error("Invalid primary domain");
  }
  const extraDomains =
    patch.extraDomains != null
      ? sanitizeDomainList(patch.extraDomains, primaryDomain)
      : current.extraDomains;

  for (const d of extraDomains) {
    if (!isValidPanelDomain(d)) throw new Error(`Invalid domain: ${d}`);
  }

  let merged: PanelDomainsSettings = {
    ...current,
    ...patch,
    primaryDomain,
    extraDomains,
  };

  if (merged.fullSslEncryption) {
    merged = { ...merged, sslEnabled: true, forceHttps: true };
  }

  await setSettingGroup("domains", merged as unknown as Record<string, unknown>);
  syncPanelDomainsEnv(merged);
  return merged;
}

/** All hostnames that may serve the panel (admin + reseller routes). */
export function getAllowedPanelHosts(settings: PanelDomainsSettings): string[] {
  const hosts = new Set<string>(["localhost", "127.0.0.1"]);
  const fromEnv = process.env.PANEL_EXTRA_DOMAINS?.split(",").map((h) => normalizeDomain(h)).filter(Boolean) ?? [];
  for (const h of fromEnv) hosts.add(h);
  const primaryEnv = process.env.PANEL_PRIMARY_DOMAIN?.trim();
  if (primaryEnv) hosts.add(normalizeDomain(primaryEnv));
  if (settings.primaryDomain) hosts.add(settings.primaryDomain);
  for (const d of settings.extraDomains) hosts.add(d);
  return [...hosts];
}

export function canonicalPanelUrl(
  settings: PanelDomainsSettings,
  panelPort?: number
): string | null {
  if (!settings.primaryDomain) return null;
  const schemeSsl = settings.sslEnabled || settings.forceHttps;
  const port =
    panelPort ??
    (process.env.PANEL_PORT ? Number(process.env.PANEL_PORT) : undefined) ??
    (process.env.PORT ? Number(process.env.PORT) : undefined) ??
    3000;
  const usePort = port;
  return buildPanelOrigin(settings.primaryDomain, {
    ssl: settings.sslEnabled,
    forceHttps: settings.forceHttps,
    port: usePort,
  });
}

/** Sync runtime env for middleware (restart PM2 after changing .env on VPS). */
export function syncPanelDomainsEnv(settings: PanelDomainsSettings) {
  if (settings.primaryDomain) {
    process.env.PANEL_PRIMARY_DOMAIN = settings.primaryDomain;
  } else {
    delete process.env.PANEL_PRIMARY_DOMAIN;
  }
  process.env.PANEL_EXTRA_DOMAINS = settings.extraDomains.join(",");
  const forceHttps = settings.forceHttps || settings.fullSslEncryption;
  const sslOn = settings.sslEnabled || settings.fullSslEncryption;
  process.env.PANEL_FORCE_HTTPS = forceHttps ? "1" : "0";
  if (settings.fullSslEncryption) process.env.PANEL_FULL_SSL = "1";
  else delete process.env.PANEL_FULL_SSL;
  if (sslOn) process.env.PANEL_SSL_ENABLED = "1";
  else delete process.env.PANEL_SSL_ENABLED;
}

export function certbotDomainArgs(settings: PanelDomainsSettings): string[] {
  const domains: string[] = [];
  if (settings.primaryDomain) domains.push(settings.primaryDomain);
  for (const d of settings.extraDomains) {
    if (!domains.includes(d)) domains.push(d);
  }
  return domains.filter((d) => d !== "localhost");
}

export async function warmPanelDomainsEnv() {
  try {
    const settings = await getPanelDomainsSettings();
    syncPanelDomainsEnv(settings);
  } catch {
    /* DB may be unavailable during build */
  }
}
