#!/usr/bin/env node
/**
 * Xtream Codes API probe for selected domains × ports.
 * Run on panel: node scripts/xtream-domain-port-probe.cjs
 */
const fs = require("fs");
const path = require("path");
const { execSync, spawnSync } = require("child_process");

const root = fs.existsSync("/opt/nexlify-panel/package.json")
  ? "/opt/nexlify-panel"
  : path.join(__dirname, "..");
process.chdir(root);
require(path.join(root, "scripts/load-env.cjs")).loadEnv();

const DOMAINS = [
  "darkcdn.site",
  "darkcdn.store",
  "bladesmedia.darkcdn.win",
  "bladesmedia2.darkcdn.win",
];
const PORTS = [
  { port: 80, scheme: "http" },
  { port: 8080, scheme: "http" },
  { port: 25461, scheme: "http" },
  { port: 443, scheme: "https" },
];
const UA = "Mozilla/5.0 (compatible; XtreamProbe/1.0)";

function sh(cmd) {
  try {
    return execSync(cmd, { encoding: "utf8", maxBuffer: 4e6 }).trim();
  } catch (e) {
    return String(e.stdout || e.stderr || e.message || e).trim();
  }
}

function getCreds() {
  const out = sh("node scripts/ensure-smoke-test-line.cjs 2>/dev/null | tail -1");
  const line = out.split("\n").filter(Boolean).pop();
  return JSON.parse(line);
}

function curlJson(url) {
  const tmp = `/tmp/xc-probe-${process.pid}-${Math.random().toString(16).slice(2)}.json`;
  const hdr = `/tmp/xc-probe-${process.pid}-h.txt`;
  const r = spawnSync(
    "curl",
    [
      "-skS",
      "-m",
      "12",
      "-A",
      UA,
      "-D",
      hdr,
      "-o",
      tmp,
      "-w",
      "%{http_code}|%{time_total}|%{remote_ip}",
      url,
    ],
    { encoding: "utf8" }
  );
  const meta = String(r.stdout || "").trim();
  const [http, time, ip] = meta.split("|");
  let body = "";
  try {
    body = fs.readFileSync(tmp, "utf8");
  } catch {
    body = "";
  }
  let json = null;
  try {
    json = JSON.parse(body);
  } catch {
    json = null;
  }
  try {
    fs.unlinkSync(tmp);
  } catch {
    /* ignore */
  }
  return {
    http: http || "000",
    time: time || "",
    ip: ip || "",
    json,
    err: r.status !== 0 ? String(r.stderr || "").slice(0, 120) : "",
    bodyHead: body.slice(0, 120).replace(/\s+/g, " "),
  };
}

function summarize(r) {
  if (!r.json) {
    return {
      ok: false,
      reason: r.err || `non-json http=${r.http}`,
      auth: null,
      url: null,
      port: null,
      https_port: null,
      proto: null,
    };
  }
  const ui = r.json.user_info || {};
  const si = r.json.server_info || {};
  const auth = ui.auth;
  const ok =
    String(r.http) === "200" &&
    (auth === 1 || auth === "1") &&
    typeof si.url === "string" &&
    si.url.length > 0;
  return {
    ok,
    reason: ok ? "ok" : `auth=${auth} http=${r.http}`,
    auth,
    url: si.url ?? null,
    port: si.port ?? null,
    https_port: si.https_port ?? null,
    proto: si.server_protocol ?? null,
  };
}

(async () => {
  const creds = getCreds();
  const u = encodeURIComponent(creds.u);
  const p = encodeURIComponent(creds.p);
  console.log(`creds user=${creds.u} (smoke line)`);
  console.log("");

  const rows = [];
  for (const host of DOMAINS) {
    for (const { port, scheme } of PORTS) {
      const origin =
        (scheme === "https" && port === 443) || (scheme === "http" && port === 80)
          ? `${scheme}://${host}`
          : `${scheme}://${host}:${port}`;
      const url = `${origin}/player_api.php?username=${u}&password=${p}`;
      const r = curlJson(url);
      const s = summarize(r);
      const row = {
        host,
        port,
        scheme,
        http: r.http,
        ip: r.ip,
        ms: r.time,
        ...s,
      };
      rows.push(row);
      const mark = s.ok ? "PASS" : "FAIL";
      console.log(
        `${mark} ${host}:${port} http=${r.http} ip=${r.ip || "-"} auth=${s.auth} advertise=${s.url}:${s.port}/${s.https_port} ${s.proto || ""} ${s.ok ? "" : s.reason + " " + r.bodyHead}`
      );
    }
    console.log("");
  }

  const pass = rows.filter((r) => r.ok).length;
  const fail = rows.filter((r) => !r.ok).length;
  console.log("=== SUMMARY ===");
  console.log(`total=${rows.length} pass=${pass} fail=${fail}`);
  if (fail) {
    console.log("failures:");
    for (const r of rows.filter((x) => !x.ok)) {
      console.log(`  - ${r.host}:${r.port} http=${r.http} ${r.reason}`);
    }
  }
  fs.writeFileSync("/tmp/xtream-domain-port-probe.json", JSON.stringify({ credsUser: creds.u, rows }, null, 2));
  console.log("wrote /tmp/xtream-domain-port-probe.json");
  console.log(fail ? "XTREAM_PROBE_FAIL" : "XTREAM_PROBE_OK");
  process.exitCode = fail ? 1 : 0;
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
