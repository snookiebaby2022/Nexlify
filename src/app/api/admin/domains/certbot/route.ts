import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { issueLetsEncryptCertificate } from "@/lib/certbot-run";
import {
  certbotDomainArgs,
  getPanelDomainsSettings,
  savePanelDomainsSettings,
} from "@/lib/domains";
import { logActivity } from "@/lib/lines";
import { PanelRole } from "@prisma/client";

export async function POST(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  if (!body.agreeToTerms) {
    return NextResponse.json(
      { error: "You must agree to the Let's Encrypt terms of service." },
      { status: 400 }
    );
  }

  const settings = await getPanelDomainsSettings();
  const email = String(body.email ?? settings.certbotEmail).trim();
  const domains = certbotDomainArgs(settings);

  if (!domains.length) {
    return NextResponse.json(
      { error: "Configure a primary domain (and optional aliases) before issuing a certificate." },
      { status: 400 }
    );
  }

  const result = await issueLetsEncryptCertificate(domains, email);
  const at = new Date().toISOString();

  const updated = await savePanelDomainsSettings({
    certbotEmail: email,
    sslEnabled: result.ok ? true : settings.sslEnabled,
    certFullChainPath: result.certFullChainPath ?? settings.certFullChainPath,
    certKeyPath: result.certKeyPath ?? settings.certKeyPath,
    lastCertbotRun: {
      at,
      ok: result.ok,
      message: result.message,
      domains,
    },
  });

  await logActivity(result.ok ? "ssl_cert_issued" : "ssl_cert_failed", {
    userId: session.id,
    entity: "settings",
    entityId: "domains",
    meta: { domains, ok: result.ok, message: result.message },
  });

  return NextResponse.json({
    ok: result.ok,
    message: result.message,
    log: result.log,
    settings: updated,
  });
}
