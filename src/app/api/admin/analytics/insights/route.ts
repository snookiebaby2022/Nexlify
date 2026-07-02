import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { PanelRole } from "@prisma/client";
import { generateAnalyticsInsights, predictPeakConcurrency } from "@/lib/analytics-insights";
import { pluginEntitlementResponse } from "@/lib/plugin-entitlement";

export async function GET(req: Request) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const host = new URL(req.url).hostname;
  const denied = await pluginEntitlementResponse("analytics_ai", host);
  if (denied) return denied;

  const [insights, peakHours] = await Promise.all([
    generateAnalyticsInsights(),
    predictPeakConcurrency(),
  ]);

  return NextResponse.json({ insights, peakHours });
}
