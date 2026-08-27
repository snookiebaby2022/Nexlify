import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { PanelRole } from "@prisma/client";
import { LINE_TEMPLATES } from "@/lib/line-templates";
import { iptvTrialLinesDisabled } from "@/lib/iptv-trial-lines";

export async function GET() {
  const session = await requireSession([
    PanelRole.ADMIN,
    PanelRole.RESELLER,
    PanelRole.SUB_RESELLER,
  ]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const hideTrials = await iptvTrialLinesDisabled();
  const templates = hideTrials ? LINE_TEMPLATES.filter((t) => !t.isTrial) : LINE_TEMPLATES;
  return NextResponse.json({ templates });
}
