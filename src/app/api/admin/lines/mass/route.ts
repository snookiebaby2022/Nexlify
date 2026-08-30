import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/lines";
import { invalidateXtreamCategories } from "@/lib/cache-invalidate";
import { mergeResellerNotes, type MassEditPatch } from "@/lib/lines-mass-edit";
import { applyLineRenewDays } from "@/lib/line-renew";
import { normalizeUserAgentField } from "@/lib/line-restrictions";
import { normalizeAllowedOutputInput } from "@/lib/line-access-output";
import { LineStatus, PanelRole } from "@prisma/client";

import { parseJsonBody, apiMutationErrorResponse } from "@/lib/parse-json-body";
import { guardAdminApiRequest } from "@/lib/admin-route-guard";
function applyMassEditPatch(patch: MassEditPatch) {
  const data: {
    password?: string;
    notes?: string;
    status?: LineStatus;
    allowedCountries?: string | null;
    allowedIps?: string | null;
    allowedUserAgents?: string | null;
    disallowedUserAgents?: string | null;
    blockedIsps?: string | null;
    canWatchAdult?: boolean;
    allowedOutput?: string;
    lockToIp?: boolean;
    ownerId?: string | null;
  } = {};

  if (patch.password && !patch.password.unchanged && patch.password.value.trim()) {
    data.password = patch.password.value.trim();
  }
  if (patch.resellerNotes && !patch.resellerNotes.unchanged) {
    data.notes = patch.resellerNotes.value;
  }
  if (patch.enabled === "yes") data.status = LineStatus.ACTIVE;
  if (patch.enabled === "no") data.status = LineStatus.DISABLED;
  if (patch.allowedCountries && !patch.allowedCountries.unchanged) {
    data.allowedCountries = patch.allowedCountries.value.trim() || null;
  }
  if (patch.allowedIps && !patch.allowedIps.unchanged) {
    data.allowedIps = patch.allowedIps.value.trim() || null;
  }
  if (patch.allowedUserAgents && !patch.allowedUserAgents.unchanged) {
    data.allowedUserAgents = normalizeUserAgentField(patch.allowedUserAgents.value);
  }
  if (patch.disallowedUserAgents && !patch.disallowedUserAgents.unchanged) {
    data.disallowedUserAgents = normalizeUserAgentField(patch.disallowedUserAgents.value);
  }
  if (patch.blockedIsps && !patch.blockedIsps.unchanged) {
    data.blockedIsps = patch.blockedIsps.value.trim() || null;
  }
  if (patch.canWatchAdult === "yes") data.canWatchAdult = true;
  if (patch.canWatchAdult === "no") data.canWatchAdult = false;
  if (patch.allowedOutputs && !patch.allowedOutputs.unchanged && patch.allowedOutputs.value.trim()) {
    data.allowedOutput =
      normalizeAllowedOutputInput(patch.allowedOutputs.value) ?? patch.allowedOutputs.value.trim();
  }
  if (patch.lockToIp === "yes") data.lockToIp = true;
  if (patch.lockToIp === "no") data.lockToIp = false;
  if (patch.ownerId && !patch.ownerId.unchanged) {
    data.ownerId = patch.ownerId.value.trim() || null;
  }

  return data;
}

