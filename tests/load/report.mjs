/**
 * Aggregate k6 JSON summaries + optional db-slow-queries into a markdown report.
 */
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPORTS = resolve(__dirname, "reports");

function pct(metric, key) {
  if (!metric || !metric.values) return null;
  return metric.values[key] ?? metric.values[`p(${key})`] ?? null;
}

function fmt(n) {
  if (n == null || Number.isNaN(n)) return "n/a";
  return typeof n === "number" ? n.toFixed(2) : String(n);
}

function scenarioFromSummary(raw, file) {
  const m = raw.metrics || {};
  const dur = m.http_req_duration || {};
  const failed = m.http_req_failed || {};
  const reqs = m.http_reqs || {};
  return {
    file,
    throughput_rps: pct(reqs, "rate"),
    count: pct(reqs, "count"),
    p50: pct(dur, "med") ?? pct(dur, "p(50)"),
    p95: pct(dur, "p(95)"),
    p99: pct(dur, "p(99)"),
    avg: pct(dur, "avg"),
    error_rate: pct(failed, "rate"),
    checks: raw.root_group?.checks,
    thresholds: raw.thresholds,
  };
}

function main() {
  mkdirSync(REPORTS, { recursive: true });
  const files = existsSync(REPORTS)
    ? readdirSync(REPORTS).filter((f) => f.endsWith(".summary.json"))
    : [];

  const scenarios = files.map((f) => {
    const raw = JSON.parse(readFileSync(join(REPORTS, f), "utf8"));
    return scenarioFromSummary(raw, f);
  });

  let slow = null;
  const slowPath = join(REPORTS, "db-slow-queries.json");
  if (existsSync(slowPath)) {
    slow = JSON.parse(readFileSync(slowPath, "utf8"));
  }

  const lines = [];
  lines.push("# Load test report");
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");
  lines.push("## HTTP scenarios");
  lines.push("");
  lines.push("| Scenario | throughput (rps) | p50 ms | p95 ms | p99 ms | error rate |");
  lines.push("|---|---:|---:|---:|---:|---:|");
  for (const s of scenarios) {
    lines.push(
      `| ${s.file} | ${fmt(s.throughput_rps)} | ${fmt(s.p50)} | ${fmt(s.p95)} | ${fmt(s.p99)} | ${fmt(s.error_rate)} |`
    );
  }
  if (!scenarios.length) {
    lines.push("| _(none — run k6 first)_ | | | | | |");
  }
  lines.push("");
  lines.push("## DB slow queries");
  lines.push("");
  if (slow?.pg_stat_statements && Array.isArray(slow.topByMean) && slow.topByMean.length) {
    lines.push("| mean_ms | max_ms | calls | query |");
    lines.push("|---:|---:|---:|---|");
    for (const row of slow.topByMean.slice(0, 10)) {
      const q = String(row.query || "").replace(/\s+/g, " ").slice(0, 120);
      lines.push(`| ${row.mean_ms} | ${row.max_ms} | ${row.calls} | \`${q}\` |`);
    }
  } else {
    lines.push(
      slow?.note ||
        "pg_stat_statements unavailable. See `tests/load/SLOW-QUERIES.md` for the static top-10 profile + suggested indexes."
    );
  }
  lines.push("");
  lines.push("See also: [SLOW-QUERIES.md](./SLOW-QUERIES.md) for index recommendations.");

  const out = join(REPORTS, "LOAD-REPORT.md");
  writeFileSync(out, lines.join("\n") + "\n");
  console.log(`Wrote ${out}`);
}

main();
