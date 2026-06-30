import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";

export async function GET(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const service = req.nextUrl.searchParams.get("service");
  const licenses = await prisma.addonLicense.findMany({
    where: service ? { service } : undefined,
    orderBy: [{ expiresAt: "asc" }, { createdAt: "desc" }],
  });
  return NextResponse.json({ licenses });
}

export async function POST(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const action = body.action as string | undefined;

  if (action === "renew") {
    const id = String(body.id ?? "");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const license = await prisma.addonLicense.update({
      where: { id },
      data: {
        licenseKey: body.licenseKey ? String(body.licenseKey) : undefined,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
        label: body.label ? String(body.label) : undefined,
        notes: body.notes !== undefined ? String(body.notes || "") : undefined,
        isActive: true,
      },
    });
    return NextResponse.json({ license });
  }

  const license = await prisma.addonLicense.create({
    data: {
      service: String(body.service ?? "other"),
      label: String(body.label ?? "License"),
      licenseKey: body.licenseKey ? String(body.licenseKey) : null,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      notes: body.notes ? String(body.notes) : null,
      isActive: body.isActive !== false,
    },
  });
  return NextResponse.json({ license });
}

export async function DELETE(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await prisma.addonLicense.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
