/** Host/domain helpers safe for Edge middleware (no Prisma). */

const HOST_RE =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

export function normalizeDomain(input: string): string {
  let d = input.trim().toLowerCase();
  d = d.replace(/^https?:\/\//, "");
  d = d.replace(/\/.*$/, "");
  d = d.replace(/:\d+$/, "");
  return d;
}

export function isValidPanelDomain(domain: string): boolean {
  const d = normalizeDomain(domain);
  if (!d) return false;
  if (d === "localhost") return true;
  return HOST_RE.test(d);
}

function addHostFromUrl(hosts: Set<string>, raw?: string) {
  const t = raw?.trim();
  if (!t) return;
  try {
    const h = new URL(t.includes("://") ? t : `https://${t}`).hostname.toLowerCase();
    if (h && h !== "localhost" && !/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) {
      hosts.add(normalizeDomain(h));
    }
  } catch {
    hosts.add(normalizeDomain(t));
  }
}

export function allowedHostsFromEnv(): string[] {
  const hosts = new Set<string>(["localhost", "127.0.0.1"]);
  hosts.add("panel.demo.nexlify.live");
  const primary = process.env.PANEL_PRIMARY_DOMAIN?.trim();
  if (primary) hosts.add(normalizeDomain(primary));
  addHostFromUrl(hosts, process.env.NEXT_PUBLIC_SERVER_URL);
  addHostFromUrl(hosts, process.env.NEXT_PUBLIC_WEBSITE_URL);
  const extras = process.env.PANEL_EXTRA_DOMAINS?.split(",") ?? [];
  for (const e of extras) {
    const d = normalizeDomain(e);
    if (d) hosts.add(d);
  }
  return [...hosts];
}
