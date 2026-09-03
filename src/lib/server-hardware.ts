import os from "os";
import { execSync } from "child_process";
import { readFileSync } from "fs";

export type DetectedHardware = {
  primaryInterface: string;
  ipv4: string[];
  gateway: string;
  cpuThreads: number;
  cpuModel: string;
  totalMemMb: number;
  freeMemMb: number;
  diskUsedPercent: number;
  suggestedMaxConnections: number;
  suggestedIoReadMbps: number;
  suggestedIoWriteMbps: number;
  suggestedBufferMb: number;
};

function defaultRouteInterface(): string {
  try {
    const route = readFileSync("/proc/net/route", "utf8");
    for (const line of route.split("\n").slice(1)) {
      const cols = line.trim().split(/\s+/);
      if (cols[1] === "00000000" && cols[0]) return cols[0];
    }
  } catch {
    /* ignore */
  }
  const nics = os.networkInterfaces();
  for (const [name, addrs] of Object.entries(nics)) {
    if (name === "lo") continue;
    if (addrs?.some((a) => a.family === "IPv4" && !a.internal)) return name;
  }
  return "eth0";
}

function nicIpv4(iface: string): string[] {
  const addrs = os.networkInterfaces()[iface] ?? [];
  return addrs.filter((a) => a.family === "IPv4" && !a.internal).map((a) => a.address);
}

function diskUsedPercent(): number {
  try {
    const out = execSync("df -P / | awk 'NR==2 {print $5}'", { encoding: "utf8", timeout: 4000 });
    return parseInt(out.replace("%", "").trim(), 10) || 0;
  } catch {
    return 0;
  }
}

function gatewayFor(iface: string): string {
  try {
    const route = readFileSync("/proc/net/route", "utf8");
    for (const line of route.split("\n").slice(1)) {
      const cols = line.trim().split(/\s+/);
      if (cols[0] === iface && cols[1] === "00000000" && cols[2]) {
        const hex = cols[2];
        const b = hex.match(/../g)?.reverse().map((h) => parseInt(h, 16)) ?? [];
        if (b.length === 4) return b.join(".");
      }
    }
  } catch {
    /* ignore */
  }
  return "";
}

export type CpuTimeSnapshot = { idle: number; total: number };

export function cpuPercentFromSnapshots(
  previous: CpuTimeSnapshot,
  current: CpuTimeSnapshot
): number | null {
  const totalDelta = current.total - previous.total;
  const idleDelta = current.idle - previous.idle;
  if (!Number.isFinite(totalDelta) || !Number.isFinite(idleDelta) || totalDelta <= 0) return null;
  return Math.max(0, Math.min(100, Math.round((1 - idleDelta / totalDelta) * 100)));
}

function cpuTimeSnapshot(): CpuTimeSnapshot {
  return os.cpus().reduce(
    (sum, cpu) => ({
      idle: sum.idle + cpu.times.idle,
      total:
        sum.total +
        cpu.times.user +
        cpu.times.nice +
        cpu.times.sys +
        cpu.times.idle +
        cpu.times.irq,
    }),
    { idle: 0, total: 0 }
  );
}

let previousCpuTimeSnapshot: CpuTimeSnapshot | null = null;

/** CPU utilisation since the previous sample; load average is only a first-sample fallback. */
export function sampleCpuPercent(): number {
  const current = cpuTimeSnapshot();
  const sampled = previousCpuTimeSnapshot
    ? cpuPercentFromSnapshots(previousCpuTimeSnapshot, current)
    : null;
  previousCpuTimeSnapshot = current;
  if (sampled != null) return sampled;
  const cores = Math.max(1, os.cpus().length);
  const load = os.loadavg()[0] ?? 0;
  return Math.max(0, Math.min(100, Math.round((load / cores) * 100)));
}

export function detectServerHardware(): DetectedHardware {
  const primaryInterface = defaultRouteInterface();
  const cpuThreads = Math.max(1, os.cpus().length);
  const totalMemMb = Math.round(os.totalmem() / 1024 / 1024);
  const freeMemMb = Math.round(os.freemem() / 1024 / 1024);
  const disk = diskUsedPercent();
  return {
    primaryInterface,
    ipv4: nicIpv4(primaryInterface),
    gateway: gatewayFor(primaryInterface),
    cpuThreads,
    cpuModel: os.cpus()[0]?.model?.trim() || "unknown",
    totalMemMb,
    freeMemMb,
    diskUsedPercent: disk,
    suggestedMaxConnections: Math.max(100, cpuThreads * 250),
    suggestedIoReadMbps: Math.max(100, cpuThreads * 50),
    suggestedIoWriteMbps: Math.max(50, cpuThreads * 25),
    suggestedBufferMb: Math.min(512, Math.max(32, Math.round(totalMemMb / 64))),
  };
}
