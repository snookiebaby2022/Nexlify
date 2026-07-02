import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

export type SiteSettings = {
  maintenanceMode: boolean;
  siteTitle: string;
  siteDescription: string;
  supportEmail: string;
  salesEmail: string;
  telegramUrl: string;
  facebookUrl: string;
  twitterUrl: string;
  trustOperators: string;
  trustLines: string;
  trustCountries: string;
  customHtml: string;
};

const SETTINGS_DIR = join(process.cwd(), "data");
const SETTINGS_FILE = join(SETTINGS_DIR, "site-settings.json");

const DEFAULTS: SiteSettings = {
  maintenanceMode: false,
  siteTitle: "Nexlify",
  siteDescription: "IPTV reseller and management software for worldwide operators.",
  supportEmail: "support@nexlify.live",
  salesEmail: "sales@nexlify.live",
  telegramUrl: "https://t.me/+ybW8lT1hgkRiYTFk",
  facebookUrl: "https://www.facebook.com/profile.php?id=61590505869735",
  twitterUrl: "",
  trustOperators: "",
  trustLines: "",
  trustCountries: "",
  customHtml: "",
};

export function getSettings(): SiteSettings {
  try {
    if (existsSync(SETTINGS_FILE)) {
      const raw = readFileSync(SETTINGS_FILE, "utf-8");
      return { ...DEFAULTS, ...JSON.parse(raw) };
    }
  } catch {}
  return { ...DEFAULTS };
}

export function saveSettings(settings: Partial<SiteSettings>): SiteSettings {
  if (!existsSync(SETTINGS_DIR)) {
    mkdirSync(SETTINGS_DIR, { recursive: true });
  }
  const current = getSettings();
  const merged = { ...current, ...settings };
  writeFileSync(SETTINGS_FILE, JSON.stringify(merged, null, 2));
  return merged;
}
