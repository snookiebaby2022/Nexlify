#!/usr/bin/env node
const fs = require("fs");
const { execSync } = require("child_process");
const checks = [
  ["/opt/nexlify-panel/src/lib/dashboard-server-metrics.ts", "getDashboardPlaybackBandwidth"],
  ["/opt/nexlify-panel/src/components/dashboard-xui-kpi-ribbon.tsx", "LB egress"],
  ["/opt/nexlify-panel/src/lib/credential-generate.ts", "clampLineCredentialMinLength"],
];
for (const [file, needle] of checks) {
  const ok = fs.existsSync(file) && fs.readFileSync(file, "utf8").includes(needle);
  console.log(`${ok ? "OK" : "MISSING"} ${needle} in ${file}`);
}
try {
  console.log(execSync("pm2 list | grep nexlify | head -5", { encoding: "utf8" }));
} catch (e) {
  console.log("pm2 check failed");
}
try {
  console.log("health:", execSync("curl -sS -m 5 http://127.0.0.1:13000/api/health", { encoding: "utf8" }).trim());
} catch {
  console.log("health: fail");
}
