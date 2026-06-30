import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";

export async function GET(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = req.nextUrl;
  const isActive = searchParams.get("isActive");
  const isDefault = searchParams.get("isDefault");

  const where: Record<string, unknown> = {};
  if (isActive !== null) where.isActive = isActive === "true";
  if (isDefault !== null) where.isDefault = isDefault === "true";

  const policies = await prisma.appsLockPolicy.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ policies });
}

export async function POST(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const name = String(body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });

  const isDefault = Boolean(body.isDefault);
  if (isDefault) {
    await prisma.appsLockPolicy.updateMany({
      where: { isDefault: true },
      data: { isDefault: false },
    });
  }

  const policy = await prisma.appsLockPolicy.create({
    data: {
      name,
      allowedApps: Array.isArray(body.allowedApps) ? body.allowedApps.map(String) : [],
      blockedApps: Array.isArray(body.blockedApps) ? body.blockedApps.map(String) : [],
      allowedAppTypes: Array.isArray(body.allowedAppTypes) ? body.allowedAppTypes.map(String) : [],
      isDefault,
      isActive: true,
    },
  });

  return NextResponse.json({ policy });
}

export async function PATCH(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const body = await req.json();
  const data: Record<string, unknown> = {};

  if (body.name !== undefined) data.name = String(body.name);
  if (body.allowedApps !== undefined)
    data.allowedApps = Array.isArray(body.allowedApps) ? body.allowedApps.map(String) : [];
  if (body.blockedApps !== undefined)
    data.blockedApps = Array.isArray(body.blockedApps) ? body.blockedApps.map(String) : [];
  if (body.allowedAppTypes !== undefined)
    data.allowedAppTypes = Array.isArray(body.allowedAppTypes) ? body.allowedAppTypes.map(String) : [];
  if (body.isActive !== undefined) data.isActive = Boolean(body.isActive);

  const isDefault = body.isDefault !== undefined ? Boolean(body.isDefault) : undefined;
  if (isDefault !== undefined) {
    data.isDefault = isDefault;
    if (isDefault) {
      await prisma.appsLockPolicy.updateMany({
        where: { isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
    }
  }

  const policy = await prisma.appsLockPolicy.update({
    where: { id },
    data,
  });

  return NextResponse.json({ policy });
}

export async function DELETE(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const existing = await prisma.appsLockPolicy.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.isDefault) {
    return NextResponse.json({ error: "Cannot delete the default policy" }, { status: 400 });
  }

  await prisma.appsLockPolicy.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
