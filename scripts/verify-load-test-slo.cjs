#!/usr/bin/env node
/**
 * Validate load-test JSON output against Nexlify playback SLO gates.
 *
 * Usage:
 *   node scripts/load-test-run.cjs ... | tee /tmp/load.json
 *   node scripts/verify-load-test-slo.cjs --file=/tmp/load.json
 *   echo '{"successRate":0.999,"ttfbMs":{"p95":1800}}' | node scripts/verify-load-test-slo.cjs
 */
const fs = require("fs");

function parseArg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=")[1] : fallback;
}

function readInput() {
  const file = parseArg("file", "");
  if (file) return fs.readFileSync(file, "utf8");
  return fs.readFileSync(0, "utf8");
}

function extractJsonBlocks(text) {
  const blocks = [];
  let depth = 0;
  let start = -1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && start >= 0) {
        blocks.push(text.slice(start, i + 1));
        start = -1;
      }
    }
  }
  return blocks.map((b) => {
    try {
      return JSON.parse(b);
    } catch {
      return null;
    }
  }).filter(Boolean);
}

const raw = readInput();
const blocks = extractJsonBlocks(raw);
const summary = [...blocks].reverse().find((b) => b.done === true) || blocks.at(-1) || {};

const failures = [];
if ((summary.successRate ?? 0) < 0.999) failures.push(`successRate ${summary.successRate} < 0.999`);
if (summary.ttfbMs?.p95 != null && summary.ttfbMs.p95 > 2000) {
  failures.push(`ttfb p95 ${summary.ttfbMs.p95}ms > 2000ms`);
}
if (summary.fail > 0 && summary.total > 0 && summary.fail / summary.total > 0.001) {
  failures.push(`fail ratio ${(summary.fail / summary.total).toFixed(4)} > 0.001`);
}

if (failures.length) {
  console.error("[verify-load-test-slo] FAIL");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}

console.log("[verify-load-test-slo] PASS", JSON.stringify(summary, null, 2));
