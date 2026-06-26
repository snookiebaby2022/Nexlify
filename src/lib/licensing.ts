import { addDays, uniqueLicenseKey } from "@/lib/license";
import { prisma } from "@/lib/prisma";

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

  return prisma.license.create({
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
}
