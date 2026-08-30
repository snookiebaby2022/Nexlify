import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/lines";
import { invalidateLineAuth, invalidateXtreamCategories } from "@/lib/cache-invalidate";
import { PanelRole } from "@prisma/client";
import { MIN_LINE_CREDENTIAL_LENGTH, sanitizeCredentialInput, validateLinePasswordPolicy } from "@/lib/credential-generate";
import { normalizeUserAgentField } from "@/lib/line-restrictions";
import { normalizeAllowedOutputInput } from "@/lib/line-access-output";
import { applyLineRenewDays, applyLineSetExpiry, applyLineUnlimited } from "@/lib/line-renew";
import { assertRoleMaySetUnlimited } from "@/lib/reseller-line-guards";

import { parseJsonBody, apiMutationErrorResponse } from "@/lib/parse-json-body";
import { guardAdminApiRequest } from "@/lib/admin-route-guard";
type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const rateLimited = await guardAdminApiRequest(_req);
  if (rateLimited) return rateLimited;

  const session = await requireSession([
    PanelRole.ADMIN,
    PanelRole.RESELLER,
    PanelRole.SUB_RESELLER,
  ]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await ctx.params;
  const where =
    session.role === PanelRole.ADMIN ? { id } : { id, ownerId: session.id };

  const line = await prisma.line.findFirst({
    where,
    include: {
      bouquets: { include: { bouquet: true } },
      owner: { select: { id: true, username: true } },
      forcedServer: { select: { id: true, name: true } },
      package: { select: { id: true, name: true, days: true, creditCost: true, maxLines: true, isActive: true } },
    },
  });
  if (!line) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ line });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  try {
  const session = await requireSession([
    PanelRole.ADMIN,
    PanelRole.RESELLER,
    PanelRole.SUB_RESELLER,
  ]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await ctx.params;
  const parsed = await parseJsonBody(req);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const where =
    session.role === PanelRole.ADMIN ? { id } : { id, ownerId: session.id };

  const existing = await prisma.line.findFirst({ where });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const nextPassword = body.password ? sanitizeCredentialInput(String(body.password)) : "";
  if (body.password) {
    const passErr = validateLinePasswordPolicy(nextPassword, existing.username, {
      minLength: MIN_LINE_CREDENTIAL_LENGTH,
      requireLetterAndDigit: false,
    });
    if (passErr) return NextResponse.json({ error: passErr }, { status: 400 });
  }

  if (body.isTrial === true && existing.isTrial !== true) {
    const { assertIptvTrialAllowed } = await import("@/lib/iptv-trial-lines");
    const trialGuard = await assertIptvTrialAllowed({ isTrial: true });
    if (!trialGuard.ok) {
      return NextResponse.json({ error: trialGuard.error }, { status: 400 });
    }
  }

  const data: Record<string, unknown> = {
    lockToIp: body.lockToIp !== undefined ? Boolean(body.lockToIp) : undefined,
    allowedIps:
      body.allowedIps !== undefined
        ? body.allowedIps
          ? String(body.allowedIps)
          : null
        : undefined,
    allowedCountries:
      body.allowedCountries !== undefined
        ? body.allowedCountries
          ? String(body.allowedCountries)
          : null
        : undefined,
    blockedCountries:
      body.blockedCountries !== undefined
        ? body.blockedCountries
          ? String(body.blockedCountries)
          : null
        : undefined,
    blockedIsps:
      body.blockedIsps !== undefined
        ? body.blockedIsps
          ? String(body.blockedIsps)
          : null
        : undefined,
    allowedUserAgents:
      body.allowedUserAgents !== undefined
        ? normalizeUserAgentField(
            body.allowedUserAgents == null ? null : String(body.allowedUserAgents)
          )
        : undefined,
    forcedServerId:
      body.forcedServerId !== undefined
        ? body.forcedServerId
          ? String(body.forcedServerId)
          : null
        : undefined,
    maxConnections:
      body.maxConnections != null ? Number(body.maxConnections) : undefined,
    isRestreamer: body.isRestreamer !== undefined ? Boolean(body.isRestreamer) : undefined,
    isTrial: body.isTrial !== undefined ? Boolean(body.isTrial) : undefined,
    notes: body.notes !== undefined ? String(body.notes) : undefined,
    password: nextPassword || undefined,
    externalId:
      body.externalId !== undefined ? (body.externalId ? String(body.externalId) : null) : undefined,
    allowedOutput:
      body.allowedOutput !== undefined
        ? normalizeAllowedOutputInput(body.allowedOutput)
        : undefined,
  };

  if (body.packageId !== undefined) {
    const pid = body.packageId ? String(body.packageId).trim() : "";
    if (!pid) {
      data.packageId = null;
    } else {
      const pkg = await prisma.package.findUnique({
        where: { id: pid },
        select: { id: true },
      });
      if (!pkg) return NextResponse.json({ error: "Package not found" }, { status: 400 });
      data.packageId = pkg.id;
    }
  }

  if (session.role === PanelRole.ADMIN && body.ownerId !== undefined) {
    const destId = body.ownerId ? String(body.ownerId).trim() : "";
    if (!destId) {
      data.ownerId = null;
    } else {
      const dest = await prisma.panelUser.findUnique({
        where: { id: destId },
        select: {
          id: true,
          role: true,
          isActive: true,
          maxLines: true,
          _count: { select: { lines: true } },
        },
      });
      if (
        !dest ||
        (dest.role !== PanelRole.RESELLER && dest.role !== PanelRole.SUB_RESELLER)
      ) {
        return NextResponse.json(
          { error: "Owner must be a reseller or sub-reseller" },
          { status: 400 }
        );
      }
      if (!dest.isActive) {
        return NextResponse.json({ error: "Destination reseller is inactive" }, { status: 400 });
      }
      if (
        dest.maxLines > 0 &&
        existing.ownerId !== dest.id &&
        dest._count.lines + 1 > dest.maxLines
      ) {
        return NextResponse.json(
          { error: `Destination line limit is ${dest.maxLines}` },
          { status: 400 }
        );
      }
      data.ownerId = dest.id;
    }
  }

  let renewResult: Awaited<ReturnType<typeof applyLineRenewDays>> | null = null;
  let creditCharge: { charged: number; balanceAfter: number | null } | null = null;
  if (body.unlimited === true) {
    const unlimitedGuard = assertRoleMaySetUnlimited(session.role, { unlimited: true });
    if (!unlimitedGuard.ok) {
      return NextResponse.json({ error: unlimitedGuard.error }, { status: 400 });
    }
    renewResult = await applyLineUnlimited(existing.id, {
      reactivate: body.reactivate !== false,
    });
    data.expiresAt = renewResult.expiresAt;
    if (renewResult.reactivated) {
      data.status = renewResult.status;
    }
  } else if (body.expiresAt && String(body.expiresAt).trim()) {
    const parsedExpiry = new Date(String(body.expiresAt));
    if (Number.isNaN(parsedExpiry.getTime())) {
      return NextResponse.json({ error: "Invalid expiry date" }, { status: 400 });
    }
    const expiryGuard = assertRoleMaySetUnlimited(session.role, { expiresAt: parsedExpiry });
    if (!expiryGuard.ok) {
      return NextResponse.json({ error: expiryGuard.error }, { status: 400 });
    }

    const { renewDaysFromExpiryChange, chargeLineRenewCredits } = await import(
      "@/lib/line-renew-credits"
    );
    const daysAdded = renewDaysFromExpiryChange(existing.expiresAt, parsedExpiry);

    try {
      let charged = 0;
      let balanceAfter: number | null = null;
      if (daysAdded > 0) {
        const credit = await prisma.$transaction(async (tx) =>
          chargeLineRenewCredits(tx, session, {
            days: daysAdded,
            packageId: body.packageId ? String(body.packageId) : undefined,
            lineUsername: existing.username,
          })
        );
        charged = credit.charged;
        balanceAfter = credit.balanceAfter;
      }
      renewResult = await applyLineSetExpiry(existing.id, parsedExpiry, {
        reactivate: body.reactivate !== false,
      });
      creditCharge = { charged, balanceAfter };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "Insufficient credits" || msg === "Forbidden") {
        return NextResponse.json({ error: msg }, { status: 400 });
      }
      throw e;
    }
    data.expiresAt = renewResult.expiresAt;
    if (renewResult.reactivated) {
      data.status = renewResult.status;
    }
  } else {
    const days = body.days != null ? Number(body.days) : 0;
    if (Number.isFinite(days) && days > 0) {
      const daysGuard = assertRoleMaySetUnlimited(session.role, { days });
      if (!daysGuard.ok) {
        return NextResponse.json({ error: daysGuard.error }, { status: 400 });
      }

      const { chargeLineRenewCredits } = await import("@/lib/line-renew-credits");

      try {
        const credit = await prisma.$transaction(async (tx) =>
          chargeLineRenewCredits(tx, session, {
            days,
            packageId: body.packageId ? String(body.packageId) : undefined,
            lineUsername: existing.username,
          })
        );
        renewResult = await applyLineRenewDays(existing.id, days, {
          reactivate: body.reactivate !== false,
        });
        creditCharge = {
          charged: credit.charged,
          balanceAfter: credit.balanceAfter,
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg === "Insufficient credits" || msg === "Forbidden") {
          return NextResponse.json({ error: msg }, { status: 400 });
        }
        throw e;
      }
      data.expiresAt = renewResult.expiresAt;
      if (renewResult.reactivated) {
        data.status = renewResult.status;
      }
    }
  }

  const line = await prisma.line.update({
    where: { id: existing.id },
    data,
  });

  void invalidateLineAuth(existing.username);
  if (line.username !== existing.username) void invalidateLineAuth(line.username);

  if (body.bouquetIds && Array.isArray(body.bouquetIds)) {
    await prisma.lineBouquet.deleteMany({ where: { lineId: line.id } });
    await prisma.lineBouquet.createMany({
      data: body.bouquetIds.map((bouquetId: string) => ({ lineId: line.id, bouquetId })),
    });
    await invalidateXtreamCategories();
  }

  await logActivity(renewResult ? "renew_line" : "edit_line", {
    userId: session.id,
    lineId: line.id,
    entity: "line",
    entityId: line.id,
    meta: renewResult
      ? {
          days: renewResult.daysAdded,
          previousExpiresAt: renewResult.previousExpiresAt.toISOString(),
          reactivated: renewResult.reactivated,
        }
      : undefined,
  });

  return NextResponse.json({
    line,
    renew: renewResult
      ? {
          expiresAt: renewResult.expiresAt.toISOString(),
          previousExpiresAt: renewResult.previousExpiresAt.toISOString(),
          daysAdded: renewResult.daysAdded,
          status: renewResult.status,
          reactivated: renewResult.reactivated,
          creditsCharged: creditCharge?.charged ?? 0,
          creditsRemaining: creditCharge?.balanceAfter ?? undefined,
        }
      : undefined,
    creditsCharged: creditCharge?.charged ?? 0,
    creditsRemaining: creditCharge?.balanceAfter ?? undefined,
  });
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const rateLimited = await guardAdminApiRequest(_req);
  if (rateLimited) return rateLimited;

  try {
  const session = await requireSession([
    PanelRole.ADMIN,
    PanelRole.RESELLER,
    PanelRole.SUB_RESELLER,
  ]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await ctx.params;
  const where =
    session.role === PanelRole.ADMIN ? { id } : { id, ownerId: session.id };

  const existing = await prisma.line.findFirst({ where });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Log before delete — ActivityLog.lineId FK rejects inserts after the line is gone (P2003 → 500).
  await logActivity("delete_line", {
    userId: session.id,
    lineId: existing.id,
    entity: "line",
    entityId: existing.id,
    meta: { username: existing.username },
  });

  await prisma.line.delete({ where: { id: existing.id } });

  return NextResponse.json({ ok: true });
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}
