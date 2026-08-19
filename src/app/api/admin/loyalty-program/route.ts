import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { PanelRole } from "@prisma/client";
import { getLoyaltyPoints, addLoyaltyPoints, awardBadge } from "@/lib/loyalty-program";

import { parseJsonBody, apiMutationErrorResponse } from "@/lib/parse-json-body";
export async function GET() {
  const session = await requireSession([PanelRole.ADMIN, PanelRole.RESELLER]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  return NextResponse.json({ error: "Use POST" }, { status: 400 });
}

export async function POST(req: Request) {
  try {
  const session = await requireSession([PanelRole.ADMIN, PanelRole.RESELLER]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = await parseJsonBody(req);

  if (!parsed.ok) return parsed.response;

  const { action, lineId, points, badge } = parsed.data;

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
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}
