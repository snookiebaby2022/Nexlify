import { NextRequest, NextResponse } from "next/server";
import { getAllowedPanelHosts, getPanelDomainsSettings } from "@/lib/domains";
import { isAuthorizedInternalRequest } from "@/lib/internal-request";
import { getSettingGroup } from "@/lib/panel-settings";

/** Runtime config for Edge middleware (cannot use Prisma in middleware). */
export async function GET(req: NextRequest) {
  if (!isAuthorizedInternalRequest(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const settings = await getPanelDomainsSettings();
    const hosts = getAllowedPanelHosts(settings);
    const security = await getSettingGroup("security");
    return NextResponse.json({
      hosts,
      logoutOnIpChange: Boolean(security.logoutOnIpChange),
    });
  } catch {
    return NextResponse.json({ hosts: [], logoutOnIpChange: false });
  }
}
