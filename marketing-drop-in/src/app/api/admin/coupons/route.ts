import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

async function requireAdmin() {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") return null;
  return user;
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const coupons = await prisma.coupon.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
  return NextResponse.json({
    coupons: coupons.map((c) => ({
      ...c,
      expiresAt: c.expiresAt?.toISOString() ?? null,
      createdAt: c.createdAt.toISOString(),
    })),
  });
}

const createSchema = z.object({
  code: z.string().min(2).max(40),
  percentOff: z.number().int().min(1).max(100).optional(),
  amountOffCents: z.number().int().min(1).optional(),
  maxUses: z.number().int().min(1).optional(),
  expiresAt: z.string().optional(),
  note: z.string().max(400).optional(),
});

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const body = createSchema.parse(await request.json());
    if (!body.percentOff && !body.amountOffCents) {
      return NextResponse.json({ error: "Set percent off or amount off" }, { status: 400 });
    }
    const coupon = await prisma.coupon.create({
      data: {
        code: body.code.trim().toUpperCase(),
        percentOff: body.percentOff ?? null,
        amountOffCents: body.amountOffCents ?? null,
        maxUses: body.maxUses ?? null,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
        note: body.note?.trim() || null,
        createdById: admin.id,
      },
    });
    await logAudit({
      userId: admin.id,
      email: admin.email,
      action: "coupon_create",
      detail: coupon.code,
    });
    return NextResponse.json({ coupon });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Could not create coupon" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = (await request.json()) as { id?: string; active?: boolean };
  const id = String(body.id ?? "").trim();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const coupon = await prisma.coupon.update({
    where: { id },
    data: { active: body.active === true },
  });
  return NextResponse.json({ coupon });
}

export async function DELETE(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = (await request.json()) as { id?: string };
  const id = String(body.id ?? "").trim();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await prisma.coupon.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
