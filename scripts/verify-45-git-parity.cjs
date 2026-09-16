#!/usr/bin/env node
const { Client } = require("ssh2");
const { execSync } = require("child_process");
const path = require("path");

const PASS = process.env.DEPLOY_PASS || "";
if (!PASS) {
  console.error("Set DEPLOY_PASS");
  process.exit(1);
}

const ROOT = path.resolve(__dirname, "..");
const localHead = execSync("git rev-parse HEAD", { cwd: ROOT, encoding: "utf8" }).trim();
const originHead = execSync("git rev-parse origin/main", { cwd: ROOT, encoding: "utf8" }).trim();

const files = [
  "scripts/purge-cloudflare-panel-cache.cjs",
  "src/lib/ticket-external-notify.ts",
  "src/lib/stream-auto-category.ts",
  "src/app/reseller/settings/sidebar/page.tsx",
  "src/lib/line-iptv-login-log.ts",
  "src/app/api/admin/streams/auto-category/route.ts",
];

const remoteScript = `
set -e
cd /opt/nexlify-panel
echo LOCAL_HEAD=${localHead}
echo ORIGIN_HEAD=${originHead}
echo === server git ===
git rev-parse HEAD
git log -1 --oneline
git status -sb
dirty=$(git status --porcelain | wc -l)
echo dirty_files=$dirty
git fetch origin main 2>/dev/null || true
echo origin_main=$(git rev-parse origin/main 2>/dev/null || echo missing)
echo === key files ===
${files
  .map(
    (f) =>
      `test -f "${f}" && echo "OK ${f}" || echo "MISSING ${f}"`
  )
  .join("\n")}
echo === build ===
cat .next/BUILD_ID 2>/dev/null || echo NO_BUILD_ID
test -d .next/server/app/reseller/settings/sidebar && echo reseller_sidebar_build=YES || echo reseller_sidebar_build=NO
test -f .next/server/app/admin/settings/sidebar/page.js && echo admin_sidebar_build=YES || echo admin_sidebar_build=NO
grep -q "ticketNotifyTelegram" src/lib/panel-settings.ts 2>/dev/null && echo panel_settings_ticket=YES || echo panel_settings_ticket=NO
echo === tracked tree vs HEAD ===
echo modified_tracked=$(git diff --name-only HEAD | wc -l)
echo === health ===
curl -fsS -m 10 http://127.0.0.1:13000/api/health; echo
echo === nginx store ===
grep -l "darkcdn.store" /etc/nginx/conf.d/*.conf 2>/dev/null | head -3
echo PARITY_CHECK_OK
`;

console.log("Local HEAD:", localHead);
console.log("Origin main:", originHead);
console.log("Match local↔origin:", localHead === originHead ? "YES" : "NO");
console.log("");

const conn = new Client();
conn
  .on("ready", () => {
    conn.exec(remoteScript, (err, stream) => {
      if (err) throw err;
      stream.on("data", (d) => process.stdout.write(d));
      stream.stderr.on("data", (d) => process.stderr.write(d));
      stream.on("close", (code) => {
        const serverMatch = localHead === originHead;
        if (!serverMatch) process.exitCode = 1;
        process.exit(code || 0);
      });
    });
  })
  .on("error", (e) => {
    console.error(e);
    process.exit(1);
  })
  .connect({
    host: process.env.DEPLOY_HOST || "45.88.138.18",
    port: 22,
    username: "root",
    password: PASS,
    readyTimeout: 30000,
  });
