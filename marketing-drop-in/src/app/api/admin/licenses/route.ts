import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { issueLicenseForOrder } from "@/lib/licensing";
import {
  deleteLicensesSafely,
  findBulkDeletableTrialIds,
} from "@/lib/license-admin";

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
  const limit = Math.min(Number(searchParams.get("limit") ?? 200), 500);

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

  const [total, licenses] = await Promise.all([
    prisma.license.count({ where }),
    prisma.license.findMany({
      where,
      include: {
        user: { select: { email: true, name: true } },
        plan: { select: { name: true, slug: true, priceCents: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: limit,
    }),
  ]);

  const mapped = licenses.map((l) => ({
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
  }));

  const now = Date.now();
  const onlineThresholdMs = 48 * 60 * 60 * 1000;

  const installations = licenses.map((l) => {
    const lastSyncMs = l.lastSyncAt?.getTime() ?? null;
    const hoursSinceSync =
      lastSyncMs !== null ? Math.floor((now - lastSyncMs) / (60 * 60 * 1000)) : null;
    const isOnline =
      l.status === "ACTIVE" &&
      lastSyncMs !== null &&
      now - lastSyncMs < onlineThresholdMs;

    return {
      id: l.id,
      key: l.key,
      email: l.user.email,
      name: l.user.name,
      plan: l.plan.name,
      machineId: l.machineId ?? "",
      panelUrl: l.panelUrl,
      status: l.status,
      maxLines: l.maxLines,
      activatedAt: l.activatedAt?.toISOString() ?? null,
      lastSyncAt: l.lastSyncAt?.toISOString() ?? null,
      hoursSinceSync,
      isOnline,
      expiresAt: l.expiresAt?.toISOString() ?? null,
    };
  });

  const summary = {
    total,
    shown: licenses.length,
    active: licenses.filter((l) => l.status === "ACTIVE").length,
    expired: licenses.filter((l) => l.status === "EXPIRED").length,
    revoked: licenses.filter((l) => l.status === "REVOKED").length,
    suspended: licenses.filter((l) => l.status === "SUSPENDED").length,
    unused: licenses.filter((l) => l.status === "UNUSED").length,
    online: installations.filter((i) => i.isOnline).length,
  };

  const recentActivations = licenses
    .filter((l) => l.activatedAt)
    .sort((a, b) => (b.activatedAt?.getTime() ?? 0) - (a.activatedAt?.getTime() ?? 0))
    .slice(0, 10)
    .map((l) => ({
      email: l.user.email,
      plan: l.plan.name,
      activatedAt: l.activatedAt?.toISOString() ?? null,
      panelUrl: l.panelUrl,
    }));

  return NextResponse.json({
    licenses: mapped,
    summary,
    installations,
    recentActivations,
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

    await logAudit({
      userId: admin.id,
      email: admin.email,
      action: "license_update",
      detail: `${license.key} → ${JSON.stringify(updateData)}`,
    });

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

    let licenseDurationDays: number;
    let expiresAt: Date | null = null;
    if (durationDays === 0) {
      licenseDurationDays = 36500;
      expiresAt = new Date("2099-12-31");
    } else if (term && term !== "plan") {
      licenseDurationDays =
        term === "1m" ? 30 : term === "3m" ? 90 : term === "6m" ? 180 : term === "1y" ? 365 : plan.durationDays;
      expiresAt = new Date(Date.now() + licenseDurationDays * 86400000);
    } else {
      licenseDurationDays = plan.durationDays;
      expiresAt = new Date(Date.now() + licenseDurationDays * 86400000);
    }

    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      user = await prisma.user.create({
        data: { email, name: email.split("@")[0], role: "USER", passwordHash: "external" },
      });
    }

    const order = await prisma.order.create({
      data: {
        userId: user.id,
        planId: plan.id,
        amountCents: 0,
        status: "COMPLETED",
        licenseDurationDays,
      },
    });

    const issued = await issueLicenseForOrder(order.id);
    if (!issued) {
      return NextResponse.json({ error: "License issue failed" }, { status: 500 });
    }

    const license = await prisma.license.update({
      where: { id: issued.id },
      data: {
        expiresAt,
        maxLines: maxLines ? Number(maxLines) : plan.maxLines,
        notes: "Admin-issued",
      },
      include: { user: true, plan: true },
    });

    await logAudit({
      userId: admin.id,
      email: admin.email,
      action: "license_create",
      detail: `${license.key} for ${email} (${plan.slug})`,
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
    const adminOpts = { adminId: admin.id, adminEmail: admin.email };

    if (body.bulkEndedTrials) {
      const ids = await findBulkDeletableTrialIds();
      const result = await deleteLicensesSafely(ids, {
        ...adminOpts,
        skipDeletableCheck: true,
      });
      if (result.errors.length) {
        return NextResponse.json(
          {
            deleted: result.deleted,
            skipped: result.skipped,
            error: result.errors.join("; "),
          },
          { status: result.deleted ? 207 : 500 }
        );
      }
      return NextResponse.json({
        deleted: result.deleted,
        skipped: result.skipped,
      });
    }

    const ids: string[] = body.ids ?? (body.id ? [body.id] : []);
    if (!ids.length) return NextResponse.json({ error: "ids required" }, { status: 400 });

    const result = await deleteLicensesSafely(ids, adminOpts);

    if (result.deleted === 0 && result.errors.length) {
      return NextResponse.json(
        { error: result.errors.join("; "), skipped: result.skipped },
        { status: 500 }
      );
    }

    if (result.errors.length) {
      return NextResponse.json(
        {
          deleted: result.deleted,
          skipped: result.skipped,
          warning: result.errors.join("; "),
        },
        { status: 207 }
      );
    }

    return NextResponse.json({
      deleted: result.deleted,
      skipped: result.skipped,
    });
  } catch (e) {
    console.error("[admin/licenses DELETE]", e);
    const msg = e instanceof Error ? e.message : "Delete failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
