import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getAppUrl } from "@/lib/app-url";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";

/** Stripe Customer Portal — update card / cancel subscription. */
export async function POST() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "Billing not configured" }, { status: 503 });
  }

  const license = await prisma.license.findFirst({
    where: {
      userId: user.id,
      stripeCustomerId: { not: null },
      stripeSubscriptionId: { not: null },
    },
    orderBy: { updatedAt: "desc" },
  });

  if (!license?.stripeCustomerId) {
    return NextResponse.json(
      { error: "No Stripe subscription found for your account" },
      { status: 404 }
    );
  }

  const stripe = getStripe();
  const session = await stripe.billingPortal.sessions.create({
    customer: license.stripeCustomerId,
    return_url: `${getAppUrl()}/dashboard`,
  });

  return NextResponse.json({ url: session.url });
}
