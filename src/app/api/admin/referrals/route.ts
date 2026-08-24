import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";
import { guardAdminApiRequest } from "@/lib/admin-route-guard";

export async function GET(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const affiliateId = req.nextUrl.searchParams.get("affiliateId");

  const where = affiliateId ? { affiliateId } : {};

  const referrals = await prisma.referral.findMany({
    where,
    include: {
      referrer: { select: { id: true, username: true } },
      referred: { select: { id: true, username: true, email: true, createdAt: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return NextResponse.json({ referrals });
}
