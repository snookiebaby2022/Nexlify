import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";

export async function GET() {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const coupons = await prisma.coupon.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json({ coupons });
}

export async function POST(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const code = String(body.code ?? "").trim().toUpperCase();
  if (!code) return NextResponse.json({ error: "code required" }, { status: 400 });

  const coupon = await prisma.coupon.create({
    data: {
      code,
      label: body.label ? String(body.label) : null,
      discountType: String(body.discountType ?? "percent"),
      discountValue: Number(body.discountValue ?? 0),
      maxUses: Number(body.maxUses ?? 0),
      minDays: body.minDays != null ? Number(body.minDays) : null,
      discountMonths: body.discountMonths != null ? Number(body.discountMonths) : null,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      isActive: body.isActive !== false,
      notes: body.notes ? String(body.notes) : null,
    },
  });
  return NextResponse.json({ coupon });
}

export async function PATCH(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const id = String(body.id ?? "");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const coupon = await prisma.coupon.update({
    where: { id },
    data: {
      label: body.label,
      discountType: body.discountType,
      discountValue: body.discountValue != null ? Number(body.discountValue) : undefined,
      maxUses: body.maxUses != null ? Number(body.maxUses) : undefined,
      minDays: body.minDays != null ? Number(body.minDays) : undefined,
      discountMonths:
        body.discountMonths != null ? Number(body.discountMonths) : undefined,
      expiresAt: body.expiresAt != null ? (body.expiresAt ? new Date(body.expiresAt) : null) : undefined,
      isActive: body.isActive,
      notes: body.notes,
    },
  });
  return NextResponse.json({ coupon });
}

export async function DELETE(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await prisma.coupon.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
