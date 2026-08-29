import type { HostMetricsSample } from "@/lib/host-metrics";
import { sshExec, withSshClient, type Ssh2Client } from "@/lib/ssh-exec";

/** Same utilisation probe as nexlify-stream-agent.sh (CPU/RAM/disk/NIC %). */
const METRICS_SCRIPT = [
  "set +e",
  'cores=$(nproc 2>/dev/null || echo 1)',
  '[ "$cores" -lt 1 ] && cores=1',
  'load=$(awk \'{print $1}\' /proc/loadavg 2>/dev/null || echo 0)',
  'cpu=$(awk -v l="$load" -v c="$cores" \'BEGIN { p=int((l/c)*100+0.5); if (p<0) p=0; if (p>100) p=100; print p }\')',
  'mem=$(awk \'/MemTotal/{t=$2} /AnonPages/{ap=$2} /MemAvailable/{av=$2} END { if (t>0 && ap>0) { p=int((ap/t)*100+0.5) } else if (t>0 && av>0) { p=int(((t-av)/t)*100+0.5) } else { p=0 }; if (p<0) p=0; if (p>100) p=100; print p }\' /proc/meminfo 2>/dev/null || echo 0)',
  'disk=$(df -P / 2>/dev/null | awk \'NR==2 { gsub(/%/,""); print $5+0 }\' || echo 0)',
  'iface=$(awk \'$2=="00000000" {print $1; exit}\' /proc/net/route 2>/dev/null || echo eth0)',
  'rx=$(awk -v i="$iface" \'$1==i":" {print $2; exit}\' /proc/net/dev 2>/dev/null || echo 0)',
  'tx=$(awk -v i="$iface" \'$1==i":" {print $10; exit}\' /proc/net/dev 2>/dev/null || echo 0)',
  'now=$(date +%s)',
  'download=0',
  'upload=0',
  'download_mbps=0',
  'upload_mbps=0',
  'state=/etc/nexlify-agent/net.last',
  'if [ -f "$state" ]; then',
  '  read -r prev_at prev_rx prev_tx prev_iface < "$state" || true',
  '  if [ "${prev_iface:-}" = "$iface" ] && [ "${prev_at:-0}" -gt 0 ]; then',
  '    dt=$((now - prev_at))',
  '    if [ "$dt" -ge 1 ]; then',
  '      download_mbps=$(( (rx - prev_rx) * 8 / dt / 1000000 ))',
  '      upload_mbps=$(( (tx - prev_tx) * 8 / dt / 1000000 ))',
  '      [ "$download_mbps" -lt 0 ] && download_mbps=0',
  '      [ "$upload_mbps" -lt 0 ] && upload_mbps=0',
  '    fi',
  '  fi',
  "fi",
  'mkdir -p /etc/nexlify-agent 2>/dev/null || true',
  'printf \'%s %s %s %s\\n\' "$now" "$rx" "$tx" "$iface" > "$state" 2>/dev/null || true',
  'echo "NEXLIFY_METRICS cpu=${cpu:-0} mem=${mem:-0} disk=${disk:-0} up=${upload_mbps:-0} down=${download_mbps:-0}"',
].join("\n");

function clampPct(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, Math.round(n)));
}

function clampMbps(n: number) {
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 10) / 10;
}

export function parseRemoteMetricsStdout(stdout: string, bandwidthMbps = 1000): HostMetricsSample | null {
  const m = stdout.match(/NEXLIFY_METRICS cpu=(\S+) mem=(\S+) disk=(\S+) up=(\S+) down=(\S+)/);
  if (!m) return null;
  const cpu = Number(m[1]);
  const memory = Number(m[2]);
  const storage = Number(m[3]);
  const uploadMbps = Number(m[4]);
  const downloadMbps = Number(m[5]);
  if (!Number.isFinite(cpu) && !Number.isFinite(memory)) return null;
  const cap = Math.max(1, bandwidthMbps);
  return {
    cpu: clampPct(cpu),
    memory: clampPct(memory),
    storage: clampPct(storage),
    upload: clampPct((uploadMbps / cap) * 100),
    download: clampPct((downloadMbps / cap) * 100),
    uploadMbps: clampMbps(uploadMbps),
    downloadMbps: clampMbps(downloadMbps),
    at: Date.now(),
  };
}

export async function sampleHostMetricsOverSsh(
  client: Ssh2Client,
  bandwidthMbps = 1000
): Promise<HostMetricsSample | null> {
  const result = await sshExec(client, "bash -s", {
    stdin: METRICS_SCRIPT,
    timeoutMs: 12_000,
  });
  return parseRemoteMetricsStdout(`${result.stdout}\n${result.stderr}`, bandwidthMbps);
}

export async function sampleHostMetricsOverSshConnect(opts: {
  host: string;
  port: number;
  username: string;
  password: string;
  bandwidthMbps?: number;
}): Promise<HostMetricsSample | null> {
  return withSshClient(
    {
      host: opts.host,
      port: opts.port,
      username: opts.username,
      password: opts.password,
    },
    (client) => sampleHostMetricsOverSsh(client, opts.bandwidthMbps ?? 1000)
  );
}
