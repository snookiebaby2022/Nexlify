import { normalizeDomain } from "@/lib/domains-host";

/** Public sandbox hostname — serves the panel in read-only demo mode. */
export const PANEL_DEMO_HOST = "panel.demo.nexlify.live";

export const PANEL_CANONICAL_HOST =
  normalizeDomain(process.env.PANEL_PRIMARY_DOMAIN ?? "panel.nexlify.live") ||
  "panel.nexlify.live";

export function isPanelDemoHost(host: string): boolean {
  return normalizeDomain(host) === PANEL_DEMO_HOST;
}

/** @deprecated Demo host no longer redirects — kept for compatibility. */
export function isPanelDemoRedirectHost(_host: string): boolean {
  return false;
}

/** @deprecated Host-only exemption is enforced; env flags must not bypass production. */
export function isPanelLicenseExemptEnv(): boolean {
  return false;
}

/** Demo / public instances: no license gate on the demo host only. */
export function isPanelLicenseExempt(host: string): boolean {
  if (isPanelDemoHost(host)) return true;
  const extras = process.env.PANEL_LICENSE_EXEMPT_HOSTS?.split(",") ?? [];
  return extras.some((e) => normalizeDomain(e) === normalizeDomain(host) && Boolean(e.trim()));
}
