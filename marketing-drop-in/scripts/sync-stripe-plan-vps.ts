/**
 * Create Stripe product + price for Nexlify License plan (VPS one-shot).
 * Run: cd /var/www/nexlify && npx tsx scripts/sync-stripe-plan-vps.ts
 */
import { config } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import Stripe from "stripe";
import { gbpToUsdCents, PAID_PLAN_SLUG } from "../src/lib/plans";

for (const p of [resolve(process.cwd(), ".env"), "/var/www/nexlify/.env"]) {
  if (existsSync(p)) config({ path: p, override: true });
}

async function main() {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key?.startsWith("sk_")) {
    console.error("STRIPE_SECRET_KEY missing or invalid in .env (must start with sk_)");
    process.exit(1);
  }

  const stripe = new Stripe(key);
  const mode = key.includes("_test_") ? "TEST" : "LIVE";
  console.log(`Stripe mode: ${mode}`);

  // Quick API check
  await stripe.products.list({ limit: 1 });
  console.log("Stripe API: OK");

  const { prisma } = await import("../src/lib/prisma");
  const plan = await prisma.plan.findFirst({
    where: { slug: PAID_PLAN_SLUG, active: true },
  });
  if (!plan) {
    console.error(`Plan "${PAID_PLAN_SLUG}" not found — run sync-plans-vps.ts first`);
    process.exit(1);
  }

  let productId = plan.stripeProductId?.trim() || undefined;
  if (productId) {
    try {
      await stripe.products.retrieve(productId);
      console.log(`Using existing product: ${productId}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`Stored product ${productId} invalid (${msg}) — creating new product`);
      productId = undefined;
    }
  }

  if (!productId) {
    const product = await stripe.products.create({
      name: plan.name,
      description: plan.description,
      metadata: { nexlifyPlanId: plan.id, nexlifySlug: plan.slug },
    });
    productId = product.id;
    console.log(`Created product: ${productId}`);
  }

  const unitAmount = gbpToUsdCents(plan.priceCents);
  // Monthly recurring — required for subscription checkout + invoices.
  const price = await stripe.prices.create({
    product: productId,
    unit_amount: unitAmount,
    currency: "usd",
    recurring: { interval: "month" },
    metadata: { nexlifyPlanId: plan.id, nexlifySlug: plan.slug },
  });
  console.log(`Created monthly price: ${price.id} (${unitAmount} USD cents / month)`);

  await prisma.plan.update({
    where: { id: plan.id },
    data: { stripeProductId: productId, stripePriceId: price.id },
  });

  console.log("\nDone — refresh https://nexlify.live/admin and verify Plans & Stripe");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
