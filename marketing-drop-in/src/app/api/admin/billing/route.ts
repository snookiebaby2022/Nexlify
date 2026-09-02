import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isStripeConfigured, getStripeWebhookSecret } from "@/lib/billing-settings";
import { stripeWebhookUrl } from "@/lib/app-url";
import { expirePastDueLicenses } from "@/lib/stripe-billing";
import { syncLicenseToPanel } from "@/lib/panel-sync";
import { extendLicense, reactivateLicense } from "@/lib/admin-license";

async function requireAdmin() {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") return null;
  return user;
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [subscriptions, pastDue, suspended, expiredTrials, webhookConfigured] =
    await Promise.all([
      prisma.license.findMany({
        where: { stripeSubscriptionId: { not: null } },
        orderBy: { updatedAt: "desc" },
        take: 100,
        include: {
          user: { select: { email: true, name: true } },
          plan: { select: { name: true, slug: true, durationDays: true, priceCents: true } },
        },
      }),
      prisma.license.count({
        where: {
          stripeSubscriptionId: { not: null },
          OR: [
            { stripeSubscriptionStatus: { in: ["past_due", "unpaid"] } },
            { status: "SUSPENDED" },
          ],
        },
      }),
      prisma.license.count({ where: { status: "SUSPENDED" } }),
      prisma.license.count({
        where: {
          status: "EXPIRED",
          plan: { slug: "trial" },
        },
      }),
      Promise.resolve(Boolean(getStripeWebhookSecret())),
    ]);

  return NextResponse.json({
    stripeConfigured: isStripeConfigured(),
    webhookConfigured,
    webhookUrl: stripeWebhookUrl(),
    summary: {
      subscriptions: subscriptions.length,
      pastDue,
      suspended,
      expiredTrials,
    },
    subscriptions: subscriptions.map((l) => ({
      id: l.id,
      email: l.user.email,
      name: l.user.name,
      plan: l.plan.name,
      planSlug: l.plan.slug,
      status: l.status,
      stripeStatus: l.stripeSubscriptionStatus,
      subscriptionId: l.stripeSubscriptionId,
      customerId: l.stripeCustomerId,
      expiresAt: l.expiresAt?.toISOString() ?? null,
      panelUrl: l.panelUrl,
      lastSyncError: l.lastSyncError,
      updatedAt: l.updatedAt.toISOString(),
    })),
  });
}

const postSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("expirePastDue") }),
  z.object({ action: z.literal("syncPanel"), licenseId: z.string() }),
  z.object({ action: z.literal("unsuspend"), licenseId: z.string() }),
  z.object({ action: z.literal("suspend"), licenseId: z.string() }),
  z.object({ action: z.literal("extendDays"), licenseId: z.string(), days: z.number().int().positive() }),
]);

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const body = postSchema.parse(await request.json());

    if (body.action === "expirePastDue") {
      const result = await expirePastDueLicenses();
      return NextResponse.json({ ok: true, ...result });
    }

    if (body.action === "suspend") {
      await prisma.license.update({
        where: { id: body.licenseId },
        data: { status: "SUSPENDED", stripeSubscriptionStatus: "past_due" },
      });
      await syncLicenseToPanel(body.licenseId, "SUSPEND").catch(() => {});
      return NextResponse.json({ ok: true });
    }

    if (body.action === "unsuspend") {
      await reactivateLicense(body.licenseId);
      await prisma.license.update({
        where: { id: body.licenseId },
        data: { status: "ACTIVE", stripeSubscriptionStatus: "active" },
      });
      await syncLicenseToPanel(body.licenseId, "UNSUSPEND").catch(() => {});
      return NextResponse.json({ ok: true });
    }

    if (body.action === "extendDays") {
      const updated = await extendLicense(body.licenseId, body.days);
      if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
      await syncLicenseToPanel(body.licenseId, "REPLACE", { licenseKey: updated.key }).catch(() => {});
      return NextResponse.json({ ok: true, license: updated });
    }

    if (body.action === "syncPanel") {
      const lic = await prisma.license.findUnique({ where: { id: body.licenseId } });
      if (!lic) return NextResponse.json({ error: "Not found" }, { status: 404 });
      const action =
        lic.status === "SUSPENDED"
          ? "SUSPEND"
          : lic.status === "REVOKED" || lic.status === "EXPIRED"
            ? "REVOKE"
            : "REPLACE";
      const result = await syncLicenseToPanel(body.licenseId, action, {
        licenseKey: lic.key,
      });
      return NextResponse.json({ ok: result.pushed, error: result.error });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    console.error("[admin/billing]", e);
    return NextResponse.json({ error: "Billing action failed" }, { status: 500 });
  }
}
