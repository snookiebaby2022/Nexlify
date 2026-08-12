/**
 * Sample host NIC throughput from /proc/net/dev (Linux).
 * Two samples ~1s apart → bytes/sec in/out (excludes lo).
 */
import { readFile } from "fs/promises";

export type HostNetworkSample = {
  bytesInPerSec: number;
  bytesOutPerSec: number;
  iface: string;
};

type Counters = { rx: number; tx: number; iface: string };

async function readPrimaryIfaceCounters(): Promise<Counters | null> {
  try {
    const raw = await readFile("/proc/net/dev", "utf8");
    let best: Counters | null = null;
    for (const line of raw.split("\n").slice(2)) {
      const m = line.trim().match(/^([^:]+):\s*(.+)$/);
      if (!m) continue;
      const iface = m[1].trim();
      if (iface === "lo" || iface.startsWith("docker") || iface.startsWith("veth") || iface.startsWith("br-")) {
        continue;
      }
      const parts = m[2].trim().split(/\s+/).map(Number);
      if (parts.length < 10 || Number.isNaN(parts[0]) || Number.isNaN(parts[8])) continue;
      const rx = parts[0];
      const tx = parts[8];
      if (!best || rx + tx > best.rx + best.tx) {
        best = { rx, tx, iface };
      }
    }
    return best;
  } catch {
    return null;
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Sample NIC for ~1s and return bytes/sec. Returns null off Linux / if unreadable. */
export async function sampleHostNetwork(intervalMs = 1000): Promise<HostNetworkSample | null> {
  const a = await readPrimaryIfaceCounters();
  if (!a) return null;
  await sleep(intervalMs);
  const b = await readPrimaryIfaceCounters();
  if (!b || b.iface !== a.iface) return null;
  const secs = intervalMs / 1000;
  return {
    bytesInPerSec: Math.max(0, Math.floor((b.rx - a.rx) / secs)),
    bytesOutPerSec: Math.max(0, Math.floor((b.tx - a.tx) / secs)),
    iface: b.iface,
  };
}
