import type { DetectedHardware } from "@/lib/server-hardware";
import { sshExec, type Ssh2Client } from "@/lib/ssh-exec";

const DETECT_SCRIPT = [
  "set +e",
  'IFACE=$(awk \'$2=="00000000"{print $1;exit}\' /proc/net/route 2>/dev/null)',
  'GWHEX=$(awk -v i="$IFACE" \'$1==i && $2=="00000000"{print $3;exit}\' /proc/net/route 2>/dev/null)',
  'GW=""',
  'if [ -n "$GWHEX" ] && [ ${#GWHEX} -eq 8 ]; then',
  '  GW=$(printf "%d.%d.%d.%d" "0x${GWHEX:6:2}" "0x${GWHEX:4:2}" "0x${GWHEX:2:2}" "0x${GWHEX:0:2}")',
  "fi",
  "CPU=$(nproc 2>/dev/null || echo 1)",
  "MEM=$(awk '/MemTotal/{print int($2/1024)}' /proc/meminfo 2>/dev/null)",
  'PRIV=$(ip -4 -o addr show dev "$IFACE" 2>/dev/null | awk \'{print $4}\' | cut -d/ -f1 | head -1)',
  'MODEL=$(awk -F: \'/model name/{gsub(/^[ \\t]+/,"",$2); print $2; exit}\' /proc/cpuinfo 2>/dev/null)',
  'echo "NEXLIFY_HW iface=${IFACE} gw=${GW} cpu=${CPU} mem=${MEM} priv=${PRIV}"',
  'echo "NEXLIFY_CPU_MODEL ${MODEL}"',
].join("\n");

export function parseRemoteHardware(stdout: string): DetectedHardware {
  const hw = stdout.match(/NEXLIFY_HW iface=(\S*) gw=(\S*) cpu=(\S*) mem=(\S*) priv=(\S*)/);
  const model = stdout.match(/NEXLIFY_CPU_MODEL\s*(.*)/)?.[1]?.trim() || "unknown";
  const cpuThreads = Math.max(1, parseInt(hw?.[3] || "1", 10) || 1);
  const totalMemMb = Math.max(0, parseInt(hw?.[4] || "0", 10) || 0);
  const iface = hw?.[1]?.trim() || "eth0";
  return {
    primaryInterface: iface === "" ? "eth0" : iface,
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

export async function detectHardwareOverSsh(client: Ssh2Client): Promise<DetectedHardware> {
  const result = await sshExec(client, "bash -s", {
    stdin: DETECT_SCRIPT,
    timeoutMs: 20_000,
  });
  return parseRemoteHardware(`${result.stdout}\n${result.stderr}`);
}
