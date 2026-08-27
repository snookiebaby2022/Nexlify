import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { issueLicenseForOrder } from "@/lib/licensing";
import {
  couponCheckoutTotals,
  isFreePeriod,
  NEXLIFY_LAUNCH_COUPON,
  PANEL_COUPON_API,
  type PanelCouponView,
} from "@/lib/marketing-coupon";
import { prisma } from "@/lib/prisma";
import { TRIAL_PLAN_SLUG } from "@/lib/plans";
import { getAppUrl, getStripe, isStripeConfigured } from "@/lib/stripe";
import { issueTrialLicense } from "@/lib/trial";

const schema = z.object({
  planId: z.string().min(1),
  couponCode: z.string().trim().optional(),
  utmSource: z.string().max(200).optional(),
  utmMedium: z.string().max(200).optional(),
  utmCampaign: z.string().max(200).optional(),
});

async function validateCoupon(
  code: string,
  durationDays: number,
): Promise<PanelCouponView | null> {
  const res = await fetch(`${PANEL_COUPON_API}/api/billing/coupon`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, days: durationDays }),
    cache: "no-store",
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (!data?.ok || !data?.coupon) return null;
  const coupon = data.coupon as PanelCouponView & { active?: boolean };
  if (coupon.active === false) return null;
  return coupon;
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  try {
    const { planId, couponCode, utmSource, utmMedium, utmCampaign } =
      schema.parse(await request.json());
    const plan = await prisma.plan.findFirst({
      where: { id: planId, active: true },
    });
    if (!plan) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }
    let amountCents = plan.priceCents;
    let licenseDurationDays: number | null = null;
    let appliedCoupon: string | null = null;

    const freePeriod = isFreePeriod();
    if (freePeriod && plan.slug !== TRIAL_PLAN_SLUG) {
      amountCents = 0;
      licenseDurationDays = plan.durationDays;
    }

    const normalizedCoupon = couponCode?.trim().toUpperCase();
    if (normalizedCoupon && !freePeriod) {
      const coupon = await validateCoupon(normalizedCoupon, plan.durationDays);
      if (!coupon) {
        return NextResponse.json({ error: "Invalid or expired coupon" }, { status: 400 });
      }
      const totals = couponCheckoutTotals(plan.priceCents, plan.durationDays, coupon);
      amountCents = totals.amountCents;
      licenseDurationDays = totals.licenseDurationDays;
      appliedCoupon = normalizedCoupon;
    }

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
        amountCents,
        couponCode: appliedCoupon,
        licenseDurationDays,
        status: "PENDING",
        utmSource: utmSource?.trim() || utmFromUser.utmSource || null,
        utmMedium: utmMedium?.trim() || utmFromUser.utmMedium || null,
        utmCampaign: utmCampaign?.trim() || utmFromUser.utmCampaign || null,
      },
    });

    if (plan.slug === TRIAL_PLAN_SLUG) {
      await prisma.order.delete({ where: { id: order.id } }).catch(() => {});
      try {
        const license = await issueTrialLicense(user.id);
        return NextResponse.json({
          success: true,
          redirect: `${getAppUrl()}/dashboard`,
          licenseKey: license.key,
        });
      } catch (e) {
        const raw = e instanceof Error ? e.message : "Trial could not be started";
        const message = raw === "license_signing_key_missing"
          ? "Trial is temporarily unavailable. Please try again later or contact support."
          : raw.includes("license signing key")
            ? "Trial is temporarily unavailable. Please try again later or contact support."
            : raw;
        return NextResponse.json({ error: message }, { status: 400 });
      }
    }

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

    if (!isStripeConfigured()) {
      if (process.env.NODE_ENV === "production") {
        return NextResponse.json({ error: "Payments not configured" }, { status: 503 });
      }
      await prisma.order.update({
        where: { id: order.id },
        data: { status: "COMPLETED" },
      });
      await issueLicenseForOrder(order.id);
      if (appliedCoupon === NEXLIFY_LAUNCH_COUPON) {
        await fetch(`${PANEL_COUPON_API}/api/billing/coupon`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "x-billing-secret": process.env.BILLING_WEBHOOK_SECRET ?? "",
          },
          body: JSON.stringify({ code: appliedCoupon }),
        }).catch(() => {});
      }
      return NextResponse.json({
        success: true,
        redirect: `${getAppUrl()}/checkout/success?order_id=${order.id}`,
      });
    }

    const stripe = getStripe();
    const description =
      appliedCoupon && licenseDurationDays
        ? `${plan.description} (${appliedCoupon}, ${licenseDurationDays} days)`
        : plan.description;

    // Prefer monthly subscription (invoices + auto renew/suspend). Coupons that
    // change duration still use one-time payment when a custom day length is set.
    const useSubscription = !licenseDurationDays;

    const session = await stripe.checkout.sessions.create(
      useSubscription
        ? {
            mode: "subscription",
            customer_email: user.email,
            line_items: [
              plan.stripePriceId
                ? { price: plan.stripePriceId, quantity: 1 }
                : {
                    price_data: {
                      currency: "usd",
                      unit_amount: amountCents,
                      recurring: { interval: "month" },
                      product_data: {
                        name: plan.name,
                        description,
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
              },
            },
            metadata: {
              orderId: order.id,
              userId: user.id,
              planId: plan.id,
              couponCode: appliedCoupon ?? "",
              billingMode: "subscription",
            },
            success_url: `${getAppUrl()}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${getAppUrl()}/pricing?canceled=1`,
          }
        : {
            mode: "payment",
            customer_email: user.email,
            line_items: [
              {
                price_data: {
                  currency: "usd",
                  unit_amount: amountCents,
                  product_data: {
                    name: plan.name,
                    description,
                  },
                },
                quantity: 1,
              },
            ],
            metadata: {
              orderId: order.id,
              userId: user.id,
              planId: plan.id,
              couponCode: appliedCoupon ?? "",
              licenseDurationDays: licenseDurationDays ? String(licenseDurationDays) : "",
              billingMode: "payment",
            },
            success_url: `${getAppUrl()}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${getAppUrl()}/pricing?canceled=1`,
          }
    );

    await prisma.order.update({
      where: { id: order.id },
      data: {
        stripeSessionId: session.id,
        billingMode: useSubscription ? "subscription" : "payment",
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    const message = e instanceof Error ? e.message : "Checkout failed";
    console.error("[checkout]", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
