import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { logActivity } from "@/lib/lines";
import {
  getPanelDomainsSettings,
  isValidPanelDomain,
  normalizeDomain,
  savePanelDomainsSettings,
  sanitizeDomainList,
} from "@/lib/domains";
import { PanelRole } from "@prisma/client";

export async function GET() {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const settings = await getPanelDomainsSettings();
  return NextResponse.json({ settings });
}

export async function PATCH(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const patch: Record<string, unknown> = {};

  if (body.primaryDomain != null) {
    const primaryDomain = normalizeDomain(String(body.primaryDomain));
    if (primaryDomain && !isValidPanelDomain(primaryDomain)) {
      return NextResponse.json({ error: "Invalid primary domain" }, { status: 400 });
    }
    patch.primaryDomain = primaryDomain;
  }
  if (body.extraDomains != null) {
    const primary =
      body.primaryDomain != null
        ? normalizeDomain(String(body.primaryDomain))
        : (await getPanelDomainsSettings()).primaryDomain;
    patch.extraDomains = sanitizeDomainList(body.extraDomains, primary);
  }
  if (body.sslEnabled != null) patch.sslEnabled = Boolean(body.sslEnabled);
  if (body.forceHttps != null) patch.forceHttps = Boolean(body.forceHttps);
  if (body.certbotEmail != null) patch.certbotEmail = String(body.certbotEmail).trim();
  if (body.certFullChainPath != null) patch.certFullChainPath = String(body.certFullChainPath).trim();
  if (body.certKeyPath != null) patch.certKeyPath = String(body.certKeyPath).trim();

  try {
    const settings = await savePanelDomainsSettings(patch);
    await logActivity("domains_update", {
      userId: session.id,
      entity: "settings",
      entityId: "domains",
      meta: {
        primaryDomain: settings.primaryDomain,
        extraCount: settings.extraDomains.length,
        sslEnabled: settings.sslEnabled,
        forceHttps: settings.forceHttps,
      },
    });
    return NextResponse.json({
      settings,
      envHint:
        "Saved domains apply immediately for login. Also set PANEL_PRIMARY_DOMAIN and PANEL_EXTRA_DOMAINS in .env and restart PM2 so env matches after reboot.",
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Save failed" },
      { status: 400 }
    );
  }
}
