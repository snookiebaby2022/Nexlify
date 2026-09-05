import { prisma } from "./prisma";
import { logActivity } from "./lines";

interface CertInfo {
  host: string;
  streamName: string;
  streamId: string;
  expiresAt: Date | null;
  daysLeft: number | null;
  error: string | null;
}

/** Cap TLS probes per hourly run — unique hosts only (not every LIVE row). */
const MAX_HOSTS_PER_RUN = 40;
const CERT_TIMEOUT_MS = 5_000;

async function checkCertExpiry(url: string): Promise<{ expiresAt: Date | null; error: string | null }> {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return { expiresAt: null, error: null };

    const { default: tls } = await import("tls");
    const { default: https } = await import("https");

    return new Promise((resolve) => {
      let settled = false;
      const finish = (value: { expiresAt: Date | null; error: string | null }) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      };
      const timer = setTimeout(() => finish({ expiresAt: null, error: "Connection timeout" }), CERT_TIMEOUT_MS);

      try {
        const req = https.get(url, { timeout: CERT_TIMEOUT_MS }, (res) => {
          const socket = res.socket as import("tls").TLSSocket;
          const cert = socket.getPeerCertificate();
          res.resume();
          if (cert?.valid_to) {
            finish({ expiresAt: new Date(cert.valid_to), error: null });
          } else {
            finish({ expiresAt: null, error: "No certificate info" });
          }
        });
        req.on("error", (e) => {
          const opts = {
            host: parsed.hostname,
            port: parseInt(parsed.port) || 443,
            servername: parsed.hostname,
            rejectUnauthorized: false,
            timeout: CERT_TIMEOUT_MS,
          };
          const socket = tls.connect(opts, () => {
            const cert = socket.getPeerCertificate();
            socket.destroy();
            if (cert?.valid_to) {
              finish({ expiresAt: new Date(cert.valid_to), error: null });
            } else {
              finish({ expiresAt: null, error: e.message });
            }
          });
          socket.on("error", () => finish({ expiresAt: null, error: e.message }));
          socket.setTimeout(CERT_TIMEOUT_MS, () => {
            socket.destroy();
            finish({ expiresAt: null, error: "Timeout" });
          });
        });
        req.on("timeout", () => {
          req.destroy();
          finish({ expiresAt: null, error: "Timeout" });
        });
      } catch (e) {
        finish({ expiresAt: null, error: String(e) });
      }
    });
  } catch {
    return { expiresAt: null, error: "Invalid URL" };
  }
}

type HostSample = { host: string; url: string; streamName: string; streamId: string };

/**
 * Probe a small sample of unique HTTPS hosts from active LIVE streams.
 * Never walk every stream row — that blocked hourly cron (Plex, fleet heal) for hours.
 */
export async function jobCheckStreamCerts(): Promise<{ checked: number; alerts: CertInfo[]; hostsSampled: number }> {
  const streams = await prisma.stream.findMany({
    where: { isActive: true, type: "LIVE", streamUrl: { startsWith: "https://" } },
    select: { id: true, name: true, streamUrl: true, backupUrl: true },
    take: 2_000,
    orderBy: { updatedAt: "desc" },
  });

  const byHost = new Map<string, HostSample>();
  for (const stream of streams) {
    const candidates = [stream.streamUrl, stream.backupUrl?.trim()].filter(Boolean) as string[];
    for (const url of candidates) {
      if (!url.startsWith("https://")) continue;
      let host: string;
      try {
        host = new URL(url).hostname.toLowerCase();
      } catch {
        continue;
      }
      if (!host || byHost.has(host)) continue;
      byHost.set(host, { host, url, streamName: stream.name, streamId: stream.id });
      if (byHost.size >= MAX_HOSTS_PER_RUN) break;
    }
    if (byHost.size >= MAX_HOSTS_PER_RUN) break;
  }

  const samples = [...byHost.values()];
  const alerts: CertInfo[] = [];

  for (const sample of samples) {
    const { expiresAt, error } = await checkCertExpiry(sample.url);
    if (error) {
      alerts.push({
        host: sample.host,
        streamName: sample.streamName,
        streamId: sample.streamId,
        expiresAt: null,
        daysLeft: null,
        error,
      });
      continue;
    }
    if (expiresAt) {
      const daysLeft = Math.floor((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      if (daysLeft <= 30) {
        alerts.push({
          host: sample.host,
          streamName: sample.streamName,
          streamId: sample.streamId,
          expiresAt,
          daysLeft,
          error: null,
        });
      }
    }
  }

  if (alerts.length > 0) {
    const expired = alerts.filter((a) => a.daysLeft !== null && a.daysLeft <= 0);
    const expiringSoon = alerts.filter((a) => a.daysLeft !== null && a.daysLeft > 0);
    const errored = alerts.filter((a) => a.error);

    const summary: string[] = [];
    if (expired.length > 0) summary.push(`${expired.length} expired`);
    if (expiringSoon.length > 0) summary.push(`${expiringSoon.length} expiring within 30 days`);
    if (errored.length > 0) summary.push(`${errored.length} errors`);

    await logActivity("ssl_cert_warning", {
      entity: "stream",
      meta: {
        summary: summary.join(", "),
        hostsSampled: samples.length,
        alerts: alerts.slice(0, 50).map((a) => ({
          host: a.host,
          stream: a.streamName,
          daysLeft: a.daysLeft,
          error: a.error,
        })),
      },
    });
  }

  return { checked: samples.length, alerts, hostsSampled: samples.length };
}
