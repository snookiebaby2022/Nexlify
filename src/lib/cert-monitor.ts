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

async function checkCertExpiry(url: string): Promise<{ expiresAt: Date | null; error: string | null }> {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return { expiresAt: null, error: null };

    const { default: tls } = await import("tls");
    const { default: https } = await import("https");

    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve({ expiresAt: null, error: "Connection timeout" }), 10000);

      try {
        const req = https.get(url, { timeout: 10000 }, (res) => {
          clearTimeout(timer);
          const socket = res.socket as import("tls").TLSSocket;
          const cert = socket.getPeerCertificate();
          if (cert?.valid_to) {
            const expiresAt = new Date(cert.valid_to);
            res.resume();
            resolve({ expiresAt, error: null });
          } else {
            res.resume();
            resolve({ expiresAt: null, error: "No certificate info" });
          }
        });
        req.on("error", (e) => {
          clearTimeout(timer);
          // For expired certs, we still want to get the cert info
          // Try connecting with rejectUnauthorized=false
          const opts = {
            host: parsed.hostname,
            port: parseInt(parsed.port) || 443,
            servername: parsed.hostname,
            rejectUnauthorized: false,
            timeout: 10000,
          };
          const socket = tls.connect(opts, () => {
            const cert = socket.getPeerCertificate();
            socket.destroy();
            if (cert?.valid_to) {
              resolve({ expiresAt: new Date(cert.valid_to), error: null });
            } else {
              resolve({ expiresAt: null, error: e.message });
            }
          });
          socket.on("error", () => {
            clearTimeout(timer);
            resolve({ expiresAt: null, error: e.message });
          });
        });
        req.on("timeout", () => {
          clearTimeout(timer);
          req.destroy();
          resolve({ expiresAt: null, error: "Timeout" });
        });
      } catch (e) {
        clearTimeout(timer);
        resolve({ expiresAt: null, error: String(e) });
      }
    });
  } catch {
    return { expiresAt: null, error: "Invalid URL" };
  }
}

export async function jobCheckStreamCerts(): Promise<{ checked: number; alerts: CertInfo[] }> {
  const streams = await prisma.stream.findMany({
    where: { isActive: true, type: "LIVE" },
    select: { id: true, name: true, streamUrl: true, backupUrl: true },
  });

  const alerts: CertInfo[] = [];
  const checked = streams.length;

  for (const stream of streams) {
    const urls = [stream.streamUrl];
    if (stream.backupUrl?.trim()) urls.push(stream.backupUrl.trim());

    for (const url of urls) {
      if (!url.startsWith("https://")) continue;

      const host = new URL(url).hostname;
      const { expiresAt, error } = await checkCertExpiry(url);

      if (error) {
        alerts.push({
          host,
          streamName: stream.name,
          streamId: stream.id,
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
            host,
            streamName: stream.name,
            streamId: stream.id,
            expiresAt,
            daysLeft,
            error: null,
          });
        }
      }
    }
  }

  // Log alerts
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
        alerts: alerts.map((a) => ({
          host: a.host,
          stream: a.streamName,
          daysLeft: a.daysLeft,
          error: a.error,
        })),
      },
    });
  }

  return { checked, alerts };
}
