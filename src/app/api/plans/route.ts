import { NextResponse } from "next/server";
import { FALLBACK_PLANS } from "@/lib/plans";

export async function GET() {
  try {
    const { prisma } = await import("@/lib/prisma");
    const plans = await prisma.plan.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true, name: true, slug: true, description: true,
        priceCents: true, durationDays: true, maxLines: true,
      },
    });
    if (plans && plans.length > 0) {
      return NextResponse.json({ plans });
    }
  } catch {
    // prisma not available — fall through to fallback
  }
  return NextResponse.json({ plans: FALLBACK_PLANS });
}
