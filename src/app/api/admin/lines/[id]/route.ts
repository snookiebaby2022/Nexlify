import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/lines";
import { invalidateLineAuth, invalidateXtreamCategories } from "@/lib/cache-invalidate";
import { PanelRole } from "@prisma/client";
import { MIN_LINE_CREDENTIAL_LENGTH, sanitizeCredentialInput, validateLinePasswordPolicy } from "@/lib/credential-generate";
import { normalizeUserAgentField } from "@/lib/line-restrictions";
import { normalizeAllowedOutputInput } from "@/lib/line-access-output";
import { applyLineRenewDays } from "@/lib/line-renew";

import { parseJsonBody, apiMutationErrorResponse } from "@/lib/parse-json-body";
type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
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
    },
  });
  if (!line) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ line });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
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

  let renewResult: Awaited<ReturnType<typeof applyLineRenewDays>> | null = null;
  const days = body.days != null ? Number(body.days) : 0;
  if (Number.isFinite(days) && days > 0) {
    renewResult = await applyLineRenewDays(existing.id, days, {
      reactivate: body.reactivate !== false,
    });
    data.expiresAt = renewResult.expiresAt;
    if (renewResult.reactivated) {
      data.status = renewResult.status;
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
        }
      : undefined,
  });
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
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
