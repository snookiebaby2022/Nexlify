import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";

async function requireAdmin() {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") return null;
  return user;
}

export async function GET(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const status = searchParams.get("status")?.trim() ?? "";
  const plan = searchParams.get("plan")?.trim() ?? "";

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (plan) where.plan = { slug: plan };
  if (q) {
    where.OR = [
      { key: { contains: q, mode: "insensitive" } },
      { user: { email: { contains: q, mode: "insensitive" } } },
      { notes: { contains: q, mode: "insensitive" } },
    ];
  }

  const licenses = await prisma.license.findMany({
    where,
    include: {
      user: { select: { email: true, name: true } },
      plan: { select: { name: true, slug: true, priceCents: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });

  return NextResponse.json({
    licenses: licenses.map((l) => ({
      id: l.id,
      key: l.key,
      status: l.status,
      expiresAt: l.expiresAt?.toISOString() ?? null,
      maxLines: l.maxLines,
      notes: l.notes,
      machineId: l.machineId,
      panelUrl: l.panelUrl,
      lastSyncAt: l.lastSyncAt?.toISOString() ?? null,
      lastSyncError: l.lastSyncError,
      pendingSyncAction: l.pendingSyncAction,
      user: { email: l.user.email, name: l.user.name },
      plan: { name: l.plan.name, slug: l.plan.slug },
    })),
  });
}

export async function PATCH(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const body = await request.json();
    const { id, ...data } = body;
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const updateData: Record<string, unknown> = {};
    if (data.status) updateData.status = data.status;
    if (data.notes !== undefined) updateData.notes = data.notes;
    if (data.extendDays) {
      const lic = await prisma.license.findUnique({ where: { id } });
      if (!lic) return NextResponse.json({ error: "Not found" }, { status: 404 });
      const base = lic.expiresAt && lic.expiresAt > new Date() ? lic.expiresAt : new Date();
      updateData.expiresAt = new Date(base.getTime() + data.extendDays * 86400000);
    }
    if (data.clearMachineId) {
      updateData.machineId = null;
      updateData.panelUrl = null;
    }
    if (data.reactivate) {
      updateData.status = "ACTIVE";
    }

    const license = await prisma.license.update({ where: { id }, data: updateData });
    return NextResponse.json({ license });
  } catch (e) {
    console.error("[admin/licenses PATCH]", e);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const body = await request.json();
    const { email, planId, term, durationDays, maxLines } = body;
    if (!email || !planId) {
      return NextResponse.json({ error: "email and planId required" }, { status: 400 });
    }

    const plan = await prisma.plan.findUnique({ where: { id: planId } });
    if (!plan) return NextResponse.json({ error: "Plan not found" }, { status: 404 });

    let expiresAt: Date | null = null;
    if (durationDays === 0) {
      expiresAt = new Date("2099-12-31");
    } else if (term && term !== "plan") {
      const days = term === "1m" ? 30 : term === "3m" ? 90 : term === "6m" ? 180 : term === "1y" ? 365 : plan.durationDays;
      expiresAt = new Date(Date.now() + days * 86400000);
    } else {
      expiresAt = new Date(Date.now() + plan.durationDays * 86400000);
    }

    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      user = await prisma.user.create({
        data: { email, name: email.split("@")[0], role: "USER", passwordHash: "external" },
      });
    }

    const key = `NXL-${Math.random().toString(36).slice(2, 8).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

    const license = await prisma.license.create({
      data: {
        key,
        userId: user.id,
        planId: plan.id,
        status: "ACTIVE",
        maxLines: maxLines ? Number(maxLines) : plan.maxLines,
        expiresAt,
        activatedAt: new Date(),
      },
      include: { user: true, plan: true },
    });

    return NextResponse.json({ license, sync: { pushed: false } });
  } catch (e) {
    console.error("[admin/licenses POST]", e);
    return NextResponse.json({ error: "Issue failed" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const body = await request.json();

    // Bulk delete ended trial licenses
    if (body.bulkEndedTrials) {
      const result = await prisma.license.deleteMany({
        where: {
          status: { in: ["REVOKED", "EXPIRED"] },
          plan: { slug: "trial" },
        },
      });
      return NextResponse.json({ deleted: result.count });
    }

    const ids: string[] = body.ids ?? (body.id ? [body.id] : []);
    if (!ids.length) return NextResponse.json({ error: "ids required" }, { status: 400 });

    const result = await prisma.license.deleteMany({ where: { id: { in: ids } } });
    return NextResponse.json({ deleted: result.count });
  } catch (e) {
    console.error("[admin/licenses DELETE]", e);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}
