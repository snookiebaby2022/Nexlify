import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TRIAL_PLAN_SLUG } from "@/lib/plans";
import { adminRefundOrCancelOrder } from "@/lib/admin-order-refund";

async function requireAdmin() {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") return null;
  return user;
}

export async function GET(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const limit = Math.min(Number(searchParams.get("limit") ?? 50), 200);

  const orders = await prisma.order.findMany({
    where: {
      plan: { slug: { not: TRIAL_PLAN_SLUG } },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      user: { select: { email: true, name: true } },
      plan: { select: { name: true, slug: true } },
      license: { select: { key: true, status: true } },
    },
  });

  return NextResponse.json({
    orders: orders.map((o) => ({
      id: o.id,
      email: o.user.email,
      name: o.user.name,
      plan: o.plan.name,
      planSlug: o.plan.slug,
      status: o.status,
      amountCents: o.amountCents,
      currency: o.currency,
      paymentProvider: o.paymentProvider,
      licenseDurationDays: o.licenseDurationDays,
      utmSource: o.utmSource,
      utmMedium: o.utmMedium,
      utmCampaign: o.utmCampaign,
      stripePaymentId: o.stripePaymentId,
      stripeSubscriptionId: o.stripeSubscriptionId,
      paypalOrderId: o.paypalOrderId,
      paypalSubscriptionId: o.paypalSubscriptionId,
      licenseKey: o.license?.key ?? null,
      licenseStatus: o.license?.status ?? null,
      createdAt: o.createdAt.toISOString(),
    })),
  });
}

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = (await request.json()) as { id?: string; action?: string };
  const id = String(body.id ?? "").trim();
  const action = body.action === "cancel" ? "cancel" : body.action === "refund" ? "refund" : null;
  if (!id || !action) {
    return NextResponse.json({ error: "id and action (refund|cancel) required" }, { status: 400 });
  }
  const result = await adminRefundOrCancelOrder({
    orderId: id,
    action,
    adminEmail: admin.email,
    adminId: admin.id,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
