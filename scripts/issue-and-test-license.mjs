#!/usr/bin/env node
/** Issue a license and verify locally + online. Run on VPS after deploy. */
import { spawnSync } from "child_process";

const email = process.argv.find((a, i) => process.argv[i - 1] === "--email") ?? "user@test.com";
const term = process.argv.find((a, i) => process.argv[i - 1] === "--term") ?? "1m";

const issue = spawnSync(
  process.execPath,
  ["scripts/issue-license.mjs", "--email", email, "--term", term, "--bind"],
  { encoding: "utf8", cwd: process.cwd() }
);
process.stdout.write(issue.stdout ?? "");
process.stderr.write(issue.stderr ?? "");
if (issue.status !== 0) process.exit(issue.status ?? 1);

const keyLine = (issue.stdout ?? "").split(/\r?\n/).find((l) => l.startsWith("NXLF1."));
if (!keyLine) {
  console.error("No NXLF1 key in issue output");
  process.exit(1);
}

console.log("\n--- test-license ---");
const test = spawnSync(process.execPath, ["scripts/test-license.mjs", keyLine.trim()], {
  cwd: process.cwd(),
  stdio: "inherit",
});
process.exit(test.status ?? 0);
