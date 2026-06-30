export type DemoConfig = {
  panelUrl: string | null;
  licenseKey: string | null;
  adminUser: string | null;
  adminPassword: string | null;
  resellerUser: string | null;
  resellerPassword: string | null;
  enabled: boolean;
};

export const DEMO_PANEL_URL =
  process.env.NEXT_PUBLIC_DEMO_PANEL_URL?.trim() || "https://panel.demo.nexlify.live/";

export const PANEL_PORTAL_URL =
  process.env.NEXT_PUBLIC_PANEL_PORTAL_URL?.trim() ||
  `${process.env.NEXT_PUBLIC_PANEL_URL?.trim().replace(/\/+$/, "") || "https://panel.nexlify.live"}/portal`;

export function getDemoConfig(): DemoConfig {
  const panelUrl =
    process.env.NEXT_PUBLIC_DEMO_PANEL_URL?.trim() ||
    process.env.DEMO_PANEL_URL?.trim() ||
    DEMO_PANEL_URL;

  const licenseKey = process.env.DEMO_LICENSE_KEY?.trim() || null;
  const adminUser = process.env.DEMO_ADMIN_USER?.trim() || "admin";
  const adminPassword = process.env.DEMO_ADMIN_PASSWORD?.trim() || "admin123";
  const resellerUser = process.env.DEMO_RESELLER_USER?.trim() || "reseller";
  const resellerPassword = process.env.DEMO_RESELLER_PASSWORD?.trim() || "reseller123";
  const enabled = process.env.DEMO_ENABLED !== "false";

  return {
    panelUrl: panelUrl || null,
    licenseKey,
    adminUser,
    adminPassword,
    resellerUser,
    resellerPassword,
    enabled,
  };
}
