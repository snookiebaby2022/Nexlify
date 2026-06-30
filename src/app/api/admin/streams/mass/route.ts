import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/lines";
import { PanelRole } from "@prisma/client";

function parseSpeedInput(v: unknown): number | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.round(n);
}

export async function POST(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const ids: string[] = body.ids ?? [];
  if (!ids.length) return NextResponse.json({ error: "ids required" }, { status: 400 });

  const action = body.action as string;

  if (action === "enable") {
    await prisma.stream.updateMany({ where: { id: { in: ids } }, data: { isActive: true } });
  } else if (action === "disable") {
    await prisma.stream.updateMany({ where: { id: { in: ids } }, data: { isActive: false } });
  } else if (action === "delete") {
    await prisma.stream.deleteMany({ where: { id: { in: ids } } });
  } else if (action === "setCategory" && body.categoryId !== undefined) {
    await prisma.stream.updateMany({
      where: { id: { in: ids } },
      data: { categoryId: body.categoryId || null },
    });
  } else if (action === "setServer" && body.serverId !== undefined) {
    await prisma.stream.updateMany({
      where: { id: { in: ids } },
      data: { serverId: body.serverId || null },
    });
  } else if (action === "setVodMode" && body.vodMode !== undefined) {
    const mode = String(body.vodMode);
    if (!["LIVE", "ON_DEMAND", "CATCHUP"].includes(mode)) {
      return NextResponse.json({ error: "Invalid vodMode" }, { status: 400 });
    }
    await prisma.stream.updateMany({
      where: { id: { in: ids } },
      data: {
        vodMode: mode as "LIVE" | "ON_DEMAND" | "CATCHUP",
        isOnDemand: mode !== "LIVE",
        archiveDays:
          body.archiveDays !== undefined && body.archiveDays !== ""
            ? Number(body.archiveDays)
            : undefined,
      },
    });
  } else if (action === "setSpeed") {
    const minSpeedKbps = parseSpeedInput(body.minSpeedKbps);
    const maxSpeedKbps = parseSpeedInput(body.maxSpeedKbps);
    if (minSpeedKbps === undefined && maxSpeedKbps === undefined) {
      return NextResponse.json({ error: "Provide min and/or max speed (Kbps)" }, { status: 400 });
    }
    if (
      minSpeedKbps != null &&
      maxSpeedKbps != null &&
      minSpeedKbps > maxSpeedKbps
    ) {
      return NextResponse.json(
        { error: "Min speed cannot be greater than max speed" },
        { status: 400 }
      );
    }
    const data: { minSpeedKbps?: number | null; maxSpeedKbps?: number | null } = {};
    if (minSpeedKbps !== undefined) data.minSpeedKbps = minSpeedKbps;
    if (maxSpeedKbps !== undefined) data.maxSpeedKbps = maxSpeedKbps;

    const existing = await prisma.stream.findMany({
      where: { id: { in: ids } },
      select: { minSpeedKbps: true, maxSpeedKbps: true },
    });
    for (const row of existing) {
      const nextMin = data.minSpeedKbps !== undefined ? data.minSpeedKbps : row.minSpeedKbps;
      const nextMax = data.maxSpeedKbps !== undefined ? data.maxSpeedKbps : row.maxSpeedKbps;
      if (nextMin != null && nextMax != null && nextMin > nextMax) {
        return NextResponse.json(
          { error: "Min speed cannot be greater than max speed for selected streams" },
          { status: 400 }
        );
      }
    }

    await prisma.stream.updateMany({ where: { id: { in: ids } }, data });
    await logActivity("mass_streams", {
      userId: session.id,
      entity: "stream",
      meta: { action: "setSpeed", count: ids.length, minSpeedKbps, maxSpeedKbps },
    });
  } else if (action === "setBackupUrl") {
    const backupUrl =
      body.backupUrl === null || body.backupUrl === ""
        ? null
        : String(body.backupUrl).trim() || null;
    await prisma.stream.updateMany({
      where: { id: { in: ids } },
      data: { backupUrl },
    });
  } else if (action === "clearBackupUrl") {
    await prisma.stream.updateMany({
      where: { id: { in: ids } },
      data: { backupUrl: null },
    });
  } else {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  if (action !== "setSpeed") {
    await logActivity("mass_streams", {
      userId: session.id,
      entity: "stream",
      meta: { action, count: ids.length },
    });
  }

  return NextResponse.json({ ok: true, count: ids.length });
}
