#!/usr/bin/env node
/**
 * Complete port / Redis / nginx repair across panel + all SSH-capable stream servers.
 *
 * Panel (Main): nginx media refuse, Redis cache + slots (:6380 noeviction), no iptv-edge.
 * Edge LBs: companion modules, HTTP 80/8080/25461, HTTPS 443 when certs exist, XUI off ports.
 *
 * Run on panel host:
 *   node scripts/fix-all-servers-ports.cjs
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

const PANEL_IPS = new Set(["45.88.138.18", "127.0.0.1", "localhost"]);
const remoteBody = fs.readFileSync(path.join(__dirname, "fix-edge-ports-remote.sh"), "utf8");

function sh(cmd) {
  try {
    return execSync(cmd, { encoding: "utf8", maxBuffer: 4e6 }).trim();
  } catch (e) {
    return String(e.stdout || e.stderr || e.message || e).trim();
  }
}

async function pushFile(c, localName, remotePath) {
  const local = path.join(root, "scripts", localName);
  if (!fs.existsSync(local)) {
    console.log(`  skip missing ${localName}`);
    return;
  }
  const body = fs.readFileSync(local);
  await sshExec(c, `chattr -i ${remotePath} 2>/dev/null || true`);
  const w = await sshExec(c, `cat > ${remotePath}`, { stdin: body, timeoutMs: 120_000 });
  if (w.code !== 0) throw new Error(`upload ${localName}: ${w.stderr || w.stdout}`);
  console.log(`  pushed ${localName} (${body.length}b)`);
  if (localName === "iptv-edge-proxy.mjs") {
    await sshExec(c, `chattr +i ${remotePath} 2>/dev/null || true`);
  }
}

function ensureSlotsRedis() {
  console.log("\n######## PANEL Redis ########");
  console.log("6379:", sh("redis-cli ping"));
  console.log(
    "6379 policy:",
    sh("redis-cli CONFIG GET maxmemory-policy 2>/dev/null | tr '\\n' ' '")
  );

  let slots = sh("redis-cli -p 6380 ping 2>&1");
  if (!/PONG/i.test(slots)) {
    console.log("starting Redis :6380 (noeviction) for connection slots...");
    sh("mkdir -p /var/lib/redis-slots /var/log/redis /var/run/redis /etc/redis");
    const conf = "/etc/redis/redis-slots.conf";
    fs.writeFileSync(
      conf,
      [
        "port 6380",
        "bind 127.0.0.1",
        "protected-mode yes",
        "daemonize yes",
        "pidfile /var/run/redis/redis-slots.pid",
        "logfile /var/log/redis/redis-slots.log",
        "dir /var/lib/redis-slots",
        "maxmemory 256mb",
        "maxmemory-policy noeviction",
        'save ""',
        "appendonly no",
        "",
      ].join("\n")
    );
    sh("id redis >/dev/null 2>&1 && chown -R redis:redis /var/lib/redis-slots || true");
    // Prefer redis user when available
    const started = sh(
      `su -s /bin/bash redis -c 'redis-server ${conf}' 2>&1 || redis-server ${conf} 2>&1`
    );
    console.log(started || "redis-server launched");
    // brief wait
    for (let i = 0; i < 10; i++) {
      slots = sh("redis-cli -p 6380 ping 2>&1");
      if (/PONG/i.test(slots)) break;
      sh("sleep 0.3");
    }
  }
  console.log("6380:", sh("redis-cli -p 6380 ping 2>&1"));
  console.log(
    "6380 policy:",
    sh("redis-cli -p 6380 CONFIG GET maxmemory-policy 2>/dev/null | tr '\\n' ' '")
  );

  if (/PONG/i.test(sh("redis-cli -p 6380 ping 2>&1"))) {
    const envPath = path.join(root, ".env");
    let env = fs.readFileSync(envPath, "utf8");
    if (!/^REDIS_SLOTS_URL=/m.test(env)) {
      env += "\nREDIS_SLOTS_URL=redis://127.0.0.1:6380\n";
      fs.writeFileSync(envPath, env);
      console.log("added REDIS_SLOTS_URL");
    } else {
      env = env.replace(/^REDIS_SLOTS_URL=.*/m, "REDIS_SLOTS_URL=redis://127.0.0.1:6380");
      fs.writeFileSync(envPath, env);
      console.log("set REDIS_SLOTS_URL=redis://127.0.0.1:6380");
    }
    // systemd unit for reboot persistence
    const unit = `/etc/systemd/system/redis-slots.service`;
    if (!fs.existsSync(unit)) {
      fs.writeFileSync(
        unit,
        `[Unit]
Description=Nexlify Redis connection-slots (6380 noeviction)
After=network.target

[Service]
Type=forking
ExecStart=/usr/bin/redis-server /etc/redis/redis-slots.conf
PIDFile=/var/run/redis/redis-slots.pid
Restart=on-failure

[Install]
WantedBy=multi-user.target
`
      );
      sh("systemctl daemon-reload; systemctl enable redis-slots.service 2>&1 || true");
    }
    sh("pm2 restart nexlify --update-env 2>/dev/null || true");
    sh("pm2 restart nexlify-cron --update-env 2>/dev/null || true");
  }
}

