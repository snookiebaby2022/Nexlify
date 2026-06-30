import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { getStreamingHealthSnapshot } from "@/lib/streaming-health";
import { PanelRole } from "@prisma/client";

export async function GET() {
  const session = await requireSession([PanelRole.ADMIN, PanelRole.RESELLER]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const snapshot = await getStreamingHealthSnapshot();
  return NextResponse.json(snapshot);
}
