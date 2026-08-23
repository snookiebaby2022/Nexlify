#!/usr/bin/env node
/**
 * Panel-style Redis ping — fails deploy if ioredis cannot connect.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import Redis from "ioredis";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = resolve(root, ".env");

function loadDotEnv() {
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 1) continue;
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (process.env[k] == null || process.env[k] === "") process.env[k] = v;
  }
}

loadDotEnv();

const url = process.env.REDIS_URL?.trim();
if (!url) {
  console.error("ERROR: REDIS_URL not set");
  process.exit(1);
}

const client = new Redis(url, {
  maxRetriesPerRequest: 1,
  lazyConnect: true,
  connectTimeout: 5000,
});

try {
  await client.connect();
  const pong = await client.ping();
  if (pong !== "PONG") {
    console.error(`ERROR: Redis ping returned ${pong}`);
    process.exit(1);
  }
  console.log("OK: ioredis ping PONG");
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`ERROR: ioredis connect failed: ${msg}`);
  process.exit(1);
} finally {
  try {
    await client.quit();
  } catch {
    client.disconnect();
  }
}
