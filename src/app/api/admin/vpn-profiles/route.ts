import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";
import { parseJsonBody, apiMutationErrorResponse } from "@/lib/parse-json-body";
import { guardAdminApiRequest } from "@/lib/admin-route-guard";
import { sanitizeVpnInterfaceName } from "@/lib/outbound-egress";
import { applyVpnProfileToServer } from "@/lib/vpn-tunnel-apply";
import { pluginEntitlementResponse } from "@/lib/plugin-entitlement";

export async function GET(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const host = (req.headers.get("host") ?? "localhost").split(":")[0].toLowerCase();
  const denied = await pluginEntitlementResponse("proxy_plugins", host);
  if (denied) return denied;

  const profiles = await prisma.vpnProfile.findMany({
    include: { _count: { select: { servers: true } } },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({
    profiles: profiles.map((p) => ({
      ...p,
      configText: p.configText ? `[${p.configText.length} chars]` : "",
      hasConfig: Boolean(p.configText?.trim()),
    })),
  });
}

export async function POST(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  try {
    const session = await requireSession([PanelRole.ADMIN]);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const parsed = await parseJsonBody(req);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;

    const host = (req.headers.get("host") ?? "localhost").split(":")[0].toLowerCase();
    const denied = await pluginEntitlementResponse("proxy_plugins", host);
    if (denied) return denied;

    if (body.action === "apply") {
      const serverId = String(body.serverId || "");
      const vpnProfileId = String(body.vpnProfileId || body.id || "");
      if (!serverId || !vpnProfileId) {
        return NextResponse.json({ error: "serverId and vpnProfileId required" }, { status: 400 });
      }
      const result = await applyVpnProfileToServer(serverId, vpnProfileId, {
        dryRun: body.dryRun === true,
      });
      return NextResponse.json(result, { status: result.ok ? 200 : 502 });
    }

    const name = String(body.name || "").trim();
    const configText = String(body.configText || "").trim();
    if (!name || !configText) {
      return NextResponse.json({ error: "name and configText required" }, { status: 400 });
    }

    const profile = await prisma.vpnProfile.create({
      data: {
        name,
        kind: body.kind === "OPENVPN" ? "OPENVPN" : "WIREGUARD",
        configText,
        localHttpPort: Number(body.localHttpPort) || 18080,
        interfaceName: sanitizeVpnInterfaceName(body.interfaceName || "wg-nexlify0"),
        isActive: body.isActive !== false,
        notes: body.notes ? String(body.notes) : null,
      },
    });
    return NextResponse.json({
      profile: { ...profile, configText: `[${profile.configText.length} chars]`, hasConfig: true },
    });
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}

export async function PATCH(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  try {
    const session = await requireSession([PanelRole.ADMIN]);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const parsed = await parseJsonBody(req);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;
    const id = String(body.id || "");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = String(body.name);
    if (body.kind !== undefined) data.kind = body.kind === "OPENVPN" ? "OPENVPN" : "WIREGUARD";
    if (body.configText !== undefined && String(body.configText).trim()) {
      data.configText = String(body.configText);
    }
    if (body.localHttpPort !== undefined) data.localHttpPort = Number(body.localHttpPort) || 18080;
    if (body.interfaceName !== undefined) {
      data.interfaceName = sanitizeVpnInterfaceName(body.interfaceName);
    }
    if (body.isActive !== undefined) data.isActive = Boolean(body.isActive);
    if (body.notes !== undefined) data.notes = body.notes ? String(body.notes) : null;

    const profile = await prisma.vpnProfile.update({ where: { id }, data });
    return NextResponse.json({
      profile: { ...profile, configText: `[${profile.configText.length} chars]`, hasConfig: true },
    });
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}

export async function DELETE(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  try {
    const session = await requireSession([PanelRole.ADMIN]);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    await prisma.streamServer.updateMany({
      where: { vpnProfileId: id },
      data: { vpnProfileId: null, outboundMode: "NONE" },
    });
    await prisma.vpnProfile.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}
