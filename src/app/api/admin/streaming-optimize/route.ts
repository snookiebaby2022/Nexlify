import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { PanelRole } from "@prisma/client";
import { applyOptimizationProfile, getOptimizationStatus } from "@/lib/server-optimization";

export async function GET() {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const status = await getOptimizationStatus();
  return NextResponse.json(status);
}

export async function POST() {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const result = await applyOptimizationProfile({ pushAgents: true });
  return NextResponse.json({
    ok: true,
    message: `Optimized for ${result.profile.label}`,
    steps: result.steps,
    hardware: result.hardware,
    profile: {
      tier: result.profile.tier,
      label: result.profile.label,
      notes: result.profile.notes,
    },
  });
}
