#!/usr/bin/env node
/** Verify dashboard bandwidth fix is live. */
const http = require("http");
const fs = require("fs");

function get(path) {
  return new Promise((resolve, reject) => {
    http
      .get(`http://127.0.0.1:13000${path}`, { timeout: 15000 }, (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => resolve({ status: res.statusCode, body }));
      })
      .on("error", reject);
  });
}

(async () => {
  const srcOk = fs.readFileSync("/opt/nexlify-panel/src/lib/dashboard-server-metrics.ts", "utf8").includes(
    "getDashboardPlaybackBandwidth"
  );
  const ribbonOk = fs.readFileSync("/opt/nexlify-panel/src/components/dashboard-xui-kpi-ribbon.tsx", "utf8").includes(
    "LB egress"
  );
  const credOk = fs.readFileSync("/opt/nexlify-panel/src/lib/credential-generate.ts", "utf8").includes(
    "clampLineCredentialMinLength"
  );
  console.log(JSON.stringify({ srcOk, ribbonOk, credOk }, null, 2));

  // Smoke: require the built module path isn't available; check chunk strings
  const { execSync } = require("child_process");
  const lbInBuild = execSync(
    "grep -l 'LB egress' /opt/nexlify-panel/.next/standalone/.next/static/chunks/*.js 2>/dev/null | wc -l",
    { encoding: "utf8" }
  ).trim();
  const playbackInBuild = execSync(
    "grep -l 'panelProxyMbps\\|getDashboardPlaybackBandwidth' /opt/nexlify-panel/.next/standalone/.next/server/chunks/*.js 2>/dev/null | wc -l",
    { encoding: "utf8" }
  ).trim();
  console.log(JSON.stringify({ lbInBuild: Number(lbInBuild), playbackInBuild: Number(playbackInBuild) }));

  const health = await get("/api/health");
  console.log("health", health.status, health.body.slice(0, 120));

  // Direct function test via node requiring compiled? Use a small inline require of source via ts-node unlikely.
  // Instead hit admin stats without auth to confirm 401 (route alive)
  const stats = await get("/api/admin/stats");
  console.log("stats", stats.status);

  const media = (fs.readFileSync("/opt/nexlify-panel/.next/standalone/.env", "utf8").match(/^NEXLIFY_MEDIA_ORIGIN=(.*)$/m) || [])[1];
  console.log("NEXLIFY_MEDIA_ORIGIN", media || null);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