export async function POST(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  try {
  const session = await requireSession([
    PanelRole.ADMIN,
    PanelRole.RESELLER,
    PanelRole.SUB_RESELLER,
  ]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = await parseJsonBody(req);

  if (!parsed.ok) return parsed.response;

  const body = parsed.data;

  const lineIds: string[] = body.lineIds ?? [];
  const action = body.action as string;

  if (!lineIds.length) {
    return NextResponse.json({ error: "lineIds required" }, { status: 400 });
  }

  const where =
    session.role === PanelRole.ADMIN
      ? { id: { in: lineIds } }
      : { id: { in: lineIds }, ownerId: session.id };

  let affected = 0;

  switch (action) {
    case "enable":
      affected = (
        await prisma.line.updateMany({
          where,
          data: { status: LineStatus.ACTIVE },
        })
      ).count;
      break;
    case "disable":
      affected = (
        await prisma.line.updateMany({
          where,
          data: { status: LineStatus.DISABLED },
        })
      ).count;
      break;
    case "ban":
      affected = (
        await prisma.line.updateMany({
          where,
          data: { status: LineStatus.BANNED },
        })
      ).count;
      break;
    case "extend": {
      const days = Number(body.days ?? 30);
      if (!Number.isFinite(days) || days <= 0) {
        return NextResponse.json({ error: "days must be positive" }, { status: 400 });
      }
      const lines = await prisma.line.findMany({
        where,
        select: { id: true, username: true },
      });

      const { chargeLineRenewCredits } = await import("@/lib/line-renew-credits");
      const { sessionPaysLineCredits } = await import("@/lib/reseller-credit-charge");
      const paysCredits = sessionPaysLineCredits(session.role);
      let perLineCost = 0;
      if (paysCredits) {
        const { resolveLineCreateFromPackage } = await import("@/lib/package-line");
        const resolved = await resolveLineCreateFromPackage(
          {
            packageId: body.packageId ? String(body.packageId) : undefined,
            days,
          },
          { sellerId: session.id }
        );
        perLineCost = resolved.creditCost;
      }

      try {
        if (paysCredits && perLineCost > 0) {
          await prisma.$transaction(async (tx) => {
            for (const line of lines) {
              await chargeLineRenewCredits(tx, session, {
                days,
                packageId: body.packageId ? String(body.packageId) : undefined,
                lineUsername: line.username,
              });
            }
          });
        }
        for (const line of lines) {
          await applyLineRenewDays(line.id, days, {
            reactivate: body.reactivate !== false,
          });
        }
        if (body.packageId) {
          const pkgId = String(body.packageId);
          const pkg = await prisma.package.findUnique({ where: { id: pkgId }, select: { id: true } });
          if (pkg) {
            await prisma.line.updateMany({
              where,
              data: { packageId: pkg.id },
            });
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg === "Insufficient credits" || msg === "Forbidden") {
          return NextResponse.json({ error: msg }, { status: 400 });
        }
        throw e;
      }
      affected = lines.length;
      break;
    }
    case "set_bouquets": {
      const bouquetIds: string[] = body.bouquetIds ?? [];
      const validLineIds = lineIds.filter(Boolean);
      if (validLineIds.length > 0 && bouquetIds.length > 0) {
        await prisma.$transaction([
          prisma.lineBouquet.deleteMany({ where: { lineId: { in: validLineIds } } }),
          prisma.lineBouquet.createMany({
            data: validLineIds.flatMap((lineId) =>
              bouquetIds.map((bouquetId) => ({ lineId, bouquetId }))
            ),
          }),
        ]);
        affected = validLineIds.length;
      }
      await invalidateXtreamCategories();
      break;
    }
    case "delete":
      affected = (await prisma.line.deleteMany({ where })).count;
      break;
    case "mass_edit": {
      const patch = (body.patch ?? {}) as MassEditPatch;
      if (session.role !== PanelRole.ADMIN) {
        delete patch.ownerId;
      }
      const data = applyMassEditPatch(patch);
      const hasResellerNotes = patch.resellerNotes && !patch.resellerNotes.unchanged;
      const staticKeys = Object.keys(data).filter((k) => k !== "notes");
      if (!staticKeys.length && !hasResellerNotes) {
        return NextResponse.json({ error: "No fields to update" }, { status: 400 });
      }

      const lines = await prisma.line.findMany({ where });

      if (Object.prototype.hasOwnProperty.call(data, "ownerId")) {
        const destId = data.ownerId;
        if (destId) {
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
              { error: "Destination must be a reseller or sub-reseller" },
              { status: 400 }
            );
          }
          if (!dest.isActive) {
            return NextResponse.json({ error: "Destination reseller is inactive" }, { status: 400 });
          }
          const incoming = lines.filter((l) => l.ownerId !== destId).length;
          if (dest.maxLines > 0 && dest._count.lines + incoming > dest.maxLines) {
            return NextResponse.json(
              {
                error: `Destination line limit is ${dest.maxLines}; moving ${incoming} more would exceed it.`,
              },
              { status: 400 }
            );
          }
        }
      }

      for (const line of lines) {
        const rowData = { ...data };
        if (hasResellerNotes && patch.resellerNotes && !patch.resellerNotes.unchanged) {
          rowData.notes = mergeResellerNotes(line.notes, patch.resellerNotes.value);
        }
        if (!Object.keys(rowData).length) continue;
        await prisma.line.update({ where: { id: line.id }, data: rowData });
        affected++;
      }
      break;
    }
    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  await logActivity(`mass_${action}`, {
    userId: session.id,
    meta: { lineIds, affected },
  });

  return NextResponse.json({ ok: true, affected });
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}
