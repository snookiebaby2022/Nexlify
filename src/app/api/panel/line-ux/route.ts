import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { iptvTrialLinesDisabled } from "@/lib/iptv-trial-lines";
import { PanelRole } from "@prisma/client";

/** Line create/edit UX flags readable by admin and resellers. */
export async function GET() {
  const session = await requireSession([
    PanelRole.ADMIN,
    PanelRole.RESELLER,
    PanelRole.SUB_RESELLER,
  ]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const disabled = await iptvTrialLinesDisabled();
  return NextResponse.json({ allowTrials: !disabled });
}
