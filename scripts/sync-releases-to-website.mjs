#!/usr/bin/env node
/**
 * Emit TypeScript release entries from src/lib/panel-releases.json
 * for nexlify-web src/lib/updates.ts (run on VPS via sync-releases-to-website.ps1).
 */
import { readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const jsonPath = join(root, "src", "lib", "panel-releases.json");
const feed = JSON.parse(readFileSync(jsonPath, "utf8"));

function tsString(s) {
  return JSON.stringify(s);
}

function releaseToTs(r) {
  const lines = [
    "  {",
    `    version: ${tsString(r.version)},`,
    `    date: ${tsString(r.date)},`,
    `    channel: ${tsString(r.channel)},`,
    `    summary:`,
    `      ${tsString(r.summary ?? "")},`,
  ];
  if (r.notes?.length) {
    lines.push("    notes: [");
    for (const n of r.notes) lines.push(`      ${tsString(n)},`);
    lines.push("    ],");
  }
  lines.push("    changelog: [");
  for (const c of r.changelog ?? []) lines.push(`      ${tsString(c)},`);
  lines.push("    ],");
  lines.push("    fixes: [");
  for (const f of r.fixes ?? []) lines.push(`      ${tsString(f)},`);
  lines.push("    ],");
  lines.push("  },");
  return lines.join("\n");
}

const entries = feed.releases.map(releaseToTs).join("\n");
const out = join(root, "scripts", ".panel-releases-website-snippet.ts");
const snippet = `// Generated from src/lib/panel-releases.json — do not edit by hand\nexport const PANEL_RELEASES_LATEST = ${tsString(feed.latestVersion)};\nexport const PANEL_RELEASES_SNIPPET = [\n${entries}\n];\n`;
writeFileSync(out, snippet, "utf8");
console.log(`Wrote ${out} (${feed.releases.length} releases, latest ${feed.latestVersion})`);
