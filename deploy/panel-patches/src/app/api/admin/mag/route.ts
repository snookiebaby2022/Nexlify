import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { normalizeMac } from "@/lib/mag";
import { createLineForDevice } from "@/lib/device-line-create";
import { logActivity } from "@/lib/lines";
import { assertMagDeviceAccess } from "@/lib/device-access";
import { PanelRole } from "@prisma/client";

const ROLES = [PanelRole.ADMIN, PanelRole.RESELLER, PanelRole.SUB_RESELLER] as const;

export async function GET() {
  const session = await requireSession([...ROLES]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const lineFilter =
    session.role === PanelRole.ADMIN
      ? {}
      : { line: { ownerId: session.id } };

  const devices = await prisma.magDevice.findMany({
    where: lineFilter,
    include: { line: { select: { username: true, id: true } } },
    orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
  });
  return NextResponse.json({ devices });
}

export async function POST(req: NextRequest) {
  const session = await requireSession([...ROLES]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const mac = normalizeMac(String(body.mac ?? ""));
  if (!mac || mac.replace(/[^A-F0-9]/gi, "").length !== 12) {
    return NextResponse.json({ error: "Valid MAC address required" }, { status: 400 });
  }

  const existing = await prisma.magDevice.findUnique({ where: { mac } });
  if (existing) {
    return NextResponse.json({ error: "MAC already registered" }, { status: 409 });
  }

  let lineId = String(body.lineId ?? "").trim();
  const packageId = body.packageId ? String(body.packageId) : "";

  if (!lineId) {
    try {
      const line = await createLineForDevice({
        session,
        mac,
        deviceKind: "mag",
        packageId: packageId || undefined,
        ownerId: body.ownerId ? String(body.ownerId) : undefined,
      });
      lineId = line.id;
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Could not create line" },
        { status: 400 }
      );
    }
  }

  const device = await prisma.magDevice.create({
    data: { mac, lineId },
    include: { line: true },
  });

  await logActivity("mag_device_added", {
    userId: session.id,
    lineId,
    entity: "mag",
    entityId: device.id,
    meta: { mac, packageId: packageId || null },
  });

  return NextResponse.json({ device });
}

export async function PATCH(req: NextRequest) {
  const session = await requireSession([...ROLES]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const id = String(body.id ?? "");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  try {
    await assertMagDeviceAccess(session, id);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Forbidden";
    return NextResponse.json({ error: message }, { status: 403 });
  }

  const data: { mac?: string; lineId?: string; model?: string | null; isActive?: boolean } = {};
  if (body.mac != null) data.mac = normalizeMac(String(body.mac));
  if (body.lineId != null) data.lineId = String(body.lineId);
  if (body.model !== undefined) data.model = body.model ? String(body.model) : null;
  if (body.isActive != null) data.isActive = Boolean(body.isActive);

  const device = await prisma.magDevice.update({
    where: { id },
    data,
    include: { line: { select: { username: true, id: true } } },
  });
  return NextResponse.json({ device });
}

export async function DELETE(req: NextRequest) {
  const session = await requireSession([...ROLES]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  try {
    await assertMagDeviceAccess(session, id);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Forbidden";
    return NextResponse.json({ error: message }, { status: 403 });
  }

  await prisma.magDevice.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
