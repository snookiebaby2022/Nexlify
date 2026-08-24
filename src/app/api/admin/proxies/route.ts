import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { invalidateEpgCache } from "@/lib/cache-invalidate";
import { PanelRole } from "@prisma/client";
import { assertCanCreateLoadBalancer } from "@/lib/plan-limits";
import { pluginEntitlementResponse } from "@/lib/plugin-entitlement";

import { parseJsonBody, apiMutationErrorResponse } from "@/lib/parse-json-body";
import { guardAdminApiRequest } from "@/lib/admin-route-guard";
export async function GET(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const host = (req.headers.get("host") ?? "localhost").split(":")[0].toLowerCase();
  const denied = await pluginEntitlementResponse("proxy_plugins", host);
  if (denied) return denied;

  const proxies = await prisma.streamProxy.findMany({
    include: { _count: { select: { servers: true } } },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ proxies });
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

  const limitErr = await assertCanCreateLoadBalancer();
  if (limitErr) return NextResponse.json({ error: limitErr }, { status: 403 });

  const proxy = await prisma.streamProxy.create({
    data: {
      name: body.name,
      host: body.host,
      port: Number(body.port),
      type: body.type ?? "HTTP",
      username: body.username || null,
      password: body.password || null,
      country: body.country || null,
      isActive: body.isActive !== false,
      isFreeTier: body.isFreeTier === true,
    },
  });
  await invalidateEpgCache();
  return NextResponse.json({ proxy });
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

  const id = body.id as string;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const proxy = await prisma.streamProxy.update({
    where: { id },
    data: {
      name: body.name,
      host: body.host,
      port: body.port != null ? Number(body.port) : undefined,
      type: body.type,
      username: body.username,
      password: body.password,
      country: body.country,
      isActive: body.isActive,
      isFreeTier: body.isFreeTier,
    },
  });
  await invalidateEpgCache();
  return NextResponse.json({ proxy });
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

  await prisma.streamServer.updateMany({ where: { proxyId: id }, data: { proxyId: null } });
  await prisma.streamProxy.delete({ where: { id } });
  await invalidateEpgCache();
  return NextResponse.json({ ok: true });
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}
