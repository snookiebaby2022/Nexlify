import { NextRequest, NextResponse } from "next/server";
import { getAllowedPanelHosts, getPanelDomainsSettings } from "@/lib/domains";
import { getSettingGroup } from "@/lib/panel-settings";

/** Runtime config for Edge middleware (cannot use Prisma in middleware). */
export async function GET(req: NextRequest) {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || req.headers.get("x-real-ip") || "127.0.0.1";
  if (ip !== "127.0.0.1" && ip !== "::1") {
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