function ensurePanelNginx() {
  console.log("\n######## PANEL nginx ########");
  console.log(sh("nginx -t 2>&1"));
  console.log("active:", sh("systemctl is-active nginx"));
  // never run edge on panel
  sh("pm2 delete nexlify-iptv-edge 2>/dev/null || true");
  const live = sh("curl -sS -m 3 -o /dev/null -w '%{http_code}' http://127.0.0.1/live/x/y/1.ts");
  const movie = sh("curl -sS -m 3 -o /dev/null -w '%{http_code}' http://127.0.0.1/movie/x/y/1.mp4");
  const series = sh("curl -sS -m 3 -o /dev/null -w '%{http_code}' http://127.0.0.1/series/x/y/1.mp4");
  const ts = sh("curl -sS -m 3 -o /dev/null -w '%{http_code}' http://127.0.0.1/timeshift/x/y/1.ts");
  console.log(`refuse media: live=${live} movie=${movie} series=${series} timeshift=${ts}`);
  if ([live, movie, series, ts].some((c) => c !== "502")) {
    console.log("WARNING: media refuse not all 502 — re-lock live routing");
    sh("bash scripts/lock-live-routing-45.sh 2>&1 | tail -20");
  }
  // Panel API ports
  console.log(
    "panel http:",
    sh("curl -sS -m 3 -o /dev/null -w '%{http_code}' http://127.0.0.1/")
  );
  console.log(
    "panel https:",
    sh("curl -skS -m 3 -o /dev/null -w '%{http_code}' https://127.0.0.1/")
  );
  console.log(
    "panel 8080:",
    sh("curl -sS -m 3 -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/")
  );
}

