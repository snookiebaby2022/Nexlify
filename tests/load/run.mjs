/**
 * Orchestrate load scenarios with k6.
 *
 * Usage:
 *   node tests/load/run.mjs                 # all HTTP scenarios
 *   node tests/load/run.mjs player-api      # one scenario
 *   node tests/load/run.mjs --list
 *
 * Prerequisites:
 *   - k6 on PATH (https://k6.io/docs/get-started/installation/)
 *   - Panel running against TEST_DATABASE_URL (e.g. npm run test:e2e start panel)
 *   - npm run test:load:seed
 *   - .env.test with PANEL_INTERNAL_SECRET + LOAD_BASE_URL
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvTest, assertSafeLoadBaseUrl } from "./env.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPORTS = resolve(__dirname, "reports");
const FIXTURES = resolve(__dirname, ".fixtures.json");

const SCENARIOS = {
  "player-api": "scenarios/player-api-auth.js",
  "live-auth": "scenarios/live-auth.js",
  "m3u": "scenarios/m3u-10k.js",
  credits: "scenarios/credit-double-spend.js",
};

function whichK6() {
  const r = spawnSync(process.platform === "win32" ? "where" : "which", ["k6"], {
    encoding: "utf8",
  });
  return r.status === 0;
}

function loadFixtures() {
  if (!existsSync(FIXTURES)) {
    console.error("Missing tests/load/.fixtures.json — run: npm run test:load:seed");
    process.exit(1);
  }
  return JSON.parse(readFileSync(FIXTURES, "utf8"));
}

function runK6(name, scriptRel, fixtures) {
  const script = resolve(__dirname, scriptRel);
  const summaryOut = resolve(REPORTS, `${name}.summary.json`);
  mkdirSync(REPORTS, { recursive: true });

  const env = {
    ...process.env,
    LOAD_BASE_URL: process.env.LOAD_BASE_URL || "http://127.0.0.1:13100",
    LOAD_LINE_USER: fixtures.credentials.line.username,
    LOAD_LINE_PASS: fixtures.credentials.line.password,
    LOAD_STREAM_ID: fixtures.streamId || "",
    LOAD_CHANNEL_COUNT: String(fixtures.channelCount || 10000),
    LOAD_RESELLER_USER: fixtures.credentials.reseller.username,
    LOAD_RESELLER_PASS: fixtures.credentials.reseller.password,
    LOAD_RESELLER_CREDITS: String(fixtures.resellerCredits ?? 100),
    LOAD_PACKAGE_ID: fixtures.packageId || "",
    LOAD_BOUQUET_ID: fixtures.bouquetId || "",
    PANEL_INTERNAL_SECRET:
      process.env.PANEL_INTERNAL_SECRET || process.env.PANEL_API_SECRET || "",
  };

  assertSafeLoadBaseUrl(env.LOAD_BASE_URL);

  console.log(`\n=== k6 ${name} → ${scriptRel} ===`);
  const args = [
    "run",
    script,
    "--summary-export",
    summaryOut,
  ];
  const r = spawnSync("k6", args, { env, stdio: "inherit", cwd: resolve(__dirname, "../..") });
  if (r.status !== 0) {
    console.error(`k6 scenario ${name} exited ${r.status}`);
    return false;
  }
  return true;
}

function main() {
  loadEnvTest(true);
  const arg = process.argv[2];
  if (arg === "--list") {
    console.log(Object.keys(SCENARIOS).join("\n"));
    return;
  }
  if (!whichK6()) {
    console.error(
      "k6 not found on PATH. Install: https://k6.io/docs/get-started/installation/\n" +
        "  Windows: winget install k6 --source winget\n" +
        "Then re-run. Credit race (Prisma) does not need k6: npm run test:load:credit-race"
    );
    process.exit(2);
  }

  const fixtures = loadFixtures();
  const names = arg && SCENARIOS[arg] ? [arg] : Object.keys(SCENARIOS);
  let ok = true;
  for (const name of names) {
    if (!runK6(name, SCENARIOS[name], fixtures)) ok = false;
    if (name === "credits") {
      const v = spawnSync(process.execPath, [resolve(__dirname, "verify-credits.mjs")], {
        stdio: "inherit",
        env: process.env,
      });
      if (v.status !== 0) ok = false;
    }
  }

  spawnSync(process.execPath, [resolve(__dirname, "db-slow-queries.mjs")], {
    stdio: "inherit",
    env: process.env,
  });
  spawnSync(process.execPath, [resolve(__dirname, "report.mjs")], {
    stdio: "inherit",
    env: process.env,
  });

  process.exit(ok ? 0 : 1);
}

main();
