import type { DetectedHardware } from "@/lib/server-hardware";
import { sshExec, type Ssh2Client } from "@/lib/ssh-exec";

/** Remote NIC detect — prefer default-route iface, then iface holding HINT_IP, then fastest UP NIC. */
export function buildDetectScript(hintIp = ""): string {
  const safeHint = String(hintIp || "")
    .trim()
    .replace(/[^0-9a-fA-F:.]/g, "");
  return [
    "set +e",
    `HINT_IP='${safeHint}'`,
    'is_up() { [ -d "/sys/class/net/$1" ] || return 1; [ "$(cat /sys/class/net/$1/operstate 2>/dev/null)" = "up" ] || [ "$(cat /sys/class/net/$1/carrier 2>/dev/null)" = "1" ]; }',
    'iface_speed() { cat "/sys/class/net/$1/speed" 2>/dev/null || echo 0; }',
    'iface_has_ip() { ip -4 -o addr show dev "$1" 2>/dev/null | awk \'{print $4}\' | cut -d/ -f1 | grep -qx "$2"; }',
    'pick_fastest_up() {',
    '  best=""; best_sp=-1',
    '  for n in /sys/class/net/*; do',
    '    name=$(basename "$n")',
    '    [ "$name" = "lo" ] && continue',
    '    is_up "$name" || continue',
    '    sp=$(iface_speed "$name"); sp=${sp:-0}',
    '    case "$sp" in (*[!0-9]*|"") sp=0 ;; esac',
    '    if [ "$sp" -gt "$best_sp" ]; then best="$name"; best_sp=$sp; fi',
    "  done",
    '  echo "$best"',
    "}",
    'IFACE=$(awk \'$2=="00000000"{print $1;exit}\' /proc/net/route 2>/dev/null)',
    'if [ -n "$HINT_IP" ]; then',
    '  for n in /sys/class/net/*; do',
    '    name=$(basename "$n"); [ "$name" = "lo" ] && continue',
    '    if iface_has_ip "$name" "$HINT_IP"; then IFACE="$name"; break; fi',
    "  done",
    "fi",
    'if [ -z "$IFACE" ] || ! is_up "$IFACE"; then',
    '  IFACE=$(pick_fastest_up)',
    "fi",
    'if [ -z "$IFACE" ]; then',
    '  IFACE=$(ip -4 route show default 2>/dev/null | awk \'{for(i=1;i<=NF;i++) if($i=="dev"){print $(i+1); exit}}\')',
    "fi",
    'GWHEX=$(awk -v i="$IFACE" \'$1==i && $2=="00000000"{print $3;exit}\' /proc/net/route 2>/dev/null)',
    'GW=""',
    'if [ -n "$GWHEX" ] && [ ${#GWHEX} -eq 8 ]; then',
    '  GW=$(printf "%d.%d.%d.%d" "0x${GWHEX:6:2}" "0x${GWHEX:4:2}" "0x${GWHEX:2:2}" "0x${GWHEX:0:2}")',
    "fi",
    'if [ -z "$GW" ]; then',
    '  GW=$(ip -4 route show default dev "$IFACE" 2>/dev/null | awk \'{print $3; exit}\')',
    '  [ -n "$GW" ] || GW=$(ip -4 route show default 2>/dev/null | awk \'{print $3; exit}\')',
    "fi",
    "CPU=$(nproc 2>/dev/null || echo 1)",
    "MEM=$(awk '/MemTotal/{print int($2/1024)}' /proc/meminfo 2>/dev/null)",
    'PRIV=$(ip -4 -o addr show dev "$IFACE" 2>/dev/null | awk \'{print $4}\' | cut -d/ -f1 | head -1)',
    'SPEED=$(iface_speed "$IFACE")',
    'MODEL=$(awk -F: \'/model name/{gsub(/^[ \\t]+/,"",$2); print $2; exit}\' /proc/cpuinfo 2>/dev/null)',
    'echo "NEXLIFY_HW iface=${IFACE} gw=${GW} cpu=${CPU} mem=${MEM} priv=${PRIV} speed=${SPEED}"',
    'echo "NEXLIFY_CPU_MODEL ${MODEL}"',
  ].join("\n");
}

/** @deprecated use buildDetectScript() — kept for callers expecting a constant. */
const DETECT_SCRIPT = buildDetectScript();

export function parseRemoteHardware(stdout: string): DetectedHardware {
  const hw = stdout.match(
    /NEXLIFY_HW iface=(\S*) gw=(\S*) cpu=(\S*) mem=(\S*) priv=(\S*)(?: speed=(\S*))?/
  );
  const model = stdout.match(/NEXLIFY_CPU_MODEL\s*(.*)/)?.[1]?.trim() || "unknown";
  const cpuThreads = Math.max(1, parseInt(hw?.[3] || "1", 10) || 1);
  const totalMemMb = Math.max(0, parseInt(hw?.[4] || "0", 10) || 0);
  const iface = (hw?.[1] || "").trim();
  return {
    primaryInterface: iface || "unknown",
    ipv4: hw?.[5] && hw[5] !== "" ? [hw[5]] : [],
    gateway: hw?.[2] && hw[2] !== "" ? hw[2] : "",
    cpuThreads,
    cpuModel: model || "unknown",
    totalMemMb,
    freeMemMb: 0,
    diskUsedPercent: 0,
    suggestedMaxConnections: Math.max(100, cpuThreads * 250),
    suggestedIoReadMbps: Math.max(100, cpuThreads * 50),
    suggestedIoWriteMbps: Math.max(50, cpuThreads * 25),
    suggestedBufferMb: Math.min(512, Math.max(32, Math.round(totalMemMb / 64) || 32)),
  };
}

export async function detectHardwareOverSsh(
  client: Ssh2Client,
  opts?: { hintIp?: string }
): Promise<DetectedHardware> {
  const result = await sshExec(client, "bash -s", {
    stdin: buildDetectScript(opts?.hintIp),
    timeoutMs: 20_000,
  });
  const hw = parseRemoteHardware(`${result.stdout}\n${result.stderr}`);
  if (!hw.primaryInterface || hw.primaryInterface === "unknown") {
    throw new Error(
      "Could not detect a usable network interface over SSH (no default route / UP NIC)"
    );
  }
  return hw;
}

export { DETECT_SCRIPT };
