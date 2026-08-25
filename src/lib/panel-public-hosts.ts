import fs from "fs";
import path from "path";
import { parseDnsRotator } from "@/lib/dns-rotator";
import { getPanelDomainsSettings, savePanelDomainsSettings } from "@/lib/domains";
import { isValidPanelDomain } from "@/lib/domains-host";
import { playlistHostnameFromDomain } from "@/lib/line-playlist-urls";
import { isThisPanelMachine, isLocalPanelServer } from "@/lib/panel-local-server";
import { resolvePanelRepoPathSync } from "@/lib/panel-repo-path";
import { prisma } from "@/lib/prisma";
import { isIpHost } from "@/lib/public-origin";

export type StreamServerHostFields = {
  host: string;
  domain?: string | null;
  dnsRotator?: unknown;
  panelSettings?: unknown;
};

function addPublicHostname(out: Set<string>, raw: string | null | undefined) {
  const host = playlistHostnameFromDomain(raw ?? "");
  if (!host || isIpHost(host)) return;
  if (host === "localhost") return;
  out.add(host);
}

/** Domain + DNS rotator hostnames from one stream server (IPs skipped). */
export function collectStreamServerPublicHosts(server: StreamServerHostFields): string[] {
  const out = new Set<string>();
  addPublicHostname(out, server.domain);
  const rotator = parseDnsRotator(server.dnsRotator);
  if (rotator) {
    for (const h of rotator.hosts) addPublicHostname(out, h);
  }
  return [...out];
}

export async function listPanelPublicHostnames(): Promise<string[]> {
  const out = new Set<string>();
  try {
    const domains = await getPanelDomainsSettings();
    addPublicHostname(out, domains.primaryDomain);
    for (const d of domains.extraDomains) addPublicHostname(out, d);
  } catch {
    /* ignore */
  }

  try {
    const rows = await prisma.streamServer.findMany({
      select: { host: true, domain: true, dnsRotator: true, panelSettings: true },
      take: 80,
    });
    const local = rows.filter((s) => isThisPanelMachine(s) || isLocalPanelServer(s));
    const ordered = local.length ? [...local, ...rows.filter((s) => !local.includes(s))] : rows;
    for (const s of ordered) {
      for (const h of collectStreamServerPublicHosts(s)) out.add(h);
    }
  } catch {
    /* ignore */
  }

  addPublicHostname(out, process.env.PANEL_PRIMARY_DOMAIN);
  for (const e of (process.env.PANEL_EXTRA_DOMAINS ?? "").split(",")) addPublicHostname(out, e);
  return [...out];
}

function upsertEnvLine(lines: string[], key: string, value: string): string[] {
  const prefix = `${key}=`;
  let found = false;
  const next = lines.map((line) => {
    if (line.startsWith(prefix)) {
      found = true;
      return `${key}=${value}`;
    }
    return line;
  });
  if (!found) next.push(`${key}=${value}`);
  return next;
}

function persistPublicHostsToEnv(primary: string, extras: string[]) {
  const envPath = path.join(resolvePanelRepoPathSync(), ".env");
  if (!fs.existsSync(envPath)) return;
  let raw = fs.readFileSync(envPath, "utf8");
  if (raw.includes("\r\n")) raw = raw.replace(/\r\n/g, "\n");
  let lines = raw.split("\n");
  if (primary) lines = upsertEnvLine(lines, "PANEL_PRIMARY_DOMAIN", primary);
  lines = upsertEnvLine(lines, "PANEL_EXTRA_DOMAINS", extras.join(","));
  fs.writeFileSync(envPath, `${lines.join("\n").replace(/\n+$/, "")}\n`, "utf8");
}

/**
 * After a stream server domain / rotator save: accept every hostname as a panel Host
 * (middleware + IPTV) without dropping existing extras.
 */
export async function syncStreamServerPublicHosts(server: StreamServerHostFields): Promise<void> {
  const incoming = collectStreamServerPublicHosts(server).filter((h) => isValidPanelDomain(h));
  if (!incoming.length) return;

  const current = await getPanelDomainsSettings();
  let primary = current.primaryDomain;
  if (!primary || isIpHost(primary) || !isValidPanelDomain(primary)) {
    primary = incoming[0] ?? "";
  }

  const extras = new Set(current.extraDomains.filter((d) => d && d !== primary));
  for (const h of incoming) {
    if (h !== primary) extras.add(h);
  }

  await savePanelDomainsSettings({
    primaryDomain: primary,
    extraDomains: [...extras],
  });
  persistPublicHostsToEnv(primary, [...extras]);
}
