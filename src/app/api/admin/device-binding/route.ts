import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole, DeviceBindingStatus } from "@prisma/client";

export async function GET(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const lineId = req.nextUrl.searchParams.get("lineId");
    const status = req.nextUrl.searchParams.get("status");
    const deviceId = req.nextUrl.searchParams.get("deviceId");

    const where: {
      lineId?: string;
      deviceId?: string;
      status?: DeviceBindingStatus;
    } = {};

    if (lineId) where.lineId = lineId;
    if (deviceId) where.deviceId = deviceId;
    if (status && Object.values(DeviceBindingStatus).includes(status as DeviceBindingStatus)) {
      where.status = status as DeviceBindingStatus;
    }

    const bindings = await prisma.deviceBinding.findMany({
      where,
      include: {
        line: { select: { id: true, username: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ bindings });
  } catch (e) {
    console.error("[device-binding GET]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to fetch bindings" },
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
    const deviceId = String(body.deviceId ?? "").trim();

    if (!lineId || !deviceId) {
      return NextResponse.json(
        { error: "lineId and deviceId are required" },
        { status: 400 }
      );
    }

    const existing = await prisma.deviceBinding.findUnique({
      where: { lineId_deviceId: { lineId, deviceId } },
    });

    if (existing) {
      const updated = await prisma.deviceBinding.update({
        where: { id: existing.id },
        data: {
          status: DeviceBindingStatus.ACTIVE,
          boundAt: existing.boundAt ?? new Date(),
          revokedAt: null,
          revokedReason: null,
          deviceName: body.deviceName ? String(body.deviceName) : existing.deviceName,
          deviceType: body.deviceType ? String(body.deviceType) : existing.deviceType,
          deviceModel: body.deviceModel ? String(body.deviceModel) : existing.deviceModel,
          fingerprint: body.fingerprint ? String(body.fingerprint) : existing.fingerprint,
          lastSeenAt: new Date(),
        },
        include: { line: { select: { id: true, username: true } } },
      });
      return NextResponse.json({ binding: updated, created: false });
    }

    const binding = await prisma.deviceBinding.create({
      data: {
        lineId,
        deviceId,
        deviceName: body.deviceName ? String(body.deviceName) : null,
        deviceType: body.deviceType ? String(body.deviceType) : null,
        deviceModel: body.deviceModel ? String(body.deviceModel) : null,
        appVersion: body.appVersion ? String(body.appVersion) : null,
        appPackage: body.appPackage ? String(body.appPackage) : null,
        ip: body.ip ? String(body.ip) : null,
        userAgent: body.userAgent ? String(body.userAgent) : null,
        fingerprint: body.fingerprint ? String(body.fingerprint) : null,
        status: DeviceBindingStatus.ACTIVE,
        boundAt: new Date(),
      },
      include: { line: { select: { id: true, username: true } } },
    });

    return NextResponse.json({ binding, created: true });
  } catch (e) {
    console.error("[device-binding POST]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to create binding" },
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

    const statusRaw = String(body.status ?? "").toUpperCase() as DeviceBindingStatus;
    if (!Object.values(DeviceBindingStatus).includes(statusRaw)) {
      return NextResponse.json(
        { error: `Invalid status. Valid: ${Object.values(DeviceBindingStatus).join(", ")}` },
        { status: 400 }
      );
    }

    const updateData: {
      status: DeviceBindingStatus;
      revokedAt?: Date | null;
      revokedReason?: string | null;
      boundAt?: Date;
      lastSeenAt?: Date;
    } = { status: statusRaw, lastSeenAt: new Date() };

    if (statusRaw === DeviceBindingStatus.REVOKED) {
      updateData.revokedAt = new Date();
      updateData.revokedReason = body.revokedReason ? String(body.revokedReason) : null;
    } else if (statusRaw === DeviceBindingStatus.ACTIVE) {
      updateData.revokedAt = null;
      updateData.revokedReason = null;
      updateData.boundAt = new Date();
    } else if (statusRaw === DeviceBindingStatus.EXPIRED) {
      updateData.revokedAt = new Date();
    }

    const updated = await prisma.deviceBinding.update({
      where: { id },
      data: updateData,
      include: { line: { select: { id: true, username: true } } },
    });

    return NextResponse.json({ binding: updated });
  } catch (e) {
    console.error("[device-binding PATCH]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to update binding" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    await prisma.deviceBinding.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[device-binding DELETE]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to delete binding" },
      { status: 500 }
    );
  }
}
