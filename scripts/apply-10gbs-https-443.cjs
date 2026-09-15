#!/usr/bin/env node
/**
 * 10gbs: splice owns :443 (Let's Encrypt), stop p2ptv-node, persist 10G sysctl + rings.
 * Restarts nexlify-iptv-edge once (brief reconnect). Run on panel host (45).
 *
 *   EDGE_SRC=/tmp/iptv-edge-proxy.mjs node scripts/apply-10gbs-https-443.cjs
 */
const fs = require("fs");
const path = require("path");
const ROOT = fs.existsSync("/opt/nexlify-panel/scripts/ssh-10gbs-lib.cjs")
  ? "/opt/nexlify-panel"
  : path.join(__dirname, "..");
process.chdir(ROOT);
require(path.join(ROOT, "scripts/load-env.cjs")).loadEnv();

const { get10gbsServer, withSshClient, sshExec } = require(path.join(ROOT, "scripts/ssh-10gbs-lib.cjs"));

const EDGE_SRC = process.env.EDGE_SRC || path.join(ROOT, "scripts/iptv-edge-proxy.mjs");

function setEnvLine(key, value) {
  return [
    `ENV=/opt/nexlify-panel/.env`,
    `touch "$ENV"`,
    `if grep -q '^${key}=' "$ENV"; then`,
    `  sed -i 's|^${key}=.*|${key}=${value}|' "$ENV"`,
    `else`,
    `  printf '\\n${key}=${value}\\n' >> "$ENV"`,
    `fi`,
    `grep '^${key}=' "$ENV"`,
  ].join("\n");
}

