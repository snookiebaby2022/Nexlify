import os from "os";
import { readFileSync } from "fs";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { detectServerHardware, sampleCpuPercent } from "@/lib/server-hardware";
import { parseServerPanelSettings } from "@/lib/server-panel-settings";

export type HostMetricsSample = {
  cpu: number;
  memory: number;
  storage: number;
  upload: number;
  download: number;
  uploadMbps: number;
  downloadMbps: number;
  at: number;
};

const HOST_METRICS_STALE_MS = 2 * 60 * 1000;
const NIC_COUNTERS_KEY = "nic_counters";

function clampPct(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, Math.round(n)));
}

function clampMbps(n: number) {
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 10) / 10;
}

/** Convert a 60s bandwidth snapshot (bytes in the window) to Mbps. */
export function snapshotWindowToMbps(bytes: number | bigint | null | undefined): number {
  return clampMbps(Number(bytes ?? 0) / 125_000 / 60);
}

function memUsedPercent(): number {
  try {
    const text = readFileSync("/proc/meminfo", "utf8");
    let total = 0;
    let avail = 0;
    for (const line of text.split("\n")) {
      if (line.startsWith("MemTotal:")) total = parseInt(line.replace(/[^\d]/g, ""), 10);
      else if (line.startsWith("MemAvailable:")) avail = parseInt(line.replace(/[^\d]/g, ""), 10);
    }
    if (total > 0 && avail >= 0) return ((total - avail) / total) * 100;
  } catch {
    /* fall through */
  }
  const total = os.totalmem();
  return ((total - os.freemem()) / Math.max(1, total)) * 100;
}

export function nicBytes(iface: string): { rx: number; tx: number } {
  try {
    const text = readFileSync("/proc/net/dev", "utf8");
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed.startsWith(`${iface}:`) && !trimmed.startsWith(`${iface} :`)) continue;
      const cols = trimmed.replace(":", " ").split(/\s+/).filter(Boolean);
      const rx = Number(cols[1]);
      const tx = Number(cols[9]);
      if (Number.isFinite(rx) && Number.isFinite(tx)) return { rx, tx };
    }
  } catch {
    /* ignore */
  }
  return { rx: 0, tx: 0 };
}

let lastNet = { at: 0, rx: 0, tx: 0, iface: "" };
let lastGoodMbps = { downloadMbps: 0, uploadMbps: 0 };
let sampleMemo: { at: number; sample: HostMetricsSample } | null = null;

/** Live CPU / RAM / disk / NIC utilisation for this panel machine. */
export function sampleLocalHostMetrics(bandwidthMbps = 1000): HostMetricsSample {
  if (sampleMemo && Date.now() - sampleMemo.at < 800) return sampleMemo.sample;
  const hw = detectServerHardware();
  const now = Date.now();
  const { rx, tx } = nicBytes(hw.primaryInterface);
  let download = 0;
  let upload = 0;
  let downloadMbps = lastGoodMbps.downloadMbps;
  let uploadMbps = lastGoodMbps.uploadMbps;
  const cap = Math.max(1, bandwidthMbps);
  if (lastNet.at > 0 && lastNet.iface === hw.primaryInterface && now > lastNet.at) {
    const dt = (now - lastNet.at) / 1000;
    if (dt >= 0.5) {
      downloadMbps = Math.max(0, ((rx - lastNet.rx) * 8) / dt / 1_000_000);
      uploadMbps = Math.max(0, ((tx - lastNet.tx) * 8) / dt / 1_000_000);
      lastGoodMbps = { downloadMbps, uploadMbps };
      lastNet = { at: now, rx, tx, iface: hw.primaryInterface };
    }
    // dt < 0.5: keep previous counters so the next sample can compute a real window.
  } else {
    lastNet = { at: now, rx, tx, iface: hw.primaryInterface };
  }
  download = clampPct((downloadMbps / cap) * 100);
  upload = clampPct((uploadMbps / cap) * 100);
  const sample: HostMetricsSample = {
    cpu: clampPct(sampleCpuPercent()),
    memory: clampPct(memUsedPercent()),
    storage: clampPct(hw.diskUsedPercent),
    upload,
    download,
    uploadMbps: clampMbps(uploadMbps),
    downloadMbps: clampMbps(downloadMbps),
    at: now,
  };
  sampleMemo = { at: now, sample };
  return sample;
}

export function parseHostMetrics(raw: unknown, allowStale = false): HostMetricsSample | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const m = raw as Record<string, unknown>;
  const cpu = Number(m.cpu);
  const memory = Number(m.memory);
  const storage = Number(m.storage);
  const at = Number(m.at);
  if (!Number.isFinite(cpu) && !Number.isFinite(memory)) return null;
  if (Number.isFinite(at) && at > 0 && Date.now() - at > HOST_METRICS_STALE_MS && !allowStale) return null;
  return {
    cpu: clampPct(cpu),
    memory: clampPct(memory),
    storage: clampPct(storage),
    upload: clampPct(Number(m.upload)),
    download: clampPct(Number(m.download)),
    uploadMbps: clampMbps(Number(m.uploadMbps)),
    downloadMbps: clampMbps(Number(m.downloadMbps)),
    at: Number.isFinite(at) && at > 0 ? at : Date.now(),
  };
}

