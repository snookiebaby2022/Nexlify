/** Live connection QoE (stall metering + Redis windows). Off by default on streaming installs. */
export function isConnectionQoeEnabled(): boolean {
  const raw = String(process.env.NEXLIFY_CONNECTION_QOE ?? "").trim().toLowerCase();
  if (raw === "1" || raw === "true" || raw === "yes" || raw === "on") return true;
  if (raw === "0" || raw === "false" || raw === "no" || raw === "off") return false;
  // Streaming profile: skip QoE unless explicitly enabled.
  if (process.env.NEXLIFY_STREAMING_OPTIMIZED === "1") return false;
  return false;
}
