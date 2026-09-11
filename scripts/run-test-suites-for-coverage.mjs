/**
 * Child process for c8: run test suites; always exit 0 so coverage is written.
 */
import { spawnSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const suites = [
  ["npm", ["run", "pretest"]],
  ["npm", ["run", "test:unit"]],
  ["npm", ["run", "test:smoke"]],
  ["npm", ["run", "test:streaming"]],
  ["npm", ["run", "test:integration"]],
  ["npm", ["run", "test:data-layer"]],
];

const results = [];
for (const [cmd, args] of suites) {
  console.log(`\n======== ${cmd} ${args.join(" ")} ========`);
  const r = spawnSync(cmd, args, {
    stdio: "inherit",
    shell: true,
    env: { ...process.env, NEXLIFY_TEST_MOCKS: "1" },
  });
  const code = r.status ?? 1;
  results.push({ suite: args.join(" "), code });
  console.log(`[coverage-runner] ${args.join(" ")} → exit ${code}`);
}

mkdirSync(resolve("coverage"), { recursive: true });
writeFileSync(
  resolve("coverage/suite-results.json"),
  JSON.stringify({ results, at: new Date().toISOString() }, null, 2)
);
// Exit 0 so c8 flushes reports even if a suite failed
process.exit(0);
