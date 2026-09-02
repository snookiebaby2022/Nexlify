import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { capturePayPalOrder } from "@/lib/paypal-billing";
import { fulfillPayPalSubscription } from "@/lib/paypal-subscription-billing";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  orderId: z.string().min(1),
  paypalOrderId: z.string().min(1).optional(),
  paypalSubscriptionId: z.string().min(1).optional(),
});

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  try {
    const { orderId, paypalOrderId, paypalSubscriptionId } = schema.parse(await request.json());

    const order = await prisma.order.findFirst({
      where: { id: orderId, userId: user.id },
      include: { license: true },
    });
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }
    if (order.paymentProvider !== "paypal") {
      return NextResponse.json({ error: "Not a PayPal order" }, { status: 400 });
    }
    if (order.status === "COMPLETED") {
      return NextResponse.json({ success: true, orderId: order.id, alreadyPaid: true });
    }

    const subscriptionId = paypalSubscriptionId ?? order.paypalSubscriptionId;
    if (subscriptionId || order.billingMode === "subscription") {
      if (!subscriptionId) {
        return NextResponse.json({ error: "PayPal subscription ID missing" }, { status: 400 });
      }
      const result = await fulfillPayPalSubscription({ orderId: order.id, subscriptionId });
      if (!result.ok) {
        return NextResponse.json(
          { error: `PayPal subscription not active (${result.error})` },
          { status: 400 },
        );
      }
      return NextResponse.json({ success: true, orderId: order.id, subscription: true });
    }

    const captureId = paypalOrderId ?? order.paypalOrderId;
    if (!captureId) {
      return NextResponse.json({ error: "PayPal order ID missing" }, { status: 400 });
    }

    const capture = await capturePayPalOrder(captureId);
    if (capture.status !== "COMPLETED") {
      return NextResponse.json({ error: `PayPal status: ${capture.status}` }, { status: 400 });
    }

    await prisma.order.update({
      where: { id: order.id },
      data: {
        status: "COMPLETED",
        paypalOrderId: captureId,
        stripePaymentId: capture.captureId ?? null,
      },
    });

    if (!order.license) {
      const { issueLicenseForOrder } = await import("@/lib/licensing");
      await issueLicenseForOrder(order.id);
    }

    return NextResponse.json({ success: true, orderId: order.id });
  } catch (e) {
    const message = e instanceof Error ? e.message : "PayPal capture failed";
    console.error("[checkout/paypal/capture]", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
