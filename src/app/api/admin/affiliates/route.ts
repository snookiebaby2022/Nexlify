import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";
import crypto from "crypto";

import { parseJsonBody, apiMutationErrorResponse } from "@/lib/parse-json-body";
export async function GET() {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const affiliates = await prisma.affiliate.findMany({
    include: {
      user: { select: { id: true, username: true, email: true } },
      _count: { select: { referrals: true, commissions: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ affiliates });
}

export async function POST(req: NextRequest) {
  try {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = await parseJsonBody(req);

  if (!parsed.ok) return parsed.response;

  const body = parsed.data;

  const { userId, commissionRate } = body;

  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  // Check if user exists
  const user = await prisma.panelUser.findUnique({ where: { id: userId } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  // Check if already an affiliate
  const existing = await prisma.affiliate.findUnique({ where: { userId } });
  if (existing) return NextResponse.json({ error: "User is already an affiliate" }, { status: 400 });

  // Generate unique referral code
  const referralCode = `NXLF-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;

  const affiliate = await prisma.affiliate.create({
    data: {
      userId,
      referralCode,
      commissionRate: commissionRate ?? 0.1,
    },
    include: { user: { select: { username: true, email: true } } },
  });

  return NextResponse.json({ affiliate });
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}

export async function PATCH(req: NextRequest) {
  try {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = await parseJsonBody(req);

  if (!parsed.ok) return parsed.response;

  const body = parsed.data;

  const { id, commissionRate, isActive } = body;

  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const affiliate = await prisma.affiliate.update({
    where: { id },
    data: {
      ...(commissionRate !== undefined ? { commissionRate } : {}),
      ...(isActive !== undefined ? { isActive } : {}),
    },
  });

  return NextResponse.json({ affiliate });
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}
