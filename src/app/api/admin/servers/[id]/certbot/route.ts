import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  getServerLetsEncryptCertStatus,
  issueServerLetsEncryptCertificate,
} from "@/lib/certbot-server-issue";
import { pickCertbotEmail } from "@/lib/certbot-run";
import {
  parseServerPanelSettings,
  buildServerPanelSettingsJson,
  mergeServerSslBlock,
} from "@/lib/server-panel-settings";
import { getPanelDomainsSettings } from "@/lib/domains";
import { logActivity } from "@/lib/lines";
import { PanelRole, Prisma } from "@prisma/client";

import { parseJsonBody, apiMutationErrorResponse } from "@/lib/parse-json-body";
import { guardAdminApiRequest } from "@/lib/admin-route-guard";
type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await ctx.params;
  const server = await prisma.streamServer.findUnique({ where: { id } });
  if (!server) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const domain = String(server.domain ?? "").trim().toLowerCase();
  if (!domain) {
    return NextResponse.json({
      domain: null,
      status: null,
      message: "Set a domain on this server to check Let's Encrypt certificate status.",
    });
  }

  const parsed = parseServerPanelSettings(server.panelSettings);
  const sslRaw = mergeServerSslBlock(server.panelSettings, parsed.ssl);
  const lastRun = sslRaw.lastCertbotRun ?? null;

  const status = await getServerLetsEncryptCertStatus(server, domain);
  return NextResponse.json({
    domain,
    status,
    lastCertbotRun: lastRun,
    autoCertbot: parsed.ssl.autoCertbot,
  });
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  try {
    const session = await requireSession([PanelRole.ADMIN]);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await ctx.params;
    const json = await parseJsonBody(req);
    if (!json.ok) return json.response;
    const body = json.data;

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
    const panelDomains = await getPanelDomainsSettings();
    const email = pickCertbotEmail(
      body.email as string | undefined,
      parsed.ssl.certbotEmail,
      panelDomains.certbotEmail
    );

    const result = await issueServerLetsEncryptCertificate(server, email || undefined);
    const at = new Date().toISOString();

    const panelSettings = buildServerPanelSettingsJson(
      server.panelSettings,
      {
        network: parsed.network,
        performance: parsed.performance,
        advanced: parsed.advanced,
        ssl: { autoCertbot: true, certbotEmail: "" },
      },
      null
    );
    const sslBlock = mergeServerSslBlock(server.panelSettings, {
      autoCertbot: true,
      certbotEmail: "",
    });
    sslBlock.lastCertbotRun = {
      at,
      ok: result.ok,
      message: result.message,
      domain,
      remote: Boolean(result.remote),
    };
    if (result.expiry?.expiresAt) {
      sslBlock.certExpiresAt = result.expiry.expiresAt;
      sslBlock.certDaysLeft = result.expiry.daysLeft;
    }
    panelSettings.ssl = sslBlock;

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
      meta: { domain, ok: result.ok, message: result.message, remote: result.remote },
    });

    return NextResponse.json({
      ok: result.ok,
      message: result.message,
      log: result.log,
      remote: result.remote,
      expiry: result.expiry,
    });
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}
