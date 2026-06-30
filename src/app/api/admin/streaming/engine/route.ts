import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { getStreamingEngineSnapshot } from "@/lib/streaming-engine";
import { PanelRole } from "@prisma/client";

export async function GET() {
  const session = await requireSession([PanelRole.ADMIN, PanelRole.RESELLER]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const snapshot = await getStreamingEngineSnapshot();
  return NextResponse.json(snapshot);
}
