/**
 * Bundle SQL migration worker to CJS so it does not need tsx / Next.js.
 */
import { build } from "esbuild";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const entry = resolve(root, "scripts/panel-migrate-background.ts");
const outfile = resolve(root, "scripts/panel-migrate-background.bundle.cjs");

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

console.log(`[build-migrate-worker] wrote ${outfile}`);
