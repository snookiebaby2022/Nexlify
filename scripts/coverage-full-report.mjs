/**
 * Run unit/smoke/streaming/integration suites under c8 with src/ instrumentation.
 * Does not enforce thresholds (report-only). Writes coverage/ + prints summary.
 */
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";

const root = resolve(process.cwd());
mkdirSync(resolve(root, "coverage"), { recursive: true });

const suites = [
  ["npm", ["run", "test:unit"]],
  ["npm", ["run", "test:smoke"]],
  ["npm", ["run", "test:streaming"]],
  ["npm", ["run", "test:integration"]],
  ["npm", ["run", "test:data-layer"]],
];

const c8Args = [
  "c8",
  "--all",
  "--check-coverage=false",
  "--include=src/lib/**/*.ts",
  "--include=src/app/api/**/*.ts",
  "--include=src/app/player_api.php/**/*.ts",
  "--include=src/app/get.php/**/*.ts",
  "--exclude=**/*.test.ts",
  "--exclude=**/node_modules/**",
  "--exclude=marketing-drop-in/**",
  "--exclude=src/lib/panel-migration/**",
  "--reporter=text-summary",
  "--reporter=json-summary",
  "--reporter=json",
  "--reporter=lcov",
  "--reports-dir=coverage",
  "node",
  "scripts/run-test-suites-for-coverage.mjs",
];

// Inline suite runner as child of c8
const runner = resolve(root, "scripts/run-test-suites-for-coverage.mjs");
writeFileSync(
  runner,
  `
import { spawnSync } from "node:child_process";
const suites = ${JSON.stringify(suites)};
let failed = 0;
const results = [];
for (const [cmd, args] of suites) {
  console.log("\\n========", cmd, args.join(" "), "========");
  const r = spawnSync(cmd, args, { stdio: "inherit", shell: true, env: process.env });
  const code = r.status ?? 1;
  results.push({ suite: args.join(" "), code });
  if (code !== 0) failed = 1;
}
console.log(JSON.stringify({ results, failed }));
process.exit(0); // always exit 0 so c8 still writes report; suites recorded above
`.trim()
);

console.log("Running full suite under c8 (src/lib + api routes)...");
const r = spawnSync("npx", c8Args, {
  cwd: root,
  stdio: "inherit",
  shell: true,
  env: {
    ...process.env,
    NEXLIFY_TEST_MOCKS: "1",
  },
});

process.exit(r.status ?? 1);
