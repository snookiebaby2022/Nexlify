#!/usr/bin/env node
/**
 * 10gbs: raise TCP autotune max to 256 MiB (match rmem_max) and RSS RX queues to CPU count.
 * Does not set 32 MiB rmem_default (would OOM under thousands of sockets).
 * Does not change MTU. No HAProxy.
 *
 *   node scripts/apply-10gbs-sysctl-rss.cjs
 */
const path = require("path");
const ROOT = require("fs").existsSync("/opt/nexlify-panel/scripts/ssh-10gbs-lib.cjs")
  ? "/opt/nexlify-panel"
  : path.join(__dirname, "..");
process.chdir(ROOT);
require(path.join(ROOT, "scripts/load-env.cjs")).loadEnv();
const { get10gbsServer, withSshClient, sshExec } = require(path.join(ROOT, "scripts/ssh-10gbs-lib.cjs"));

const CONF = `/etc/sysctl.d/99-zzz-nexlify-edge.conf`;

(async () => {
  const { PrismaClient } = require("@prisma/client");
  const p = new PrismaClient();
  const s = await get10gbsServer(p);
  await withSshClient(
    { host: s.host, port: s.port, username: s.user, password: s.password },
    async (c) => {
      const r = await sshExec(
        c,
        [
          "set -euo pipefail",
          "IF=enp45s0",
          `cat > ${CONF} <<'EOF'`,
          "# Nexlify 10gbs splice — persist across reboot. Do not copy 32MiB rmem_default.",
          "net.core.rmem_max = 268435456",
          "net.core.wmem_max = 268435456",
          "net.core.rmem_default = 1048576",
          "net.core.wmem_default = 1048576",
          "net.ipv4.tcp_rmem = 4096 1048576 268435456",
          "net.ipv4.tcp_wmem = 4096 1048576 268435456",
          "net.ipv4.tcp_mem = 786432 1572864 3145728",
          "net.core.default_qdisc = fq",
          "net.ipv4.tcp_congestion_control = bbr",
          "net.ipv4.tcp_window_scaling = 1",
          "net.core.netdev_max_backlog = 250000",
          "net.core.somaxconn = 65535",
          "net.ipv4.tcp_max_syn_backlog = 262144",
          "net.ipv4.tcp_fin_timeout = 15",
          "net.ipv4.tcp_tw_reuse = 1",
          "net.ipv4.tcp_slow_start_after_idle = 0",
          "net.ipv4.tcp_mtu_probing = 1",
          "net.ipv4.ip_local_port_range = 1024 65535",
          "fs.file-max = 2097152",
          "EOF",
          `sysctl -p ${CONF}`,
          "echo ---rss---",
          "ethtool -L $IF rx 24 tx 24 || ethtool -L $IF combined 24 || true",
          "ethtool -l $IF | head -16",
          "echo ---persist nic---",
          "cat > /etc/systemd/system/nexlify-nic-tune.service <<'UNIT'",
          "[Unit]",
          "Description=Nexlify 10G ring and RSS",
          "After=network-online.target",
          "Wants=network-online.target",
          "",
          "[Service]",
          "Type=oneshot",
          "ExecStart=/usr/sbin/ethtool -G enp45s0 rx 4096 tx 4096",
          "ExecStart=/usr/sbin/ethtool -L enp45s0 rx 24 tx 24",
          "ExecStart=/usr/sbin/ethtool -K enp45s0 gro on gso on tso on lro off",
          "RemainAfterExit=yes",
          "",
          "[Install]",
          "WantedBy=multi-user.target",
          "UNIT",
          "systemctl daemon-reload",
          "systemctl enable --now nexlify-nic-tune.service || true",
          "echo ---verify---",
          "sysctl net.ipv4.tcp_rmem net.ipv4.tcp_wmem net.core.rmem_default net.ipv4.tcp_congestion_control net.core.somaxconn",
          "ip -o link show $IF | awk '{print}'",
          "ethtool $IF | grep -E 'Speed|Duplex'",
        ].join("\n"),
        { timeoutMs: 30000 }
      );
      process.stdout.write(r.stdout || "");
      if (r.stderr) process.stderr.write(r.stderr);
      if (r.code) throw new Error(`remote exit ${r.code}`);
    }
  );
  await p.$disconnect();
  console.log("SYSCTL_RSS_OK");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
