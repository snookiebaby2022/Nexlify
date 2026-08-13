/**
 * Bundle cron-daemon.ts to plain CJS for production (avoids tsx RAM bloat).
 * Usage: node scripts/build-cron.mjs
 */
import { build } from "esbuild";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const entry = resolve(root, "scripts/cron-daemon.ts");
const outfile = resolve(root, "scripts/cron-daemon.bundle.cjs");

await build({
  entryPoints: [entry],
  outfile,
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  sourcemap: false,
  logLevel: "info",
  packages: "external",
  alias: {
    "@": resolve(root, "src"),
  },
});

console.log(`[build-cron] wrote ${outfile}`);
