import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { issueLetsEncryptCertificate } from "@/lib/certbot-run";
import { parseServerPanelSettings, buildServerPanelSettingsJson } from "@/lib/server-panel-settings";
import { logActivity } from "@/lib/lines";
import { PanelRole, Prisma } from "@prisma/client";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await ctx.params;
  const body = await req.json();
  if (!body.agreeToTerms) {
    return NextResponse.json(
      { error: "You must agree to the Let's Encrypt terms of service." },
      { status: 400 }
    );
  }

  const server = await prisma.streamServer.findUnique({ where: { id } });
  if (!server) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const domain = String(server.domain ?? "").trim().toLowerCase();
  if (!domain) {
    return NextResponse.json(
      { error: "Set a domain on this server (Domains tab) before issuing a certificate." },
      { status: 400 }
    );
  }

  const parsed = parseServerPanelSettings(server.panelSettings);
  const email = String(body.email ?? parsed.ssl.certbotEmail).trim();
  if (!email) {
    return NextResponse.json({ error: "Certbot email is required." }, { status: 400 });
  }

  const result = await issueLetsEncryptCertificate([domain], email);
  const at = new Date().toISOString();

  const panelSettings = buildServerPanelSettingsJson(
    server.panelSettings,
    {
      network: parsed.network,
      performance: parsed.performance,
      advanced: parsed.advanced,
      ssl: { autoCertbot: true, certbotEmail: email },
    },
    null
  );
  const sslBlock = panelSettings.ssl as Record<string, unknown>;
  sslBlock.lastCertbotRun = { at, ok: result.ok, message: result.message, domain };

  await prisma.streamServer.update({
    where: { id },
    data: {
      protocol: result.ok ? "https" : server.protocol,
      panelSettings: panelSettings as Prisma.InputJsonValue,
    },
  });

  await logActivity(result.ok ? "ssl_cert_issued" : "ssl_cert_failed", {
    userId: session.id,
    entity: "server",
    entityId: id,
    meta: { domain, ok: result.ok, message: result.message },
  });

  return NextResponse.json({
    ok: result.ok,
    message: result.message,
    log: result.log,
  });
}
