import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { PanelRole } from "@prisma/client";
import {
  getStreamQuality,
  updateStreamQuality,
  createQualityAlert,
  getQualityAlerts,
} from "@/lib/quality-monitoring";

export async function GET() {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const alerts = await getQualityAlerts();
  return NextResponse.json({ alerts });
}

export async function POST(req: Request) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { action, streamId, data, issue, severity } = await req.json();

  if (action === "get_quality") {
    const quality = await getStreamQuality(streamId);
    return NextResponse.json(quality);
  }

  if (action === "update_quality") {
    const quality = await updateStreamQuality(streamId, data);
    return NextResponse.json(quality);
  }

  if (action === "create_alert") {
    const alert = await createQualityAlert(streamId, issue, severity);
    return NextResponse.json(alert);
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
