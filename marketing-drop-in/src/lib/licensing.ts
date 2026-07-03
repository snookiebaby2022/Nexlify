import { addDays, uniqueLicenseKey } from "@/lib/license";
import { prisma } from "@/lib/prisma";
import { generateActivationCode } from "@/lib/activation-code";
import { sendActivationCodeEmail } from "@/lib/activation-email";
import type { License, Plan } from "@/generated/prisma";

export async function issueLicenseForOrder(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { plan: true, user: true, license: true },
  });

  if (!order) return null;
  if (order.license) return order.license;

  const days = order.licenseDurationDays ?? order.plan.durationDays;
  const key = await uniqueLicenseKey(order.user.email, days);
  const expiresAt = addDays(new Date(), days);

  const license = await prisma.license.create({
    data: {
      key,
      userId: order.userId,
      planId: order.planId,
      orderId: order.id,
      status: "UNUSED",
      expiresAt,
      maxLines: order.plan.maxLines,
      notes: order.amountCents === 0 ? "Complimentary / trial order" : undefined,
    },
    include: { plan: true },
  });

  generateActivationCode(license.id, order.userId, order.user.email)
    .then((code) =>
      sendActivationCodeEmail(order.user.email, order.user.name, code, license.id)
    )
    .catch((e) => console.error("[licensing] Failed to send activation code:", e));

  return license;
}

export async function validateLicenseKey(rawKey: string) {
  const key = rawKey.trim();
  if (!key) return { ok: false as const, error: "License key required" };

  const license = await prisma.license.findUnique({
    where: { key },
    include: { plan: true },
  });
  if (!license) return { ok: false as const, error: "License not found" };
  if (license.status === "REVOKED" || license.status === "SUSPENDED") {
    return { ok: false as const, error: "License inactive" };
  }
  if (license.expiresAt && license.expiresAt.getTime() < Date.now()) {
    return { ok: false as const, error: "License expired" };
  }
  return { ok: true as const, license };
}

export function planLimitsFromPlan(plan: Pick<Plan, "maxLines" | "maxServers" | "name" | "featuresJson">) {
  const limits = [`Up to ${plan.maxLines} lines`, `${plan.maxServers} server slot(s)`];
  if (plan.featuresJson) {
    try {
      const parsed = JSON.parse(plan.featuresJson) as unknown;
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (typeof item === "string" && item.trim()) limits.push(item.trim());
        }
      }
    } catch {
      /* ignore malformed featuresJson */
    }
  }
  return limits;
}

export type { License, Plan };
