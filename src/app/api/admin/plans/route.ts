import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { gbpToUsdCents } from "@/lib/plans";
import { prisma } from "@/lib/prisma";
import { getStripe, isStripeConfigured } from "@/lib/stripe";

async function requireAdmin() {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") return null;
  return user;
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const plans = await prisma.plan.findMany({
    orderBy: { sortOrder: "asc" },
  });

  return NextResponse.json({
    plans,
    stripeConfigured: isStripeConfigured(),
  });
}

const patchSchema = z.object({
  id: z.string(),
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  priceCents: z.number().int().min(0).optional(),
  durationDays: z.number().int().positive().optional(),
  maxLines: z.number().int().positive().optional(),
  maxServers: z.number().int().positive().optional(),
  stripePriceId: z.string().nullable().optional(),
  stripeProductId: z.string().nullable().optional(),
  whmcsProductId: z.number().int().nullable().optional(),
  badge: z.string().nullable().optional(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export async function PATCH(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = patchSchema.parse(await request.json());
    const { id, ...data } = body;
    const plan = await prisma.plan.update({
      where: { id },
      data,
    });
    return NextResponse.json({ plan });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    console.error("[admin/plans PATCH]", e);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}

const postSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("syncStripe"),
    planId: z.string(),
  }),
  z.object({
    action: z.literal("create"),
    name: z.string().min(1),
    slug: z.string().min(1),
    description: z.string().min(1),
    priceCents: z.number().int().min(0),
    durationDays: z.number().int().positive(),
    maxLines: z.number().int().positive().default(10000),
    maxServers: z.number().int().positive().default(1),
    sortOrder: z.number().int().default(0),
  }),
]);

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!isStripeConfigured()) {
    return NextResponse.json(
      { error: "Stripe is not configured. Add STRIPE_SECRET_KEY to .env on the server." },
      { status: 503 },
    );
  }

  try {
    const body = postSchema.parse(await request.json());

    if (body.action === "create") {
      const plan = await prisma.plan.create({
        data: {
          name: body.name,
          slug: body.slug,
          description: body.description,
          priceCents: body.priceCents,
          durationDays: body.durationDays,
          maxLines: body.maxLines,
          maxServers: body.maxServers,
          sortOrder: body.sortOrder,
        },
      });
      return NextResponse.json({ plan });
    }

    const plan = await prisma.plan.findUnique({ where: { id: body.planId } });
    if (!plan) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }

    const stripe = getStripe();
    let productId = plan.stripeProductId ?? undefined;

    if (!productId) {
      const product = await stripe.products.create({
        name: plan.name,
        description: plan.description,
        metadata: { nexlifyPlanId: plan.id, nexlifySlug: plan.slug },
      });
      productId = product.id;
    }

    const unitAmount = gbpToUsdCents(plan.priceCents);
    const price = await stripe.prices.create({
      product: productId,
      unit_amount: unitAmount,
      currency: "usd",
      metadata: { nexlifyPlanId: plan.id, nexlifySlug: plan.slug },
    });

    const updated = await prisma.plan.update({
      where: { id: plan.id },
      data: {
        stripeProductId: productId,
        stripePriceId: price.id,
      },
    });

    return NextResponse.json({ plan: updated, stripePriceId: price.id, stripeProductId: productId });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    console.error("[admin/plans POST]", e);
    return NextResponse.json({ error: "Stripe sync failed" }, { status: 500 });
  }
}
