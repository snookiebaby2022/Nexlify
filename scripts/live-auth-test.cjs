#!/usr/bin/env node
const fs = require("fs");
const { spawnSync } = require("child_process");

function secret() {
  const env = fs.readFileSync(".env", "utf8");
  for (const line of env.split("\n")) {
    if (!line.startsWith("PANEL_INTERNAL_SECRET=")) continue;
    let v = line.slice("PANEL_INTERNAL_SECRET=".length).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    return v;
  }
  return "";
}

function call(ext) {
  const s = secret();
  const uri = `/live/_smoke_test/SmokeTest2026!/cmstw2mejj94yvhyagpdlfbvw.${ext}`;
  const r = spawnSync(
    "curl",
    [
      "-sS",
      "-D",
      "/tmp/la.hdr",
      "-o",
      "/tmp/la.body",
      "-w",
      "%{http_code}",
      "-H",
      `x-panel-internal-secret: ${s}`,
      "-H",
      `x-original-uri: ${uri}`,
      "-H",
      "x-forwarded-for: 203.0.113.50",
      "-H",
      "user-agent: VLC/3.0.20",
      "http://127.0.0.1:13000/api/internal/live-auth",
    ],
    { encoding: "utf8" }
  );
  const hdr = fs.readFileSync("/tmp/la.hdr", "utf8");
  const body = fs.readFileSync("/tmp/la.body", "utf8");
  console.log(`\n=== live-auth ${ext} HTTP ${r.stdout.trim()} ===`);
  console.log(hdr.split("\r\n").slice(0, 12).join("\n"));
  console.log("body:", body.slice(0, 120));
}

call("ts");
call("m3u8");
