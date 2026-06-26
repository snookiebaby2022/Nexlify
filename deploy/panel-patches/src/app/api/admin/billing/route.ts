import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";

export async function GET() {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const events = await prisma.billingEvent.findMany({
    take: 50,
    orderBy: { createdAt: "desc" },
    include: { line: { select: { username: true } } },
  });

  return NextResponse.json({
    webhookUrl: "/api/billing/webhook",
    events,
    secretConfigured: Boolean(process.env.BILLING_WEBHOOK_SECRET),
  });
}
