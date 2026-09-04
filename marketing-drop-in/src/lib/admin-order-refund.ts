import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { syncLicenseToPanel } from "@/lib/panel-sync";
import { cancelPayPalSubscription, refundPayPalOrder } from "@/lib/paypal-billing";
import { logAudit } from "@/lib/audit";

export async function adminRefundOrCancelOrder(opts: {
  orderId: string;
  action: "refund" | "cancel";
  adminEmail: string;
  adminId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const order = await prisma.order.findUnique({
    where: { id: opts.orderId },
    include: { license: true },
  });
  if (!order) return { ok: false, error: "Order not found" };

  try {
    if (opts.action === "refund") {
      if (order.status === "REFUNDED") return { ok: false, error: "Already refunded" };
      if (order.paymentProvider === "stripe" && order.stripePaymentId) {
        if (!isStripeConfigured()) return { ok: false, error: "Stripe is not configured" };
        await getStripe().refunds.create({ payment_intent: order.stripePaymentId });
      } else if (order.paymentProvider === "paypal" && order.paypalOrderId) {
        await refundPayPalOrder(order.paypalOrderId);
      } else if (order.amountCents > 0) {
        return { ok: false, error: "No Stripe payment or PayPal order id to refund" };
      }

      if (order.stripeSubscriptionId && isStripeConfigured()) {
        await getStripe().subscriptions.cancel(order.stripeSubscriptionId).catch(() => {});
      }
      if (order.paypalSubscriptionId) {
        await cancelPayPalSubscription(order.paypalSubscriptionId).catch(() => {});
      }

      await prisma.order.update({ where: { id: order.id }, data: { status: "REFUNDED" } });
      if (order.license) {
        await prisma.license.update({
          where: { id: order.license.id },
          data: { status: "REVOKED" },
        });
        await syncLicenseToPanel(order.license.id, "REVOKE").catch(() => {});
      }
    } else {
      if (order.stripeSubscriptionId) {
        if (!isStripeConfigured()) return { ok: false, error: "Stripe is not configured" };
        await getStripe().subscriptions.cancel(order.stripeSubscriptionId);
        if (order.license) {
          await prisma.license.update({
            where: { id: order.license.id },
            data: { stripeSubscriptionStatus: "canceled" },
          });
        }
      } else if (order.paypalSubscriptionId) {
        await cancelPayPalSubscription(order.paypalSubscriptionId);
        if (order.license) {
          await prisma.license.update({
            where: { id: order.license.id },
            data: { paypalSubscriptionStatus: "CANCELLED" },
          });
        }
      } else {
        return { ok: false, error: "No subscription to cancel" };
      }
    }

    await logAudit({
      userId: opts.adminId,
      email: opts.adminEmail,
      action: opts.action === "refund" ? "order_refund" : "order_cancel_subscription",
      detail: order.id,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Payment action failed" };
  }
}
