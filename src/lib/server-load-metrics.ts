/** Viewer load — never catalog size. */
export function viewerSlotsUsed(liveConnections: number, runningProcesses: number): number {
  return Math.max(liveConnections, runningProcesses);
}

export function loadScorePercent(slotsUsed: number, maxClients: number): number {
  const slots = maxClients > 0 ? maxClients : 1000;
  return Math.round((slotsUsed / slots) * 100);
}

/** Current usage Mbps from ffmpeg bitrates, else ~2.5 Mbps per live connection. */
export function estimatedLiveBandwidthMbps(
  liveConnections: number,
  processBitrateKbpsSum: number
): number {
  if (liveConnections <= 0) return 0;
  if (processBitrateKbpsSum > 0) {
    return Math.round((processBitrateKbpsSum / 1000) * 10) / 10;
  }
  return Math.round(liveConnections * 2.5 * 10) / 10;
}

/** Dashboard Bandwidth KPI: playback only, never the whole NIC. */
export function dashboardPlaybackBandwidthMbps(
  liveConnections: number,
  processBitrateKbpsSum = 0
): { networkInMbps: number; networkOutMbps: number } {
  const out = estimatedLiveBandwidthMbps(liveConnections, processBitrateKbpsSum);
  return { networkInMbps: out, networkOutMbps: out };
}

export const SATURATED_SLOT_RATIO = 0.7;
export const SATURATED_HEADROOM_RATIO = 0.3;
export const ADMISSION_SLOT_RATIO = 0.7;
export const ADMISSION_HEADROOM_RATIO = 0.3;

export type BufferingRisk = "healthy" | "watch" | "critical";

/**
 * Classify delivery risk from the two capacity signals that actually cause
 * origin-side buffering: viewer slots and egress headroom. Unknown/zero
 * capacity is treated conservatively, without inventing a failure.
 */
export function bufferingRisk(opts: {
  online: boolean;
  saturated: boolean;
  headroomPct: number;
  loadPct: number;
  failedStreams?: number;
}): BufferingRisk {
  if (!opts.online || opts.failedStreams && opts.failedStreams > 0) return "critical";
  if (opts.saturated || opts.headroomPct < 30 || opts.loadPct >= 70) return "critical";
  if (opts.headroomPct < 40 || opts.loadPct >= 60) return "watch";
  return "healthy";
}

export function bufferingRiskLabel(risk: BufferingRisk): string {
  return risk === "critical" ? "High buffering risk" : risk === "watch" ? "Watch closely" : "Healthy";
}

export type ServerEgressHeadroom = {
  capMbps: number;
  usedMbps: number;
  headroomMbps: number;
  headroomPct: number;
  saturated: boolean;
};

/** NIC truth: leftover Mbps and whether this box should take new live assignments. */
export function serverEgressHeadroom(opts: {
  usedMbps: number;
  nicCapMbps: number;
  slotRatio: number;
}): ServerEgressHeadroom {
  const capMbps = opts.nicCapMbps > 0 ? opts.nicCapMbps : 0;
  const usedMbps = Math.max(0, opts.usedMbps);
  if (capMbps <= 0) {
    return { capMbps: 0, usedMbps, headroomMbps: 0, headroomPct: 0, saturated: true };
  }
  const headroomMbps = Math.max(0, Math.round((capMbps - usedMbps) * 10) / 10);
  const headroomPct = Math.round((headroomMbps / capMbps) * 100);
  const saturated =
    opts.slotRatio >= SATURATED_SLOT_RATIO || headroomMbps / capMbps < SATURATED_HEADROOM_RATIO;
  return { capMbps, usedMbps, headroomMbps, headroomPct, saturated };
}

/** Prefer boxes with leftover egress; if every box is full, still pick among online. */
export function preferHeadroomPool<T extends { online: boolean; saturated: boolean }>(rows: T[]): T[] {
  const online = rows.filter((r) => r.online);
  const room = online.filter((r) => !r.saturated);
  return room.length ? room : online;
}
