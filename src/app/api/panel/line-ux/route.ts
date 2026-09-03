import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { iptvTrialLinesDisabled } from "@/lib/iptv-trial-lines";
import { getSettingGroup } from "@/lib/panel-settings";
import { clampLineCredentialMinLength } from "@/lib/credential-generate";
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
  const security = await getSettingGroup("security");
  return NextResponse.json({
    allowTrials: !disabled,
    autoGenerateLineCredentials: security.autoGenerateLineCredentials !== false,
    credentialMinLength: clampLineCredentialMinLength(security.lineCredentialMinLength),
  });
}
