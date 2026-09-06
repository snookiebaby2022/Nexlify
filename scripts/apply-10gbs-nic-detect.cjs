#!/usr/bin/env node
/** Run improved NIC detect against 10gbs and persist settings (no Next rebuild needed). */
require("./load-env.cjs").loadEnv();
const { PrismaClient } = require("@prisma/client");
const { get10gbsServer, withSshClient, sshExec } = require("./ssh-10gbs-lib.cjs");

function buildDetectScript(hintIp = "") {
  const safeHint = String(hintIp || "").trim().replace(/[^0-9a-fA-F:.]/g, "");
  return [
    "set +e",
    `HINT_IP='${safeHint}'`,
    'is_up() { [ -d "/sys/class/net/$1" ] || return 1; [ "$(cat /sys/class/net/$1/operstate 2>/dev/null)" = "up" ] || [ "$(cat /sys/class/net/$1/carrier 2>/dev/null)" = "1" ]; }',
    'iface_speed() { cat "/sys/class/net/$1/speed" 2>/dev/null || echo 0; }',
    'iface_has_ip() { ip -4 -o addr show dev "$1" 2>/dev/null | awk \'{print $4}\' | cut -d/ -f1 | grep -qx "$2"; }',
    'pick_fastest_up() { best=""; best_sp=-1; for n in /sys/class/net/*; do name=$(basename "$n"); [ "$name" = "lo" ] && continue; is_up "$name" || continue; sp=$(iface_speed "$name"); sp=${sp:-0}; case "$sp" in (*[!0-9]*|"") sp=0 ;; esac; if [ "$sp" -gt "$best_sp" ]; then best="$name"; best_sp=$sp; fi; done; echo "$best"; }',
    'IFACE=$(awk \'$2=="00000000"{print $1;exit}\' /proc/net/route 2>/dev/null)',
    'if [ -n "$HINT_IP" ]; then for n in /sys/class/net/*; do name=$(basename "$n"); [ "$name" = "lo" ] && continue; if iface_has_ip "$name" "$HINT_IP"; then IFACE="$name"; break; fi; done; fi',
    'if [ -z "$IFACE" ] || ! is_up "$IFACE"; then IFACE=$(pick_fastest_up); fi',
    'if [ -z "$IFACE" ]; then IFACE=$(ip -4 route show default 2>/dev/null | awk \'{for(i=1;i<=NF;i++) if($i=="dev"){print $(i+1); exit}}\'); fi',
    'GWHEX=$(awk -v i="$IFACE" \'$1==i && $2=="00000000"{print $3;exit}\' /proc/net/route 2>/dev/null)',
    'GW=""; if [ -n "$GWHEX" ] && [ ${#GWHEX} -eq 8 ]; then GW=$(printf "%d.%d.%d.%d" "0x${GWHEX:6:2}" "0x${GWHEX:4:2}" "0x${GWHEX:2:2}" "0x${GWHEX:0:2}"); fi',
    'if [ -z "$GW" ]; then GW=$(ip -4 route show default dev "$IFACE" 2>/dev/null | awk \'{print $3; exit}\'); [ -n "$GW" ] || GW=$(ip -4 route show default 2>/dev/null | awk \'{print $3; exit}\'); fi',
    'PRIV=$(ip -4 -o addr show dev "$IFACE" 2>/dev/null | awk \'{print $4}\' | cut -d/ -f1 | head -1)',
    'SPEED=$(iface_speed "$IFACE")',
    'echo "NEXLIFY_HW iface=${IFACE} gw=${GW} priv=${PRIV} speed=${SPEED}"',
  ].join("\n");
}

(async () => {
  const prisma = new PrismaClient();
  const s = await get10gbsServer(prisma);
  const hint = s.host;
  let detected = null;
  await withSshClient({ host: s.host, port: s.port, username: s.user, password: s.password }, async (c) => {
    const r = await sshExec(c, "bash -s", { stdin: buildDetectScript(hint), timeoutMs: 20000 });
    const m = `${r.stdout}\n${r.stderr}`.match(/NEXLIFY_HW iface=(\S*) gw=(\S*) priv=(\S*) speed=(\S*)/);
    if (!m || !m[1]) throw new Error("detect failed: " + r.stdout + r.stderr);
    detected = { iface: m[1], gw: m[2], priv: m[3], speed: m[4] };
  });
  console.log("detected", detected);
  if (!detected || detected.iface === "eth0" || detected.speed === "0") {
    throw new Error(`Refusing to save bad detect: ${JSON.stringify(detected)}`);
  }
  const row = await prisma.streamServer.findUnique({ where: { id: s.server.id } });
  const settings = row.panelSettings && typeof row.panelSettings === "object" ? { ...row.panelSettings } : {};
  const network = { ...(settings.network || {}) };
  network.interfaceName = detected.iface;
  network.gateway = detected.gw;
  network.mtu = Number(network.mtu) > 0 ? Number(network.mtu) : 1500;
  if (!network.dnsServers) network.dnsServers = "8.8.8.8\n8.8.4.4";
  settings.network = network;
  // Only store privateIp if it's not the public host (RFC1918)
  const priv = detected.priv;
  const isRfc1918 = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(priv);
  await prisma.streamServer.update({
    where: { id: s.server.id },
    data: {
      panelSettings: settings,
      privateIp: isRfc1918 ? priv : null,
      healthStatus: "online",
      healthMessage: `SSH auto-detect (${detected.iface} ${detected.speed}Mbps)`,
      lastHealthAt: new Date(),
    },
  });
  console.log("patched_ok", { iface: detected.iface, gw: detected.gw, speed: detected.speed, privateIp: isRfc1918 ? priv : null });
  await prisma.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
