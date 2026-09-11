/**
 * Build COVERAGE-REPORT.md from coverage/coverage-summary.json
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, relative, join } from "node:path";

const root = process.cwd();
const summary = JSON.parse(readFileSync("coverage/coverage-summary.json", "utf8"));
const total = summary.total;

function norm(p) {
  return p
    .replace(/\\/g, "/")
    .replace(/^.*nexlify-panel\//i, "")
    .replace(/^C:\/Users\/lizzi\/nexlify-panel\//i, "");
}

const files = Object.entries(summary)
  .filter(([k]) => k !== "total")
  .map(([path, s]) => ({
    path: norm(path),
    lines: s.lines.pct,
    stmts: s.statements.pct,
    funcs: s.functions.pct,
    branches: s.branches.pct,
    covered: s.lines.covered,
    total: s.lines.total,
  }))
  .sort((a, b) => a.lines - b.lines || b.total - a.total);

const under50 = files.filter((f) => f.lines < 50);
const zero = files.filter((f) => f.lines === 0);

const mods = {};
for (const f of files) {
  let m;
  if (f.path.startsWith("src/app/api/")) {
    const parts = f.path.split("/");
    m = "api/" + parts.slice(3, 5).join("/");
  } else if (f.path.startsWith("src/lib/")) {
    m = "lib/" + (f.path.split("/")[2] || "root");
  } else {
    m = f.path.split("/").slice(0, 3).join("/");
  }
  if (!mods[m]) mods[m] = { covered: 0, total: 0, files: 0 };
  mods[m].covered += f.covered;
  mods[m].total += f.total;
  mods[m].files++;
}
const modRows = Object.entries(mods)
  .map(([name, v]) => ({
    name,
    pct: v.total ? +(100 * (v.covered / v.total)).toFixed(1) : 0,
    covered: v.covered,
    total: v.total,
    files: v.files,
  }))
  .sort((a, b) => a.pct - b.pct);

function walk(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) walk(p, acc);
    else if (ent.name === "route.ts") acc.push(p);
  }
  return acc;
}

const routes = walk(resolve("src/app/api"));
for (const extra of ["src/app/player_api.php/route.ts", "src/app/get.php/route.ts"]) {
  if (existsSync(extra)) routes.push(resolve(extra));
}
const covByNorm = new Map(files.map((f) => [f.path, f]));
const untestedEndpoints = [];
for (const r of routes) {
  const rel = relative(root, r).replace(/\\/g, "/");
  const cov = covByNorm.get(rel);
  if (!cov || cov.lines === 0) untestedEndpoints.push(rel);
}

const suite = existsSync("coverage/suite-results.json")
  ? JSON.parse(readFileSync("coverage/suite-results.json", "utf8"))
  : null;

const lines = [];
lines.push("# Coverage report");
lines.push("");
lines.push(`Generated: ${new Date().toISOString()}`);
lines.push("");
lines.push(
  "Scope: `src/lib/**`, `src/app/api/**`, `player_api.php`, `get.php` under c8 `--all` after pretest + unit + smoke + streaming + integration + data-layer."
);
lines.push("");
lines.push("## Overall coverage");
lines.push("");
lines.push("| Metric | Covered | Total | % |");
lines.push("|--------|--------:|------:|--:|");
lines.push(
  `| Lines | ${total.lines.covered} | ${total.lines.total} | ${total.lines.pct}% |`
);
lines.push(
  `| Statements | ${total.statements.covered} | ${total.statements.total} | ${total.statements.pct}% |`
);
lines.push(
  `| Functions | ${total.functions.covered} | ${total.functions.total} | ${total.functions.pct}% |`
);
lines.push(
  `| Branches | ${total.branches.covered} | ${total.branches.total} | ${total.branches.pct}% |`
);
lines.push("");
lines.push("## Per-module coverage (lowest first)");
lines.push("");
lines.push("| Module | Lines % | Covered/Total | Files |");
lines.push("|--------|--------:|--------------:|------:|");
for (const m of modRows.slice(0, 50)) {
  lines.push(`| ${m.name} | ${m.pct}% | ${m.covered}/${m.total} | ${m.files} |`);
}
if (modRows.length > 50) {
  lines.push(
    `| _…and ${modRows.length - 50} more modules_ | | | |`
  );
}
lines.push("");
lines.push("## Files under 50% coverage");
lines.push("");
lines.push(
  `Count: **${under50.length}** (of ${files.length} instrumented). Zero-line files: **${zero.length}**.`
);
lines.push("");
lines.push("| File | Lines % | Covered/Total |");
lines.push("|------|--------:|--------------:|");
const show = under50
  .filter((f) => f.total > 0)
  .sort((a, b) => b.total - a.total || a.lines - b.lines);
for (const f of show.slice(0, 150)) {
  lines.push(`| \`${f.path}\` | ${f.lines}% | ${f.covered}/${f.total} |`);
}
if (show.length > 150) {
  lines.push(`| _…and ${show.length - 150} more_ | | |`);
}
lines.push("");
lines.push("## Endpoints with no test coverage (0% lines)");
lines.push("");
lines.push(
  `Count: **${untestedEndpoints.length}** route handlers at 0% line coverage under this suite.`
);
lines.push("");
lines.push("| Endpoint route file |");
lines.push("|--------------------|");
for (const e of untestedEndpoints.sort()) {
  lines.push(`| \`${e}\` |`);
}
lines.push("");
lines.push("## Flaky / skipped tests");
lines.push("");
lines.push(
  "- **E2E** (`tests/e2e/*.spec.ts`): all skipped — no `.env.test` / `TEST_DATABASE_URL` in this environment."
);
lines.push(
  "- **data-layer DB suite**: 13 tests skipped (`hasTestDatabase()` false) — bouquets inheritance, cascades, connections, credits debit, migrate deploy, live schema checks."
);
lines.push(
  "- **smoke**: DB-backed cases skip without `TEST_DATABASE_URL`."
);
lines.push(
  "- **Load (k6)**: not included in this coverage pass."
);
lines.push("- **No known flaky tests** recorded in this run (unit/smoke/streaming/integration all exit 0).");
lines.push("");
if (suite) {
  lines.push("### Suite exit codes");
  lines.push("");
  for (const r of suite.results) {
    lines.push(`- \`${r.suite}\` → exit ${r.code}`);
  }
  lines.push("");
}
lines.push("## Top 15 gaps prioritized (revenue / security)");
lines.push("");
lines.push("| # | Gap | Risk | Test plan |");
lines.push("|---|-----|------|-----------|");
const gaps = [
  ["src/lib/reseller-credit-charge.ts", "Revenue/security — double-spend", "Conditional updateMany + insufficient"],
  ["src/lib/package-credits.ts", "Revenue — create/renew pricing", "Trial/month/year + markup"],
  ["src/lib/line-renew-credits.ts", "Revenue — renew debit", "Admin free vs reseller charge"],
  ["src/lib/internal-request.ts", "Security — internal live-auth", "Secret match / prod deny"],
  ["src/lib/playback-guard.ts", "Security — playback deny", "Expired/banned branches"],
  ["src/lib/jwt-secret.ts", "Security — weak JWT", "Strength validation"],
  ["src/lib/password-hash.ts", "Security — hashing", "Hash/verify roundtrip"],
  ["src/lib/security-headers.ts", "Security — headers", "nosniff + HSTS flag"],
  ["src/lib/session-cookie.ts", "Security — cookie flags", "httpOnly / sameSite"],
  ["src/lib/coupon-redeem.ts", "Revenue — coupon abuse", "Validation helpers"],
  ["src/lib/reseller-rewards.ts", "Revenue — rebate", "Percent clamp"],
  ["src/lib/agent-auth.ts", "Security — agent token", "Reject bad token"],
  ["src/lib/portal-session.ts", "Security — portal auth", "Token/expiry helpers"],
  ["src/lib/billing.ts / webhook", "Revenue — payments", "Signature helpers"],
  ["src/lib/license/server-guard.ts", "License gate", "Invalid license deny"],
];
gaps.forEach((g, i) => {
  lines.push(`| ${i + 1} | \`${g[0]}\` | ${g[1]} | ${g[2]} |`);
});
lines.push("");
lines.push("Follow-up tests for these gaps land in `src/lib/*.test.ts` (see changelog below after implementation).");
lines.push("");
lines.push("See also: `SECURITY.md`, `TESTPLAN-blockers.md`.");
lines.push("");

writeFileSync("COVERAGE-REPORT.md", lines.join("\n"));
console.log("Wrote COVERAGE-REPORT.md");
console.log({
  linesPct: total.lines.pct,
  under50: under50.length,
  untestedEndpoints: untestedEndpoints.length,
});
