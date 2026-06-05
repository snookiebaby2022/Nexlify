import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function loadEnvFile(envPath = resolve(root, ".env")) {
  const out = {};
  if (!existsSync(envPath)) return out;
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 1) continue;
    const key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

export function resolvePortFromEnv(env = loadEnvFile()) {
  const raw = env.PORT ?? env.PANEL_PORT ?? "3000";
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1 || n > 65535) return 3000;
  return Math.floor(n);
}

export function resolveBindHostFromEnv(env = loadEnvFile()) {
  const explicit = (env.PANEL_BIND_HOST ?? process.env.PANEL_BIND_HOST ?? "").trim();
  if (explicit) return explicit;
  const behind =
    env.PANEL_BEHIND_NGINX === "1" ||
    env.PANEL_BEHIND_NGINX === "true" ||
    process.env.PANEL_BEHIND_NGINX === "1" ||
    process.env.PANEL_BEHIND_NGINX === "true";
  return behind ? "127.0.0.1" : "0.0.0.0";
}

export function resolveWebsitePortFromEnv(env = loadEnvFile()) {
  const raw = env.WEBSITE_PORT ?? env.STREAM_HTTP_PORT ?? "3001";
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1 || n > 65535) return 3001;
  return Math.floor(n);
}

if (process.argv[1]?.endsWith("read-env-port.mjs")) {
  console.log(String(resolvePortFromEnv()));
}