async function maybeCopyTlsToEdge(c) {
  // If edge has no certs, copy panel self-signed / LE material for IP HTTPS playback
  const check = await sshExec(
    c,
    `ls /etc/nginx/ssl/nexlify-panel/fullchain.pem /etc/letsencrypt/live/*/fullchain.pem /opt/nexlify-panel/ssl/fullchain.pem 2>/dev/null | head -3`
  );
  if ((check.stdout || "").trim()) {
    console.log("  edge already has TLS material");
    return;
  }
  const panelCert =
    [
      "/etc/nginx/ssl/nexlify-panel/fullchain.pem",
      "/etc/letsencrypt/live/darkcdn.store/fullchain.pem",
    ].find((p) => fs.existsSync(p)) || null;
  const panelKey = panelCert
    ? panelCert.replace("fullchain.pem", "privkey.pem")
    : null;
  if (!panelCert || !panelKey || !fs.existsSync(panelKey)) {
    console.log("  no panel cert to copy — generating self-signed on edge for :443");
    await sshExec(
      c,
      `
mkdir -p /etc/nginx/ssl/nexlify-panel
if [ ! -f /etc/nginx/ssl/nexlify-panel/fullchain.pem ]; then
  openssl req -x509 -nodes -newkey rsa:2048 -days 825 \
    -keyout /etc/nginx/ssl/nexlify-panel/privkey.pem \
    -out /etc/nginx/ssl/nexlify-panel/fullchain.pem \
    -subj '/CN=209.237.141.15' \
    -addext 'subjectAltName=IP:209.237.141.15,DNS:bladesmedia2.darkcdn.win,DNS:darkcdn.store' 2>/dev/null \
  || openssl req -x509 -nodes -newkey rsa:2048 -days 825 \
    -keyout /etc/nginx/ssl/nexlify-panel/privkey.pem \
    -out /etc/nginx/ssl/nexlify-panel/fullchain.pem \
    -subj '/CN=209.237.141.15'
fi
ls -la /etc/nginx/ssl/nexlify-panel/
`,
      { timeoutMs: 60_000 }
    );
    return;
  }
  console.log("  copying TLS certs from panel -> edge");
  await sshExec(c, "mkdir -p /etc/nginx/ssl/nexlify-panel");
  await sshExec(c, "cat > /etc/nginx/ssl/nexlify-panel/fullchain.pem", {
    stdin: fs.readFileSync(panelCert),
    timeoutMs: 60_000,
  });
  await sshExec(c, "cat > /etc/nginx/ssl/nexlify-panel/privkey.pem", {
    stdin: fs.readFileSync(panelKey),
    timeoutMs: 60_000,
  });
}

async function main() {
  ensurePanelNginx();
  ensureSlotsRedis();

  const p = new PrismaClient();
  const rows = await p.streamServer.findMany({ orderBy: { name: "asc" } });

  for (const s of rows) {
    if (PANEL_IPS.has(s.host)) {
      console.log(`\n######## skip panel row ${s.name} ########`);
      continue;
    }
    if (!s.agentSshPasswordEnc) {
      console.log(`\n######## skip ${s.name}: no SSH password ########`);
      continue;
    }

    const host = s.agentSshHost || s.host;
    console.log(`\n######## EDGE ${s.name} @ ${host} ########`);
    const password = decryptAtRest(s.agentSshPasswordEnc);
    await withSshClient(
      {
        host,
        port: s.agentSshPort || 22,
        username: s.agentSshUser || "root",
        password,
      },
      async (c) => {
        await pushFile(c, "edge-redis-slots.mjs", "/opt/nexlify-panel/scripts/edge-redis-slots.mjs");
        await pushFile(c, "edge-redis-auth.mjs", "/opt/nexlify-panel/scripts/edge-redis-auth.mjs");
        await pushFile(c, "iptv-edge-proxy.mjs", "/opt/nexlify-panel/scripts/iptv-edge-proxy.mjs");
        await maybeCopyTlsToEdge(c);
        const r = await sshExec(c, "bash -s", { stdin: remoteBody, timeoutMs: 180_000 });
        process.stdout.write(r.stdout || "");
        if (r.stderr) process.stderr.write(String(r.stderr).slice(0, 3000));
        if (r.code) console.error(`remote exit ${r.code}`);
      }
    );
  }

  console.log("\n######## VERIFY FROM PANEL ########");
  for (const s of rows.filter((r) => r.isActive)) {
    const checks = [
      ["80", `http://${s.host}/edge/health`],
      ["8080", `http://${s.host}:8080/edge/health`],
      ["25461", `http://${s.host}:25461/edge/health`],
      ["443", `https://${s.host}/edge/health`],
    ];
    for (const [port, url] of checks) {
      const out = sh(
        `curl -skS -m 5 -o /tmp/vh -w '${s.name}:${port}=%{http_code}' '${url}'; echo; head -c 100 /tmp/vh 2>/dev/null; echo`
      );
      console.log(out);
    }
  }

  await p.$disconnect();
  console.log("FIX_ALL_SERVERS_PORTS_DONE");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
