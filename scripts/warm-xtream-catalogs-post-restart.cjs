#!/usr/bin/env node
/**
 * Warm Xtream catalogs after restart — delegates to TS (direct DB catalog build, no HTTP).
 */
const path = require("path");
const { spawnSync } = require("child_process");

require(path.join(__dirname, "load-env.cjs")).loadEnv();

const root = path.join(__dirname, "..");
const tsEntry = path.join(__dirname, "warm-xtream-catalogs-post-restart.ts");
const npx = process.platform === "win32" ? "npx.cmd" : "npx";

const run = spawnSync(npx, ["tsx", tsEntry], {
  cwd: root,
  stdio: "inherit",
  env: process.env,
});

if (run.error) {
  console.warn("[warm-xtream] tsx spawn failed:", run.error.message);
  process.exit(0);
}
process.exit(run.status === 0 ? 0 : 0);
