import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole, LineStatus } from "@prisma/client";

const VALID_AUTO_ACTIONS = ["BAN_LINE", "DISABLE_LINE", "NOTIFY_ADMIN", "NOTIFY_RESELLER", "LOG_ONLY"];

export async function GET(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const ip = req.nextUrl.searchParams.get("ip");
    const lineId = req.nextUrl.searchParams.get("lineId");
    const actionTaken = req.nextUrl.searchParams.get("actionTaken");

    const where: {
      ip?: string;
      lineId?: string;
      actionTaken?: boolean;
    } = {};

    if (ip) where.ip = ip;
    if (lineId) where.lineId = lineId;
    if (actionTaken === "1" || actionTaken === "true") where.actionTaken = true;
    if (actionTaken === "0" || actionTaken === "false") where.actionTaken = false;

    const detections = await prisma.sameIpDetection.findMany({
      where,
      include: {
        line: { select: { id: true, username: true, status: true } },
      },
      orderBy: { detectedAt: "desc" },
    });

    return NextResponse.json({ detections });
  } catch (e) {
    console.error("[same-ip-detection GET]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to fetch detections" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const body = await req.json();
    const lineId = String(body.lineId ?? "").trim();
    const ip = String(body.ip ?? "").trim();
    const autoAction = String(body.autoAction ?? "LOG_ONLY").toUpperCase();

    if (!lineId || !ip) {
      return NextResponse.json(
        { error: "lineId and ip are required" },
        { status: 400 }
      );
    }

    if (!VALID_AUTO_ACTIONS.includes(autoAction)) {
      return NextResponse.json(
        { error: `Invalid autoAction. Valid: ${VALID_AUTO_ACTIONS.join(", ")}` },
        { status: 400 }
      );
    }

    let actionTaken = false;

    if (autoAction === "BAN_LINE" || autoAction === "DISABLE_LINE") {
      const newStatus = autoAction === "BAN_LINE" ? LineStatus.BANNED : LineStatus.DISABLED;
      await prisma.line.update({
        where: { id: lineId },
        data: { status: newStatus },
      });
      actionTaken = true;
    }

    if (autoAction === "NOTIFY_ADMIN" || autoAction === "NOTIFY_RESELLER") {
      actionTaken = true;
    }

    const detection = await prisma.sameIpDetection.create({
      data: {
        lineId,
        ip,
        concurrentLines: Number(body.concurrentLines ?? 1) || 1,
        autoAction,
        actionTaken,
        notes: body.notes ? String(body.notes) : null,
      },
      include: {
        line: { select: { id: true, username: true, status: true } },
      },
    });

    return NextResponse.json({ detection, autoActionExecuted: actionTaken });
  } catch (e) {
    console.error("[same-ip-detection POST]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to create detection" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const body = await req.json();
    const id = String(body.id ?? "").trim();
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const updateData: {
      actionTaken?: boolean;
      resolvedAt?: Date;
      notes?: string;
    } = {};

    if (body.actionTaken !== undefined) {
      updateData.actionTaken = Boolean(body.actionTaken);
    }

    if (body.resolved === true || body.actionTaken === true) {
      updateData.resolvedAt = new Date();
    }

    if (body.notes !== undefined) {
      updateData.notes = String(body.notes);
    }

    const updated = await prisma.sameIpDetection.update({
      where: { id },
      data: updateData,
      include: {
        line: { select: { id: true, username: true, status: true } },
      },
    });

    return NextResponse.json({ detection: updated });
  } catch (e) {
    console.error("[same-ip-detection PATCH]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to update detection" },
      { status: 500 }
    );
  }
}
