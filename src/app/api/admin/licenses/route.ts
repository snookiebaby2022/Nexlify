import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import {
  clearLicenseMachineId,
  extendLicense,
  isLicenseDeletable,
  reactivateLicense,
} from "@/lib/admin-license";
import { addDays, uniqueLicenseKey } from "@/lib/license";
import {
  syncClearMachineBinding,
  syncLicenseToPanel,
} from "@/lib/panel-sync";
import { prisma } from "@/lib/prisma";
import { TRIAL_PLAN_SLUG } from "@/lib/plans";

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
  const q = searchParams.get("q")?.trim().toLowerCase() ?? "";
  const status = searchParams.get("status")?.trim() ?? "";
  const plan = searchParams.get("plan")?.trim() ?? "";

  const where: Record<string, unknown> = {};

  if (status) {
    where.status = status;
  }

  if (plan) {
    where.plan = { slug: plan };
  }

  if (q) {
    where.OR = [
      { key: { contains: q } },
      { user: { email: { contains: q } } },
      { notes: { contains: q } },
    ];
  }

  const licenses = await prisma.license.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      user: { select: { email: true, name: true } },
      plan: { select: { name: true, slug: true } },
    },
    take: 200,
  });

  return NextResponse.json({ licenses });
}

const patchSchema = z.object({
  id: z.string(),
  status: z
    .enum(["ACTIVE", "EXPIRED", "REVOKED", "SUSPENDED", "UNUSED"])
    .optional(),
  notes: z.string().optional(),
  extendDays: z.number().int().positive().optional(),
  clearMachineId: z.boolean().optional(),
  reactivate: z.boolean().optional(),
});

export async function PATCH(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = patchSchema.parse(await request.json());

    if (body.extendDays) {
      const license = await extendLicense(body.id, body.extendDays);
      if (license) {
        await syncLicenseToPanel(license.id, "REPLACE", { licenseKey: license.key });
      }
      return NextResponse.json({ license, sync: license ? "queued" : undefined });
    }

    if (body.clearMachineId) {
      const license = await clearLicenseMachineId(body.id);
      if (license) {
        await syncClearMachineBinding(body.id);
      }
      return NextResponse.json({ license });
    }

    if (body.reactivate) {
      const license = await reactivateLicense(body.id);
      if (license) {
        await syncLicenseToPanel(license.id, "UNSUSPEND");
        await syncLicenseToPanel(license.id, "REPLACE", { licenseKey: license.key });
      }
      return NextResponse.json({ license });
    }

    const data: Record<string, unknown> = {};
    if (body.status !== undefined) data.status = body.status;
    if (body.notes !== undefined) data.notes = body.notes;

    const license = await prisma.license.update({
      where: { id: body.id },
      data,
    });

    if (body.status === "REVOKED") {
      await syncLicenseToPanel(body.id, "REVOKE");
    } else if (body.status === "SUSPENDED") {
      await syncLicenseToPanel(body.id, "SUSPEND");
    } else if (body.status === "ACTIVE") {
      await syncLicenseToPanel(body.id, "UNSUSPEND");
    }

    return NextResponse.json({ license });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    console.error("[admin/licenses PATCH]", e);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}

const deleteSchema = z.object({
  id: z.string().optional(),
  ids: z.array(z.string()).optional(),
  bulkEndedTrials: z.boolean().optional(),
});

export async function DELETE(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = deleteSchema.parse(await request.json());

    let ids: string[] = [];
    if (body.bulkEndedTrials) {
      const trialPlan = await prisma.plan.findFirst({
        where: { slug: TRIAL_PLAN_SLUG },
        select: { id: true },
      });
      if (!trialPlan) {
        return NextResponse.json({ deleted: 0 });
      }
      const ended = await prisma.license.findMany({
        where: {
          planId: trialPlan.id,
          OR: [
            { status: { in: ["REVOKED", "EXPIRED"] } },
            { expiresAt: { lt: new Date() } },
          ],
        },
        select: { id: true, status: true, expiresAt: true },
      });
      ids = ended
        .filter((l) => isLicenseDeletable(l.status, l.expiresAt))
        .map((l) => l.id);
    } else if (body.ids?.length) {
      ids = body.ids;
    } else if (body.id) {
      ids = [body.id];
    } else {
      return NextResponse.json({ error: "No ids provided" }, { status: 400 });
    }

    let deleted = 0;
    for (const id of ids) {
      const license = await prisma.license.findUnique({ where: { id } });
      if (!license) continue;
      if (!isLicenseDeletable(license.status, license.expiresAt)) continue;

      await syncLicenseToPanel(id, "DELETE");

      await prisma.addonEntitlement.updateMany({
        where: { panelLicenseId: id },
        data: { panelLicenseId: null },
      });
      await prisma.license.delete({ where: { id } });
      deleted += 1;
    }

    return NextResponse.json({ ok: true, deleted });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    console.error("[admin/licenses DELETE]", e);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}

const createSchema = z.object({
  email: z.string().email(),
  planId: z.string(),
  durationDays: z.number().int().nonnegative().optional(),
  term: z.enum(["1m", "3m", "6m", "1y", "unlimited"]).optional(),
  maxLines: z.number().int().nonnegative().optional(),
});

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = createSchema.parse(await request.json());
    const user = await prisma.user.findUnique({
      where: { email: body.email.toLowerCase() },
    });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const plan = await prisma.plan.findUnique({ where: { id: body.planId } });
    if (!plan) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }

    const unlimited = body.term === "unlimited" || body.durationDays === 0;
    const days = unlimited
      ? 36500
      : body.durationDays ?? plan.durationDays;
    const key = await uniqueLicenseKey(
      user.email,
      days,
      body.term ?? (unlimited ? "unlimited" : undefined)
    );

    const license = await prisma.license.create({
      data: {
        key,
        userId: user.id,
        planId: plan.id,
        status: "UNUSED",
        expiresAt: addDays(new Date(), days),
        maxLines: body.maxLines ?? plan.maxLines,
        notes: unlimited ? "Manual issue by admin (unlimited)" : "Manual issue by admin",
      },
    });

    const sync = await syncLicenseToPanel(license.id, "ACTIVATE", { licenseKey: key });

    return NextResponse.json({ license, sync });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Create failed" }, { status: 500 });
  }
}
