import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { issueLicenseForOrder } from "@/lib/licensing";
import { isFreePeriod } from "@/lib/marketing-coupon";
import { prisma } from "@/lib/prisma";
import { TRIAL_PLAN_SLUG } from "@/lib/plans";
import { getAppUrl } from "@/lib/app-url";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { isPayPalConfigured } from "@/lib/billing-settings";
import { createPayPalOrder } from "@/lib/paypal-billing";
import {
  checkoutAmountCents,
  DEFAULT_CHECKOUT_CURRENCY,
  parseCheckoutCurrency,
  parsePaymentMethod,
  paypalAmountMajor,
  paypalCurrencyCode,
  stripeCurrencyCode,
} from "@/lib/checkout-currency";

const schema = z.object({
  planId: z.string().min(1),
  currency: z.enum(["GBP", "USD"]).optional(),
  paymentMethod: z.enum(["stripe", "paypal"]).optional(),
  utmSource: z.string().max(200).optional(),
  utmMedium: z.string().max(200).optional(),
  utmCampaign: z.string().max(200).optional(),
});

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  try {
    const body = schema.parse(await request.json());
    const { planId, utmSource, utmMedium, utmCampaign } = body;
    const currency = parseCheckoutCurrency(body.currency ?? DEFAULT_CHECKOUT_CURRENCY);
    const paymentMethod = parsePaymentMethod(body.paymentMethod);

    const plan = await prisma.plan.findFirst({
      where: { id: planId, active: true },
    });
    if (!plan) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }

    if (plan.slug === TRIAL_PLAN_SLUG) {
      return NextResponse.json(
        { error: "Use POST /api/trial to start a free trial — no checkout required" },
        { status: 400 },
      );
    }

    let amountCents = plan.priceCents;
    const freePeriod = isFreePeriod();
    if (freePeriod && plan.slug !== TRIAL_PLAN_SLUG) {
      amountCents = 0;
    }

    const chargeCents = checkoutAmountCents(amountCents, currency);

    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { utmSource: true, utmMedium: true, utmCampaign: true },
    });

    const utmFromUser =
      !utmSource && dbUser?.utmSource
        ? {
            utmSource: dbUser.utmSource,
            utmMedium: dbUser.utmMedium,
            utmCampaign: dbUser.utmCampaign,
          }
        : {};

    const order = await prisma.order.create({
      data: {
        userId: user.id,
        planId: plan.id,
        amountCents: chargeCents,
        currency,
        licenseDurationDays: freePeriod && plan.slug !== TRIAL_PLAN_SLUG ? plan.durationDays : null,
        status: "PENDING",
        utmSource: utmSource?.trim() || utmFromUser.utmSource || null,
        utmMedium: utmMedium?.trim() || utmFromUser.utmMedium || null,
        utmCampaign: utmCampaign?.trim() || utmFromUser.utmCampaign || null,
      },
    });

    if (amountCents === 0) {
      await prisma.order.update({
        where: { id: order.id },
        data: { status: "COMPLETED", amountCents: 0 },
      });
      await issueLicenseForOrder(order.id);
      return NextResponse.json({
        success: true,
        redirect: `${getAppUrl()}/checkout/success?order_id=${order.id}`,
      });
    }

    if (paymentMethod === "paypal") {
      if (!isPayPalConfigured()) {
        return NextResponse.json({ error: "PayPal checkout is not configured" }, { status: 503 });
      }

      const paypalOrder = await createPayPalOrder({
        amount: paypalAmountMajor(chargeCents),
        currency: paypalCurrencyCode(currency),
        description: plan.description,
        returnUrl: `${getAppUrl()}/checkout/success?paypal=1&order_id=${order.id}`,
        cancelUrl: `${getAppUrl()}/pricing?canceled=1`,
        customId: order.id,
      });

      await prisma.order.update({
        where: { id: order.id },
        data: {
          paypalOrderId: paypalOrder.orderId,
          paymentProvider: "paypal",
          billingMode: "payment",
        },
      });

      if (!paypalOrder.approveUrl) {
        return NextResponse.json({ error: "PayPal approval URL missing" }, { status: 500 });
      }

      return NextResponse.json({ url: paypalOrder.approveUrl, provider: "paypal" });
    }

    if (!isStripeConfigured()) {
      if (process.env.NODE_ENV === "production") {
        return NextResponse.json({ error: "Payments not configured" }, { status: 503 });
      }
      await prisma.order.update({
        where: { id: order.id },
        data: { status: "COMPLETED", paymentProvider: "stripe" },
      });
      await issueLicenseForOrder(order.id);
      return NextResponse.json({
        success: true,
        redirect: `${getAppUrl()}/checkout/success?order_id=${order.id}`,
      });
    }

    const stripe = getStripe();
    const stripeCurrency = stripeCurrencyCode(currency);

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer_email: user.email,
      line_items: [
        {
          price_data: {
            currency: stripeCurrency,
            unit_amount: chargeCents,
            recurring: { interval: "month" },
            product_data: {
              name: plan.name,
              description: plan.description,
            },
          },
          quantity: 1,
        },
      ],
      subscription_data: {
        metadata: {
          orderId: order.id,
          userId: user.id,
          planId: plan.id,
          currency,
        },
      },
      metadata: {
        orderId: order.id,
        userId: user.id,
        planId: plan.id,
        billingMode: "subscription",
        currency,
      },
      success_url: `${getAppUrl()}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${getAppUrl()}/pricing?canceled=1`,
    });

    await prisma.order.update({
      where: { id: order.id },
      data: {
        stripeSessionId: session.id,
        paymentProvider: "stripe",
        billingMode: "subscription",
      },
    });

    return NextResponse.json({ url: session.url, provider: "stripe" });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    const message = e instanceof Error ? e.message : "Checkout failed";
    console.error("[checkout]", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
