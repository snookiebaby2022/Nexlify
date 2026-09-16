#!/usr/bin/env node
/**
 * Purge Cloudflare cache for panel static assets after deploy.
 * Env: CF_API_TOKEN, CF_ZONE_ID, PANEL_PRIMARY_DOMAIN (or PANEL_PUBLIC_URL)
 */
const fs = require("fs");
const path = require("path");

function readEnvFile(root) {
  const envPath = path.join(root, ".env");
  if (!fs.existsSync(envPath)) return {};
  const out = {};
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[m[1]] = v;
  }
  return out;
}

async function main() {
  const root = path.resolve(__dirname, "..");
  const fileEnv = readEnvFile(root);
  const token = process.env.CF_API_TOKEN || fileEnv.CF_API_TOKEN || "";
  const zoneId = process.env.CF_ZONE_ID || fileEnv.CF_ZONE_ID || "";
  const domainRaw =
    process.env.PANEL_PRIMARY_DOMAIN ||
    fileEnv.PANEL_PRIMARY_DOMAIN ||
    process.env.PANEL_PUBLIC_URL ||
    fileEnv.PANEL_PUBLIC_URL ||
    "";
  const host = String(domainRaw)
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "");

  if (!token || !zoneId) {
    console.log("CF_PURGE_SKIP (set CF_API_TOKEN + CF_ZONE_ID to purge after deploy)");
    process.exit(0);
  }
  if (!host) {
    console.log("CF_PURGE_SKIP (no PANEL_PRIMARY_DOMAIN)");
    process.exit(0);
  }

  const prefixes = [
    `${host}/_next/static`,
    `${host}/admin`,
    `${host}/login`,
  ];

  const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ prefixes }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    console.error("CF_PURGE_FAIL", JSON.stringify(data).slice(0, 500));
    process.exit(1);
  }
  console.log(`CF_PURGE_OK prefixes=${prefixes.join(",")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