export function readStoredHostMetrics(panelSettings: unknown, allowStale = false): HostMetricsSample | null {
  const { rest } = parseServerPanelSettings(panelSettings);
  return parseHostMetrics(rest.hostMetrics, allowStale);
}

export function hostMetricsFromHeartbeat(body: Record<string, unknown>): HostMetricsSample | null {
  const nested =
    body.hostMetrics && typeof body.hostMetrics === "object" && !Array.isArray(body.hostMetrics)
      ? (body.hostMetrics as Record<string, unknown>)
      : body;
  const cpu = Number(nested.cpu ?? nested.cpuPercent);
  const memory = Number(nested.memory ?? nested.ram ?? nested.ramPercent);
  const storage = Number(nested.storage ?? nested.disk ?? nested.diskPercent);
  if (!Number.isFinite(cpu) && !Number.isFinite(memory) && !Number.isFinite(storage)) return null;
  return {
    cpu: clampPct(cpu),
    memory: clampPct(memory),
    storage: clampPct(storage),
    upload: clampPct(Number(nested.upload ?? nested.networkOut)),
    download: clampPct(Number(nested.download ?? nested.networkIn)),
    uploadMbps: clampMbps(Number(nested.uploadMbps ?? nested.networkOutMbps)),
    downloadMbps: clampMbps(Number(nested.downloadMbps ?? nested.networkInMbps)),
    at: Date.now(),
  };
}

export function mergeHostMetricsSettings(existing: unknown, sample: HostMetricsSample): Record<string, unknown> {
  const { network, performance, advanced, ssl, rest } = parseServerPanelSettings(existing);
  return {
    ...rest,
    hostMetrics: sample,
    network,
    performance,
    advanced,
    ssl,
  };
}

export async function persistHostMetrics(serverId: string, sample: HostMetricsSample): Promise<void> {
  const payload = JSON.stringify({
    cpu: sample.cpu,
    memory: sample.memory,
    storage: sample.storage,
    upload: sample.upload,
    download: sample.download,
    uploadMbps: sample.uploadMbps,
    downloadMbps: sample.downloadMbps,
    at: sample.at,
  });
  await prisma.$executeRaw(
    Prisma.sql`UPDATE "StreamServer"
     SET "panelSettings" = jsonb_set(
       COALESCE("panelSettings", '{}'::jsonb),
       '{hostMetrics}',
       ${payload}::jsonb,
       true
     )
     WHERE id = ${serverId}`
  );
}

/** Bytes transferred on the primary NIC, scaled to a 60-second window for bandwidthSnapshot. */
export async function snapshotNicTrafficForCron(): Promise<{ bytesIn: bigint; bytesOut: bigint } | null> {
  const hw = detectServerHardware();
  const now = Date.now();
  const { rx, tx } = nicBytes(hw.primaryInterface);
  const cur = { rx, tx, iface: hw.primaryInterface, at: now };
  const prevRow = await prisma.panelSetting.findUnique({ where: { key: NIC_COUNTERS_KEY } });
  await prisma.panelSetting.upsert({
    where: { key: NIC_COUNTERS_KEY },
    update: { value: JSON.stringify(cur) },
    create: { key: NIC_COUNTERS_KEY, value: JSON.stringify(cur) },
  });
  if (!prevRow?.value) return null;
  let prev: { rx?: number; tx?: number; iface?: string; at?: number };
  try {
    prev = JSON.parse(prevRow.value) as { rx?: number; tx?: number; iface?: string; at?: number };
  } catch {
    return null;
  }
  const dt = (now - Number(prev.at ?? 0)) / 1000;
  if (dt < 1 || prev.iface !== cur.iface) return null;
  const rxDelta = Math.max(0, rx - Number(prev.rx ?? 0));
  const txDelta = Math.max(0, tx - Number(prev.tx ?? 0));
  const scale = 60 / dt;
  return {
    bytesIn: BigInt(Math.floor(rxDelta * scale)),
    bytesOut: BigInt(Math.floor(txDelta * scale)),
  };
}

/** Dashboard KPI / top nav: real NIC ingress (provider rx) vs egress (viewer tx), not estimated viewer load. */
export async function getDashboardNicBandwidthMbps(): Promise<{
  networkInMbps: number;
  networkOutMbps: number;
}> {
  let cap = 1000;
  try {
    const row = await prisma.streamServer.findFirst({
      orderBy: { sortOrder: "asc" },
      select: { bandwidthMbps: true },
    });
    if (row?.bandwidthMbps && row.bandwidthMbps > 0) cap = row.bandwidthMbps;
  } catch {
    /* cap optional */
  }

  const sample = sampleLocalHostMetrics(cap);
  if (sample.downloadMbps > 0 || sample.uploadMbps > 0) {
    return { networkInMbps: sample.downloadMbps, networkOutMbps: sample.uploadMbps };
  }

  try {
    const snap = await prisma.bandwidthSnapshot.findFirst({
      orderBy: { createdAt: "desc" },
      select: { bytesIn: true, bytesOut: true },
    });
    if (snap) {
      return {
        networkInMbps: snapshotWindowToMbps(snap.bytesIn),
        networkOutMbps: snapshotWindowToMbps(snap.bytesOut),
      };
    }
  } catch {
    /* snapshot optional */
  }

  return { networkInMbps: 0, networkOutMbps: 0 };
}
