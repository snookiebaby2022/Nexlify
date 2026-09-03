import { cacheGet, cacheSet } from "@/lib/cache";

const MONITORING_PREFIX = "monitoring:";

export type StreamQuality = {
  streamId: string;
  resolution: string;
  bitrate: number;
  fps: number;
  latency: number;
  packetLoss: number;
  lastUpdated: number;
};

export type QualityAlert = {
  id: string;
  streamId: string;
  issue: string;
  severity: "warning" | "critical";
  timestamp: number;
};

export async function getStreamQuality(streamId: string): Promise<StreamQuality> {
  const cached = await cacheGet<StreamQuality>(`${MONITORING_PREFIX}${streamId}`);
  if (cached) return cached;

  const quality: StreamQuality = {
    streamId,
    resolution: "N/A",
    bitrate: 0,
    fps: 0,
    latency: 0,
    packetLoss: 0,
    lastUpdated: Date.now(),
  };

  await cacheSet(`${MONITORING_PREFIX}${streamId}`, quality, 60);
  return quality;
}

export async function updateStreamQuality(
  streamId: string,
  data: Partial<StreamQuality>
): Promise<StreamQuality> {
  const quality = await getStreamQuality(streamId);
  Object.assign(quality, data, { lastUpdated: Date.now() });
  await cacheSet(`${MONITORING_PREFIX}${streamId}`, quality, 60);
  return quality;
}

export async function createQualityAlert(
  streamId: string,
  issue: string,
  severity: QualityAlert["severity"]
): Promise<QualityAlert> {
  const alert: QualityAlert = {
    id: `qalert_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    streamId,
    issue,
    severity,
    timestamp: Date.now(),
  };

  const alerts = await getQualityAlerts();
  alerts.push(alert);
  await cacheSet(`${MONITORING_PREFIX}alerts`, alerts, 86400);
  return alert;
}

export async function getQualityAlerts(): Promise<QualityAlert[]> {
  return (await cacheGet<QualityAlert[]>(`${MONITORING_PREFIX}alerts`)) ?? [];
}
