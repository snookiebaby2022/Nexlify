/**
 * Load DATABASE_URL for marketing scripts — never use the panel database.
 */
import { config } from "dotenv";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

export const MARKETING_ENV = "/var/www/nexlify/.env";
export const MARKETING_DB = "nexlify_marketing";

function stripQuotes(v: string): string {
  return v.replace(/^["']|["']$/g, "").trim();
}

function readDatabaseUrlFromFile(envPath: string): string | null {
  if (!existsSync(envPath)) return null;
  const line = readFileSync(envPath, "utf8")
    .split("\n")
    .find((l) => l.startsWith("DATABASE_URL="));
  if (!line) return null;
  const val = stripQuotes(line.slice("DATABASE_URL=".length));
  return val || null;
}

function deriveMarketingUrlFromPanel(): string | null {
  for (const p of ["/home/nexlify-panel/.env", "/opt/nexlify-panel/.env"]) {
    const panelUrl = readDatabaseUrlFromFile(p);
    if (!panelUrl?.startsWith("postgresql://")) continue;
    if (panelUrl.includes(`/${MARKETING_DB}`)) return panelUrl;
    return panelUrl.replace(/\/([^/?]+)(\?.*)?$/, `/${MARKETING_DB}$2`);
  }
  return null;
}

function persistMarketingDatabaseUrl(url: string): void {
  const envPath = existsSync(resolve(process.cwd(), ".env"))
    ? resolve(process.cwd(), ".env")
    : MARKETING_ENV;
  const existing = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
  const lines = existing.split("\n").filter((l) => l.trim() && !l.startsWith("DATABASE_URL="));
  lines.push(`DATABASE_URL="${url}"`);
  writeFileSync(envPath, `${lines.join("\n")}\n`, { mode: 0o600 });
}

/** Load DATABASE_URL into process.env; exits process on failure when exitOnError=true. */
export function loadMarketingDatabaseUrl(exitOnError = true): void {
  const envPaths = [resolve(process.cwd(), ".env"), MARKETING_ENV];

  for (const envPath of envPaths) {
    if (!existsSync(envPath)) continue;
    config({ path: envPath, override: true });
    const url = process.env.DATABASE_URL?.trim();
    if (url && url.includes(MARKETING_DB)) return;
    if (url && !url.includes(MARKETING_DB)) {
      console.warn(
        `WARNING: ${envPath} points at panel DB — switching to ${MARKETING_DB}`,
      );
      process.env.DATABASE_URL = "";
    }
  }

  const derived = deriveMarketingUrlFromPanel();
  if (derived) {
    process.env.DATABASE_URL = derived;
    persistMarketingDatabaseUrl(derived);
    console.log(`DATABASE_URL derived → ${MARKETING_DB}`);
    return;
  }

  const fromMarketing = readDatabaseUrlFromFile(MARKETING_ENV);
  if (fromMarketing) {
    process.env.DATABASE_URL = fromMarketing;
  }

  if (!process.env.DATABASE_URL?.trim()) {
    const msg =
      "DATABASE_URL not found. Run: bash scripts/ensure-marketing-database-url.sh";
    if (exitOnError) {
      console.error(msg);
      process.exit(1);
    }
    throw new Error(msg);
  }

  if (!process.env.DATABASE_URL.includes(MARKETING_DB)) {
    const msg = `Refusing: DATABASE_URL must use ${MARKETING_DB}, not the panel database.`;
    if (exitOnError) {
      console.error(msg);
      process.exit(1);
    }
    throw new Error(msg);
  }
}
