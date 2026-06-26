import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canonicalPanelUrl, getPanelDomainsSettings } from "@/lib/domains";
import { getPanelServerSettings } from "@/lib/panel-server";

/** Canonical panel URL for admin and reseller UIs (read-only). */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const settings = await getPanelDomainsSettings();
  const server = await getPanelServerSettings();
  const canonical = canonicalPanelUrl(settings, server.panelPort);
  const aliases = settings.extraDomains;

  return NextResponse.json({
    primaryDomain: settings.primaryDomain || null,
    canonicalUrl: canonical,
    aliases,
    sslEnabled: settings.sslEnabled,
    forceHttps: settings.forceHttps,
    panelPort: server.panelPort,
    adminPath: "/admin",
    resellerPath: "/reseller",
  });
}
