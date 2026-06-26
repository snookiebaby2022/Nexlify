import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/lines";
import { mergeResellerNotes, type MassEditPatch } from "@/lib/lines-mass-edit";
import { LineStatus, PanelRole } from "@prisma/client";

function applyMassEditPatch(patch: MassEditPatch) {
  const data: {
    password?: string;
    notes?: string;
    status?: LineStatus;
    allowedCountries?: string | null;
    allowedIps?: string | null;
    allowedUserAgents?: string | null;
    disallowedUserAgents?: string | null;
    canWatchAdult?: boolean;
    allowedOutput?: string;
    lockToIp?: boolean;
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
    data.allowedUserAgents = patch.allowedUserAgents.value.trim() || null;
  }
  if (patch.disallowedUserAgents && !patch.disallowedUserAgents.unchanged) {
    data.disallowedUserAgents = patch.disallowedUserAgents.value.trim() || null;
  }
  if (patch.canWatchAdult === "yes") data.canWatchAdult = true;
  if (patch.canWatchAdult === "no") data.canWatchAdult = false;
  if (patch.allowedOutputs && !patch.allowedOutputs.unchanged && patch.allowedOutputs.value.trim()) {
    data.allowedOutput = patch.allowedOutputs.value.trim();
  }
  if (patch.lockToIp === "yes") data.lockToIp = true;
  if (patch.lockToIp === "no") data.lockToIp = false;

  return data;
}

export async function POST(req: NextRequest) {
  const session = await requireSession([
    PanelRole.ADMIN,
    PanelRole.RESELLER,
    PanelRole.SUB_RESELLER,
  ]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
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
      const lines = await prisma.line.findMany({ where });
      for (const line of lines) {
        const expiresAt = new Date(line.expiresAt > new Date() ? line.expiresAt : new Date());
        expiresAt.setDate(expiresAt.getDate() + days);
        await prisma.line.update({ where: { id: line.id }, data: { expiresAt } });
        affected++;
      }
      break;
    }
    case "set_bouquets": {
      const bouquetIds: string[] = body.bouquetIds ?? [];
      for (const lineId of lineIds) {
        const line = await prisma.line.findFirst({ where: { ...where, id: lineId } });
        if (!line) continue;
        await prisma.lineBouquet.deleteMany({ where: { lineId } });
        await prisma.lineBouquet.createMany({
          data: bouquetIds.map((bouquetId) => ({ lineId, bouquetId })),
        });
        affected++;
      }
      break;
    }
    case "delete":
      affected = (await prisma.line.deleteMany({ where })).count;
      break;
    case "mass_edit": {
      const patch = (body.patch ?? {}) as MassEditPatch;
      const data = applyMassEditPatch(patch);
      const hasResellerNotes = patch.resellerNotes && !patch.resellerNotes.unchanged;
      const staticKeys = Object.keys(data).filter((k) => k !== "notes");
      if (!staticKeys.length && !hasResellerNotes) {
        return NextResponse.json({ error: "No fields to update" }, { status: 400 });
      }

      const lines = await prisma.line.findMany({ where });
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
}
