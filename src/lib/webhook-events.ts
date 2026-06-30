/** Webhook event catalog — dispatch from panel actions. */
export const WEBHOOK_EVENTS = [
  "line.created",
  "line.updated",
  "line.expired",
  "line.banned",
  "connection.started",
  "connection.ended",
  "stream.probe_failed",
  "stream.auto_fixed",
  "server.offline",
  "server.recovered",
  "security.vpn_blocked",
  "security.fraud_flagged",
  "archive.recording_started",
  "archive.recording_completed",
  "transcode.profile_switched",
  "panel.updated",
  "ticket.created",
  "ticket.replied",
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export type WebhookPayload = {
  event: WebhookEvent;
  timestamp: string;
  panelVersion?: string;
  data: Record<string, unknown>;
};

export async function dispatchWebhook(event: WebhookEvent, data: Record<string, unknown>): Promise<void> {
  const { getSettingGroup } = await import("@/lib/panel-settings");
  const general = await getSettingGroup("general");
  const urls = String(general.webhookUrls ?? "")
    .split(/[\n,;]+/)
    .map((u) => u.trim())
    .filter(Boolean);
  if (!urls.length) return;

  const enabledEvents = String(general.webhookEvents ?? "")
    .split(/[,;\s]+/)
    .map((e) => e.trim())
    .filter(Boolean);
  if (enabledEvents.length && !enabledEvents.includes(event) && !enabledEvents.includes("*")) {
    return;
  }

  let panelVersion: string | undefined;
  try {
    const { readInstalledVersion } = await import("@/lib/panel-version");
    const v = await readInstalledVersion(process.cwd());
    panelVersion = v.version;
  } catch {
    /* ignore */
  }

  const payload: WebhookPayload = {
    event,
    timestamp: new Date().toISOString(),
    panelVersion,
    data,
  };

  await Promise.allSettled(
    urls.map((url) =>
      fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Nexlify-Webhook/1.0",
          "X-Nexlify-Event": event,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(8000),
      })
    )
  );
}