async function main() {
  if (!fs.existsSync(EDGE_SRC)) throw new Error(`missing edge source: ${EDGE_SRC}`);
  const body = fs.readFileSync(EDGE_SRC, "utf8");
  if (!body.includes("/.well-known/acme-challenge/")) {
    throw new Error("edge source missing ACME challenge handler");
  }
  if (!body.includes("IPTV_EDGE_COALESCE_SAME_URL")) {
    throw new Error("edge source missing coalesce");
  }

  const { PrismaClient } = require(path.join(ROOT, "node_modules/@prisma/client"));
  const p = new PrismaClient();
  const s = await get10gbsServer(p);

  await withSshClient(
    { host: s.host, port: s.port, username: s.user, password: s.password },
    async (c) => {
      const before = await sshExec(
        c,
        [
          "echo '=== BEFORE ports ==='",
          "ss -lntp | grep -E ':80|:443|:8080|:25461' || true",
          "echo '=== BEFORE health ==='",
          "curl -sS -m 3 http://127.0.0.1:8080/edge/health || true",
          "echo",
        ].join("\n")
      );
      process.stdout.write(before.stdout || "");

      console.log("=== persist sysctl + NIC rings ===");
      const tune = await sshExec(
        c,
        `
set -e
cat > /etc/sysctl.d/99-zzz-nexlify-edge.conf <<'EOF'
# Nexlify splice edge — wins over 99-nexlify-iptv 16MiB template
net.core.somaxconn = 65535
net.ipv4.tcp_max_syn_backlog = 262144
net.core.netdev_max_backlog = 250000
net.ipv4.tcp_tw_reuse = 1
net.ipv4.tcp_fin_timeout = 15
net.ipv4.tcp_slow_start_after_idle = 0
net.ipv4.tcp_mtu_probing = 1
net.core.rmem_max = 268435456
net.core.wmem_max = 268435456
net.core.rmem_default = 1048576
net.core.wmem_default = 1048576
net.ipv4.tcp_rmem = 8192 262144 134217728
net.ipv4.tcp_wmem = 8192 262144 134217728
net.ipv4.ip_local_port_range = 1024 65535
net.ipv4.tcp_keepalive_time = 120
net.ipv4.tcp_keepalive_intvl = 15
net.ipv4.tcp_keepalive_probes = 5
fs.file-max = 2097152
net.core.default_qdisc = fq
net.ipv4.tcp_congestion_control = bbr
EOF
sysctl -p /etc/sysctl.d/99-zzz-nexlify-edge.conf >/dev/null
sysctl net.core.rmem_max net.core.wmem_max net.core.somaxconn net.ipv4.tcp_congestion_control

IFACE=enp45s0
ethtool -G "$IFACE" rx 4096 tx 4096 || true
ethtool -K "$IFACE" gro on gso on tso on lro off || true
ethtool -g "$IFACE" | head -16

cat > /etc/systemd/system/nexlify-nic-tune.service <<'EOF'
[Unit]
Description=Nexlify edge 10G ring tune
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/sbin/ethtool -G enp45s0 rx 4096 tx 4096
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now nexlify-nic-tune.service >/dev/null
echo NIC_TUNE_OK
`,
        { timeoutMs: 30_000 }
      );
      process.stdout.write(tune.stdout || "");
      if (tune.code !== 0) throw new Error(tune.stderr || "sysctl/nic tune failed");

      console.log("=== stop p2ptv from :443 (splice will bind TLS) ===");
      const stopP2p = await sshExec(
        c,
        `
set -e
systemctl stop p2ptv-node.service || true
systemctl disable p2ptv-node.service || true
systemctl stop p2ptv-seeder.service || true
systemctl disable p2ptv-seeder.service || true
systemctl stop p2ptv-cert-renew.timer || true
systemctl disable p2ptv-cert-renew.timer || true
# leftover binary if unit did not own the pid
pkill -x p2ptv-balance-node 2>/dev/null || true
pkill -x p2ptv-seeder 2>/dev/null || true
for i in 1 2 3 4 5 6 7 8; do
  if ! ss -lntp | grep -qE ':443\\s'; then
    echo '443_FREE'
    break
  fi
  echo "waiting for :443 to free ($i)"
  sleep 1
done
ss -lntp | grep -E ':443|:8091' || echo 'no 443/8091 listeners'
test -f /etc/letsencrypt/live/darkcdn.site/fullchain.pem
test -f /etc/letsencrypt/live/darkcdn.site/privkey.pem
openssl x509 -in /etc/letsencrypt/live/darkcdn.site/fullchain.pem -noout -subject -dates
mkdir -p /var/www/letsencrypt/.well-known/acme-challenge
# webroot renewals so certbot never steals :80 from the splice
if [ -f /etc/letsencrypt/renewal/darkcdn.site.conf ]; then
  sed -i 's/^authenticator = .*/authenticator = webroot/' /etc/letsencrypt/renewal/darkcdn.site.conf
  grep -q '^webroot_path' /etc/letsencrypt/renewal/darkcdn.site.conf \\
    && sed -i 's|^webroot_path = .*|webroot_path = /var/www/letsencrypt|' /etc/letsencrypt/renewal/darkcdn.site.conf \\
    || printf '\\nwebroot_path = /var/www/letsencrypt\\n' >> /etc/letsencrypt/renewal/darkcdn.site.conf
  grep -q '^pref_challs' /etc/letsencrypt/renewal/darkcdn.site.conf || true
  sed -i '/^http01_port/d' /etc/letsencrypt/renewal/darkcdn.site.conf
fi
echo P2P_STOPPED
`,
        { timeoutMs: 30_000 }
      );
      process.stdout.write(stopP2p.stdout || "");
      if (stopP2p.stderr) process.stderr.write(String(stopP2p.stderr).slice(0, 2000));
      if (stopP2p.code !== 0) throw new Error(stopP2p.stderr || "failed to free :443");

      const envOut = await sshExec(
        c,
        [
          setEnvLine("IPTV_EDGE_HTTPS_PORTS", "443"),
          setEnvLine("IPTV_EDGE_CERT", "/etc/letsencrypt/live/darkcdn.site/fullchain.pem"),
          setEnvLine("IPTV_EDGE_KEY", "/etc/letsencrypt/live/darkcdn.site/privkey.pem"),
          setEnvLine("IPTV_EDGE_ACME_ROOT", "/var/www/letsencrypt"),
          setEnvLine("IPTV_EDGE_COALESCE_SAME_URL", "1"),
        ].join("\n")
      );
      process.stdout.write(envOut.stdout || "");
      if (envOut.code !== 0) throw new Error(envOut.stderr || "failed to set HTTPS env");

      await sshExec(c, "chattr -i /opt/nexlify-panel/scripts/iptv-edge-proxy.mjs 2>/dev/null || true");
      const up = await sshExec(c, "cat > /opt/nexlify-panel/scripts/iptv-edge-proxy.mjs", {
        stdin: body,
        timeoutMs: 120_000,
      });
      if (up.code !== 0) throw new Error(up.stderr || "edge upload failed");

      console.log("=== restart edge (no --update-env) ===");
      const restart = await sshExec(
        c,
        [
          "cd /opt/nexlify-panel",
          "pm2 restart nexlify-iptv-edge",
          "sleep 8",
          "chattr +i scripts/iptv-edge-proxy.mjs 2>/dev/null || true",
          "echo '=== AFTER ports ==='",
          "ss -lntp | grep -E ':80|:443|:8080|:25461' || true",
          "echo '=== AFTER http health ==='",
          "curl -sS -m 5 http://127.0.0.1:8080/edge/health || true",
          "echo",
          "echo '=== AFTER https health (SNI darkcdn.site) ==='",
          "curl -sS -m 8 --resolve darkcdn.site:443:127.0.0.1 https://darkcdn.site/edge/health || true",
          "echo",
          "echo '=== pm2 logs ==='",
          "pm2 logs nexlify-iptv-edge --lines 25 --nostream || true",
        ].join("\n"),
        { timeoutMs: 90_000 }
      );
      process.stdout.write(restart.stdout || "");
      if (restart.stderr) process.stderr.write(String(restart.stderr).slice(0, 3000));
      if (restart.code !== 0) throw new Error("edge restart failed");
    }
  );

  await p.$disconnect();
  console.log("HTTPS_443_OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
