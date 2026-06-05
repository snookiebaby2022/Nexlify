import { LineStatus, Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { logActivity } from "./lines";

export type BillingAction =
  | "create"
  | "suspend"
  | "unsuspend"
  | "terminate"
  | "renew";

export type BillingPayload = {
  action: BillingAction;
  secret?: string;
  service_id?: string;
  username?: string;
  password?: string;
  bouquet_ids?: string[];
  days?: number;
  max_connections?: number;
};

function verifySecret(provided: string | null) {
  const expected = process.env.BILLING_WEBHOOK_SECRET;
  if (!expected) return false;
  return provided === expected;
}

export function billingUnauthorized() {
  return { ok: false, error: "Invalid billing webhook secret" };
}

export async function handleBillingWebhook(
  payload: BillingPayload,
  secret: string | null
) {
  if (!verifySecret(secret)) return billingUnauthorized();

  const action = payload.action;
  let line = null as Awaited<ReturnType<typeof prisma.line.findFirst>>;

  if (payload.service_id) {
    line = await prisma.line.findFirst({
      where: { externalId: String(payload.service_id) },
    });
  }
  if (!line && payload.username) {
    line = await prisma.line.findUnique({ where: { username: payload.username } });
  }

  let result: { ok: boolean; lineId?: string; message?: string; error?: string };

  switch (action) {
    case "create": {
      const username = payload.username ?? `svc_${payload.service_id}`;
      const password = payload.password ?? Math.random().toString(36).slice(2, 10);
      const days = payload.days ?? 30;
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + days);

      const created = await prisma.line.create({
        data: {
          username,
          password,
          maxConnections: payload.max_connections ?? 1,
          expiresAt,
          externalId: payload.service_id ? String(payload.service_id) : undefined,
          bouquets: {
            create: (payload.bouquet_ids ?? []).map((bouquetId) => ({ bouquetId })),
          },
        },
      });
      await logActivity("billing_create", {
        lineId: created.id,
        entity: "line",
        entityId: created.id,
        meta: { service_id: payload.service_id },
      });
      result = { ok: true, lineId: created.id, message: "created" };
      break;
    }

    case "suspend":
      if (!line) return { ok: false, error: "Line not found" };
      await prisma.line.update({
        where: { id: line.id },
        data: { status: LineStatus.DISABLED },
      });
      result = { ok: true, lineId: line.id, message: "suspended" };
      break;

    case "unsuspend":
      if (!line) return { ok: false, error: "Line not found" };
      await prisma.line.update({
        where: { id: line.id },
        data: { status: LineStatus.ACTIVE },
      });
      result = { ok: true, lineId: line.id, message: "unsuspended" };
      break;

    case "terminate":
      if (!line) return { ok: false, error: "Line not found" };
      await prisma.line.delete({ where: { id: line.id } });
      result = { ok: true, lineId: line.id, message: "terminated" };
      break;

    case "renew": {
      if (!line) return { ok: false, error: "Line not found" };
      const days = payload.days ?? 30;
      const expiresAt = new Date(line.expiresAt > new Date() ? line.expiresAt : new Date());
      expiresAt.setDate(expiresAt.getDate() + days);
      await prisma.line.update({
        where: { id: line.id },
        data: { expiresAt, status: LineStatus.ACTIVE },
      });
      result = { ok: true, lineId: line.id, message: "renewed" };
      break;
    }

    default:
      return { ok: false, error: "Unknown action" };
  }

  await prisma.billingEvent.create({
    data: {
      provider: "whmcs",
      action,
      payload: payload as Prisma.InputJsonValue,
      lineId: result.lineId,
      status: result.ok ? "ok" : "error",
      message: result.message ?? result.error,
    },
  });

  return result;
}
