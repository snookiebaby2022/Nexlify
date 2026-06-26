import { prisma } from "./prisma";

export type OutboundWebhook = {
  id: string;
  url: string;
  events: string[];
  secret?: string;
  isActive: boolean;
  label?: string;
};

const KEY = "outbound_webhooks";

export async function listOutboundWebhooks(): Promise<OutboundWebhook[]> {
  const row = await prisma.panelSetting.findUnique({ where: { key: KEY } });
  if (!row?.value) return [];
  try {
    const parsed = JSON.parse(row.value) as { items?: OutboundWebhook[] };
    return Array.isArray(parsed.items) ? parsed.items : [];
  } catch {
    return [];
  }
}

export async function saveOutboundWebhooks(items: OutboundWebhook[]) {
  await prisma.panelSetting.upsert({
    where: { key: KEY },
    create: { key: KEY, value: JSON.stringify({ items }) },
    update: { value: JSON.stringify({ items }) },
  });
}

export async function dispatchOutboundWebhook(
  event: string,
  payload: Record<string, unknown>
) {
  const hooks = (await listOutboundWebhooks()).filter(
    (h) => h.isActive && h.events.includes(event)
  );
  if (!hooks.length) return;

  const body = JSON.stringify({ event, payload, at: new Date().toISOString() });

  await Promise.allSettled(
    hooks.map(async (hook) => {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "User-Agent": "NexlifyPanel-Webhook/1.0",
        "X-Nexlify-Event": event,
      };
      if (hook.secret) {
        const { createHmac } = await import("crypto");
        const sig = createHmac("sha256", hook.secret).update(body).digest("hex");
        headers["X-Nexlify-Signature"] = sig;
      }
      await fetch(hook.url, {
        method: "POST",
        headers,
        body,
        signal: AbortSignal.timeout(8000),
      });
    })
  );
}

export const WEBHOOK_EVENTS = [
  "line.created",
  "line.updated",
  "line.deleted",
  "line.disabled",
  "line.enabled",
  "line.banned",
  "theft.detected",
  "stream.probe_failed",
] as const;
