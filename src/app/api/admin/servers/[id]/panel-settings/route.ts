import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole, Prisma } from "@prisma/client";
import {
  buildServerPanelSettingsJson,
  parseServerPanelSettings,
} from "@/lib/server-panel-settings";
import { guardAdminApiRequest } from "@/lib/admin-route-guard";
import { parseJsonBody, apiMutationErrorResponse } from "@/lib/parse-json-body";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await ctx.params;
  const server = await prisma.streamServer.findUnique({
    where: { id },
    select: { panelSettings: true },
  });
  if (!server) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ settings: parseServerPanelSettings(server.panelSettings) });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;
  try {
    const session = await requireSession([PanelRole.ADMIN]);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { id } = await ctx.params;
    const parsed = await parseJsonBody(req);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data as Record<string, unknown>;
    const server = await prisma.streamServer.findUnique({ where: { id } });
    if (!server) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const current = parseServerPanelSettings(server.panelSettings);
    const panelSettings = buildServerPanelSettingsJson(server.panelSettings, {
      network: { ...current.network, ...(body.network as object ?? {}) },
      performance: { ...current.performance, ...(body.performance as object ?? {}) },
      advanced: { ...current.advanced, ...(body.advanced as object ?? {}) },
      ssl: { ...current.ssl, ...(body.ssl as object ?? {}) },
    });
    await prisma.streamServer.update({
      where: { id },
      data: { panelSettings: panelSettings as Prisma.InputJsonValue },
    });
    return NextResponse.json({ ok: true, settings: parseServerPanelSettings(panelSettings) });
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}
