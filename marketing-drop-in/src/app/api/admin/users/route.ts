import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser, hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resetTrialEligibility } from "@/lib/trial";
import { logAudit } from "@/lib/audit";
import { sendPasswordResetEmail } from "@/lib/password-reset";

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
    // List all users
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        _count: { select: { licenses: true } },
      },
    });
    return NextResponse.json({
      users: users.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        trialBypass: u.trialBypass,
        createdAt: u.createdAt.toISOString(),
        licenseCount: u._count.licenses,
        ticketCount: 0,
        creditCents: u.creditCents,
      })),
    });
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
      creditCents: user.creditCents,
      utmSource: user.utmSource,
      utmMedium: user.utmMedium,
      utmCampaign: user.utmCampaign,
      createdAt: user.createdAt.toISOString(),
      ticketCount: 0,
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
  password: z.string().min(8).optional(),
  sendReset: z.boolean().optional(),
  creditCents: z.number().int().min(0).optional(),
  creditDeltaCents: z.number().int().optional(),
  creditReason: z.string().max(400).optional(),
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
        select: { id: true, email: true, trialBypass: true, role: true, creditCents: true },
      });
      return NextResponse.json({ user, deletedTrialLicenses: deleted });
    }

    const target = await prisma.user.findUnique({
      where: { id: body.id },
      select: { id: true, email: true, creditCents: true },
    });
    if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (body.sendReset) {
      const sent = await sendPasswordResetEmail(target.email);
      if (!sent.ok) return NextResponse.json({ error: sent.error }, { status: sent.status });
      await logAudit({
        userId: admin.id,
        email: admin.email,
        action: "user_send_reset",
        detail: target.email,
      });
      return NextResponse.json({ ok: true, resetUrl: sent.resetUrl });
    }

    const data: Record<string, unknown> = {};
    if (body.role !== undefined) data.role = body.role;
    if (body.trialBypass !== undefined) data.trialBypass = body.trialBypass;
    if (body.password) data.passwordHash = await hashPassword(body.password);
    if (body.creditCents !== undefined) data.creditCents = body.creditCents;
    if (body.creditDeltaCents) {
      data.creditCents = Math.max(0, target.creditCents + body.creditDeltaCents);
    }

    if (body.creditDeltaCents) {
      await prisma.creditNote.create({
        data: {
          userId: target.id,
          amountCents: body.creditDeltaCents,
          reason: body.creditReason?.trim() || "Admin credit",
        },
      });
    }

    const user = await prisma.user.update({
      where: { id: body.id },
      data,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        trialBypass: true,
        creditCents: true,
      },
    });

    if (body.password) {
      await logAudit({
        userId: admin.id,
        email: admin.email,
        action: "user_set_password",
        detail: target.email,
      });
    }

    return NextResponse.json({ user });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    console.error("[admin/users PATCH]", e);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}

const createSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().max(120).optional(),
  role: z.enum(["USER", "ADMIN"]).optional(),
});

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const body = createSchema.parse(await request.json());
    const email = body.email.trim().toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: "Email already registered" }, { status: 400 });
    }

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: await hashPassword(body.password),
        name: body.name?.trim() || null,
        role: body.role ?? "USER",
      },
      select: { id: true, email: true, name: true, role: true, createdAt: true },
    });

    await logAudit({
      userId: admin.id,
      email: admin.email,
      action: "user_create",
      detail: `${user.email} (${user.role})`,
    });

    return NextResponse.json({ user });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    console.error("[admin/users POST]", e);
    return NextResponse.json({ error: "Create failed" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const body = (await request.json()) as { id?: string };
    const id = String(body.id ?? "").trim();
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    if (id === admin.id) {
      return NextResponse.json({ error: "You cannot delete your own account" }, { status: 400 });
    }

    const target = await prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, role: true },
    });
    if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (target.role === "ADMIN") {
      const adminCount = await prisma.user.count({ where: { role: "ADMIN" } });
      if (adminCount <= 1) {
        return NextResponse.json({ error: "Cannot delete the last admin" }, { status: 400 });
      }
    }

    await prisma.$transaction(async (tx) => {
      const licenseIds = (
        await tx.license.findMany({ where: { userId: id }, select: { id: true } })
      ).map((l) => l.id);

      if (licenseIds.length) {
        await tx.activationCode.deleteMany({ where: { licenseId: { in: licenseIds } } });
        await tx.addonEntitlement.deleteMany({ where: { panelLicenseId: { in: licenseIds } } });
        await tx.license.deleteMany({ where: { userId: id } });
      }

      await tx.activationCode.deleteMany({ where: { userId: id } });
      await tx.addonEntitlement.deleteMany({ where: { userId: id } });
      await tx.ticketMessage.deleteMany({ where: { authorId: id } });
      await tx.ticket.deleteMany({ where: { userId: id } });
      await tx.order.deleteMany({ where: { userId: id } });
      await tx.passwordResetToken.deleteMany({ where: { email: target.email } });
      await tx.user.delete({ where: { id } });
    });

    await logAudit({
      userId: admin.id,
      email: admin.email,
      action: "user_delete",
      detail: target.email,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[admin/users DELETE]", e);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}
