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
