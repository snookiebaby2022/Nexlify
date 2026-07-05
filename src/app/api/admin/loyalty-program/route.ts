import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { PanelRole } from "@prisma/client";
import { getLoyaltyPoints, addLoyaltyPoints, awardBadge } from "@/lib/loyalty-program";

export async function GET() {
  const session = await requireSession([PanelRole.ADMIN, PanelRole.RESELLER]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  return NextResponse.json({ error: "Use POST" }, { status: 400 });
}

export async function POST(req: Request) {
  const session = await requireSession([PanelRole.ADMIN, PanelRole.RESELLER]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { action, lineId, points, badge } = await req.json();

  if (action === "get") {
    const result = await getLoyaltyPoints(lineId);
    return NextResponse.json(result);
  }

  if (action === "add") {
    const result = await addLoyaltyPoints(lineId, points);
    return NextResponse.json(result);
  }

  if (action === "badge") {
    await awardBadge(lineId, badge);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
