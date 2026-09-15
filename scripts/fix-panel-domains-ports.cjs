#!/usr/bin/env node
/**
 * Make all configured panel domains work on 80/443/8080:
 * - sync .env allowlist (already usually set)
 * - nginx: xmltv.php → panel :13000 (not refuse-media :8080)
 * - nginx: server_name includes all domains
 * - DB: Main + 10gbs domain/port metadata
 * - edge TLS SAN for LB hostnames
 * - verify with browser UA
 *
 * Run on panel 45: node scripts/fix-panel-domains-ports.cjs
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const root = fs.existsSync("/opt/nexlify-panel/package.json")
  ? "/opt/nexlify-panel"
  : path.join(__dirname, "..");
process.chdir(root);
require(path.join(root, "scripts/load-env.cjs")).loadEnv();
const { PrismaClient } = require(path.join(root, "node_modules/@prisma/client"));
const { decryptAtRest, withSshClient, sshExec } = require(path.join(root, "scripts/ssh-10gbs-lib.cjs"));

const PANEL_IP = "45.88.138.18";
const LB_IP = "209.237.141.15";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36";

function sh(cmd) {
  try {
    return execSync(cmd, { encoding: "utf8", maxBuffer: 4e6 }).trim();
  } catch (e) {
    return String(e.stdout || e.stderr || e.message || e).trim();
  }
}

function uniq(arr) {
  return [...new Set(arr.filter(Boolean))];
}

function persistEnv(primary, extras) {
  const envPath = path.join(root, ".env");
  let lines = fs.readFileSync(envPath, "utf8").replace(/\r\n/g, "\n").split("\n");
  const upsert = (k, v) => {
    let found = false;
    lines = lines.map((line) => {
      if (line.startsWith(`${k}=`)) {
        found = true;
        return `${k}=${v}`;
      }
      return line;
    });
    if (!found) lines.push(`${k}=${v}`);
  };
  upsert("PANEL_PRIMARY_DOMAIN", primary);
  upsert("PANEL_EXTRA_DOMAINS", extras.join(","));
  fs.writeFileSync(envPath, `${lines.join("\n").replace(/\n+$/, "")}\n`);
}

function fixNginxFiles(allNames) {
  const files = [
    "/etc/nginx/conf.d/nexlify-panel-http.conf",
    "/etc/nginx/conf.d/nexlify-panel-https.conf",
  ];
  sh("bash scripts/lock-live-routing-45.sh unlock");
  const nameList = uniq(["_", ...allNames]).join(" ");

  for (const f of files) {
    if (!fs.existsSync(f)) continue;
    let t = fs.readFileSync(f, "utf8");
    // Exact xmltv must hit panel Next, not refuse-media :8080
    t = t.replace(
      /location = \/xmltv\.php \{[\s\S]*?proxy_pass http:\/\/127\.0\.0\.1:8080;/g,
      (block) => block.replace("proxy_pass http://127.0.0.1:8080;", "proxy_pass http://127.0.0.1:13000;")
    );
    // Expand server_name
    if (f.includes("https")) {
      t = t.replace(/^(\s*)server_name\s+[^;]+;/m, `$1server_name ${nameList};`);
    } else {
      // keep default_server; list domains + _
      t = t.replace(/^(\s*)server_name\s+[^;]+;/m, `$1server_name ${nameList};`);
    }
    fs.writeFileSync(f, t);
    console.log("patched", f);
  }

  // Also expand :8080 server_name for Host-aware API
  const edge8080 = "/etc/nginx/conf.d/nexlify-live-remote-edge.conf";
  if (fs.existsSync(edge8080)) {
    let t = fs.readFileSync(edge8080, "utf8");
    t = t.replace(/^(\s*)server_name\s+[^;]+;/m, `$1server_name ${nameList};`);
    fs.writeFileSync(edge8080, t);
    console.log("patched", edge8080);
  }

  console.log(sh("nginx -t 2>&1"));
  sh("systemctl reload nginx || nginx -s reload");

  // Re-immutable without restore (preserve our patches)
  for (const f of [
    ...files,
    edge8080,
    path.join(root, "scripts/iptv-edge-proxy.mjs"),
  ]) {
    if (fs.existsSync(f)) sh(`chattr +i ${f}`);
  }
  fs.mkdirSync("/etc/nexlify", { recursive: true });
  fs.writeFileSync(
    "/etc/nexlify/live-routing.lock",
    `locked_at=${new Date().toISOString()}\nrule=panel refuses /live/ (502)\nxmltv=13000\ndomains=${allNames.join(",")}\n`
  );
  console.log("nginx re-locked (xmltv→13000, server_names expanded)");
}

async function updateDb(p, allPanelDomains, lbDomains) {
  const primary = allPanelDomains[0];
  const extras = allPanelDomains.slice(1);

  await p.panelSetting.upsert({
    where: { key: "settings.domains" },
    create: {
      key: "settings.domains",
      value: JSON.stringify({
        primaryDomain: primary,
        extraDomains: extras,
        sslEnabled: false,
        forceHttps: false,
        fullSslEncryption: false,
        certbotEmail: "",
        certFullChainPath: "",
        certKeyPath: "",
        lastCertbotRun: null,
      }),
    },
    update: {
      value: JSON.stringify({
        primaryDomain: primary,
        extraDomains: extras,
        sslEnabled: false,
        forceHttps: false,
        fullSslEncryption: false,
        certbotEmail: "",
        certFullChainPath: "",
        certKeyPath: "",
        lastCertbotRun: null,
      }),
    },
  });

  const main = await p.streamServer.findFirst({ where: { host: PANEL_IP } });
  if (main) {
    const ps = { ...(main.panelSettings || {}) };
    ps.advanced = {
      ...(ps.advanced || {}),
      serverRole: "main",
      httpPorts: [80, 8080],
      httpsPorts: [443],
    };
    await p.streamServer.update({
      where: { id: main.id },
      data: {
        domain: allPanelDomains.join(","),
        port: 80,
        httpsPort: 443,
        panelSettings: ps,
      },
    });
    console.log("updated Main Server domains/ports");
  }

  const lb = await p.streamServer.findFirst({ where: { host: LB_IP } });
  if (lb) {
    const ps = { ...(lb.panelSettings || {}) };
    ps.advanced = {
      ...(ps.advanced || {}),
      serverRole: "lb",
      httpPorts: [80, 8080, 25461],
      httpsPorts: [443],
    };
    await p.streamServer.update({
      where: { id: lb.id },
      data: {
        domain: lbDomains.join(",") || null,
        port: 8080,
        httpsPort: 443,
        panelSettings: ps,
      },
    });
    console.log("updated 10gbs domains/ports");
  }
}

async function fixEdgeTlsSans(p, lbDomains) {
  const s = await p.streamServer.findFirst({ where: { name: "10gbs" } });
  if (!s?.agentSshPasswordEnc) return;
  const password = decryptAtRest(s.agentSshPasswordEnc);
  const sans = uniq([LB_IP, ...lbDomains, "darkcdn.site", "bladesmedia2.darkcdn.win"]);
  const sanArg = [
    `IP:${LB_IP}`,
    ...sans.filter((h) => !/^\d+\.\d+\.\d+\.\d+$/.test(h)).map((h) => `DNS:${h}`),
  ].join(",");

  await withSshClient(
    {
      host: s.agentSshHost || s.host,
      port: s.agentSshPort || 22,
      username: s.agentSshUser || "root",
      password,
    },
    async (c) => {
      const r = await sshExec(
        c,
        `
set -e
mkdir -p /etc/nginx/ssl/nexlify-panel
# Keep existing if already has DNS SAN for darkcdn.site
if openssl x509 -in /etc/nginx/ssl/nexlify-panel/fullchain.pem -noout -text 2>/dev/null | grep -q 'DNS:darkcdn.site'; then
  echo 'edge cert already has darkcdn.site SAN'
else
  openssl req -x509 -nodes -newkey rsa:2048 -days 825 \
    -keyout /etc/nginx/ssl/nexlify-panel/privkey.pem \
    -out /etc/nginx/ssl/nexlify-panel/fullchain.pem \
    -subj '/CN=${LB_IP}' \
    -addext 'subjectAltName=${sanArg}' 2>/dev/null \
  || openssl req -x509 -nodes -newkey rsa:2048 -days 825 \
    -keyout /etc/nginx/ssl/nexlify-panel/privkey.pem \
    -out /etc/nginx/ssl/nexlify-panel/fullchain.pem \
    -subj '/CN=${LB_IP}'
  echo 'regenerated edge TLS cert'
  pm2 restart nexlify-iptv-edge --update-env || true
  sleep 2
fi
openssl x509 -in /etc/nginx/ssl/nexlify-panel/fullchain.pem -noout -text | grep -A1 'Subject Alternative Name' | tail -1
for h in ${LB_IP} ${lbDomains.join(" ")}; do
  [ -z "$h" ] && continue
  curl -skS -m 4 -o /dev/null -w "https://$h/edge/health %{http_code}\\n" "https://$h/edge/health" || true
  curl -sS -m 4 -o /dev/null -w "http://$h:8080/edge/health %{http_code}\\n" "http://$h:8080/edge/health" || true
done
`,
        { timeoutMs: 90_000 }
      );
      process.stdout.write(r.stdout || "");
      if (r.stderr) process.stderr.write(String(r.stderr).slice(0, 1500));
    }
  );
}

function verify(allPanelDomains, lbDomains) {
  console.log("\n=== VERIFY (browser UA) ===");
  const bad = [];
  for (const h of allPanelDomains) {
    const root = sh(
      `curl -sS -m 6 -o /dev/null -w '%{http_code}|%{redirect_url}' -A '${UA}' -H 'Host: ${h}' http://127.0.0.1/`
    );
    const login = sh(
      `curl -sS -m 6 -o /dev/null -w '%{http_code}' -A '${UA}' -H 'Host: ${h}' http://127.0.0.1/login`
    );
    const api = sh(
      `curl -sS -m 6 -o /dev/null -w '%{http_code}' -A '${UA}' -H 'Host: ${h}' http://127.0.0.1/player_api.php`
    );
    const httpsApi = sh(
      `curl -skS -m 6 -o /dev/null -w '%{http_code}' -A '${UA}' -H 'Host: ${h}' https://127.0.0.1/player_api.php`
    );
    const p8080 = sh(
      `curl -sS -m 6 -o /dev/null -w '%{http_code}' -A '${UA}' -H 'Host: ${h}' http://127.0.0.1:8080/player_api.php`
    );
    const live = sh(
      `curl -sS -m 4 -o /dev/null -w '%{http_code}' -A '${UA}' -H 'Host: ${h}' http://127.0.0.1/live/x/y/1.ts`
    );
    const xmltv = sh(
      `curl -sS -m 8 -o /dev/null -w '%{http_code}' -A '${UA}' -H 'Host: ${h}' 'http://127.0.0.1/xmltv.php'`
    );
    const rootOk = root.startsWith("307") || root.startsWith("302") || root.startsWith("200");
    const rowOk =
      rootOk &&
      login === "200" &&
      ["200", "401"].includes(api) &&
      ["200", "401"].includes(httpsApi) &&
      ["200", "401"].includes(p8080) &&
      live === "502" &&
      ["200", "401", "400"].includes(xmltv) &&
      xmltv !== "502";
    console.log(
      `${rowOk ? "OK " : "BAD"} ${h} root=${root} login=${login} api=${api} httpsApi=${httpsApi} :8080=${p8080} live=${live} xmltv=${xmltv}`
    );
    if (!rowOk) bad.push(h);
  }

  console.log("\n=== VERIFY LB media domains ===");
  for (const h of uniq([LB_IP, ...lbDomains])) {
    for (const [port, url] of [
      ["80", `http://${h}/edge/health`],
      ["8080", `http://${h}:8080/edge/health`],
      ["25461", `http://${h}:25461/edge/health`],
      ["443", `https://${h}/edge/health`],
    ]) {
      const code = sh(`curl -skS -m 5 -o /dev/null -w '%{http_code}' '${url}'`);
      const ok = code === "200";
      console.log(`${ok ? "OK " : "BAD"} ${h}:${port}=${code}`);
      if (!ok) bad.push(`${h}:${port}`);
    }
  }

  // Advertise check
  console.log("\n=== server_info advertise sample ===");
  sh(`node scripts/ensure-smoke-test-line.cjs >/dev/null 2>&1 || true`);
  for (const h of ["darkcdn.store", "darkcdn.site", "bladesmedia2.darkcdn.win"]) {
    const out = sh(
      `curl -sS -m 10 -A '${UA}' -H 'Host: ${h}' 'http://127.0.0.1/player_api.php?username=_smoke_test&password=SmokeTest2026%21' -o /tmp/si.json; node -e "const j=require('/tmp/si.json'); console.log('${h}', j.user_info&&j.user_info.auth, j.server_info&&j.server_info.url, j.server_info&&j.server_info.port, j.server_info&&j.server_info.https_port, j.server_info&&j.server_info.server_protocol)"`
    );
    console.log(out);
  }

  if (bad.length) {
    console.log("\nISSUES:", bad.join(", "));
    process.exitCode = 1;
  } else {
    console.log("\nALL_DOMAIN_PORTS_OK");
  }
}

(async () => {
  const p = new PrismaClient();
  const row = await p.panelSetting.findUnique({ where: { key: "settings.domains" } });
  const domains = row?.value ? JSON.parse(row.value) : {};
  const primary = domains.primaryDomain || process.env.PANEL_PRIMARY_DOMAIN || "darkcdn.store";
  const extras = Array.isArray(domains.extraDomains) ? domains.extraDomains : [];
  const allPanelDomains = uniq([primary, ...extras]);

  // Hosts that DNS to LB = media domains
  const lbDomains = [];
  for (const h of allPanelDomains) {
    const ips = sh(
      `dig +short A ${h} 2>/dev/null | grep -E '^[0-9.]+$' || true`
    )
      .split(/\s+/)
      .filter(Boolean);
    if (ips.includes(LB_IP) && !ips.includes(PANEL_IP)) lbDomains.push(h);
  }
  // Always include known media hosts even if temporarily mis-resolved
  for (const h of ["darkcdn.site", "bladesmedia2.darkcdn.win"]) {
    if (!lbDomains.includes(h) && allPanelDomains.includes(h)) lbDomains.push(h);
  }

  console.log("primary", primary);
  console.log("all", allPanelDomains.join(","));
  console.log("lbDomains", lbDomains.join(",") || "(none)");

  persistEnv(primary, allPanelDomains.filter((d) => d !== primary));
  console.log("env synced");

  fixNginxFiles(allPanelDomains);
  await updateDb(p, allPanelDomains, lbDomains);

  sh("pm2 restart nexlify --update-env 2>/dev/null || true");
  sh("pm2 restart nexlify-cron --update-env 2>/dev/null || true");
  sh("sleep 2");

  await fixEdgeTlsSans(p, lbDomains);
  verify(allPanelDomains, lbDomains);

  await p.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
