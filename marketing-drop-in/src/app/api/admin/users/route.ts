import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resetTrialEligibility } from "@/lib/trial";

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
  const email = searchParams.get("email")?.trim().toLowerCase() ?? "";

  if (!email) {
    return NextResponse.json({ error: "email query required" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { email },
    include: {
      licenses: {
        orderBy: { createdAt: "desc" },
        include: { plan: { select: { name: true, slug: true } } },
      },
      orders: {
        orderBy: { createdAt: "desc" },
        take: 10,
        include: { plan: { select: { name: true } } },
      },
      _count: { select: { tickets: true } },
    },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      trialBypass: user.trialBypass,
      utmSource: user.utmSource,
      utmMedium: user.utmMedium,
      utmCampaign: user.utmCampaign,
      createdAt: user.createdAt.toISOString(),
      ticketCount: user._count.tickets,
      licenses: user.licenses.map((l) => ({
        id: l.id,
        key: l.key,
        status: l.status,
        plan: l.plan.name,
        planSlug: l.plan.slug,
        expiresAt: l.expiresAt?.toISOString() ?? null,
      })),
      recentOrders: user.orders.map((o) => ({
        id: o.id,
        plan: o.plan.name,
        status: o.status,
        amountCents: o.amountCents,
        createdAt: o.createdAt.toISOString(),
      })),
    },
  });
}

const patchSchema = z.object({
  id: z.string(),
  role: z.enum(["USER", "ADMIN"]).optional(),
  trialBypass: z.boolean().optional(),
  resetTrial: z.boolean().optional(),
});

export async function PATCH(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = patchSchema.parse(await request.json());

    if (body.resetTrial) {
      const deleted = await resetTrialEligibility(body.id);
      const user = await prisma.user.findUnique({
        where: { id: body.id },
        select: { id: true, email: true, trialBypass: true, role: true },
      });
      return NextResponse.json({ user, deletedTrialLicenses: deleted });
    }

    const data: Record<string, unknown> = {};
    if (body.role !== undefined) data.role = body.role;
    if (body.trialBypass !== undefined) data.trialBypass = body.trialBypass;

    const user = await prisma.user.update({
      where: { id: body.id },
      data,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        trialBypass: true,
      },
    });

    return NextResponse.json({ user });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    console.error("[admin/users PATCH]", e);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}
