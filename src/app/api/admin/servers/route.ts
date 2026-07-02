import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { validateDnsRotator } from "@/lib/dns-rotator";
import { ensurePanelCategory } from "@/lib/ensure-panel-category";
import { STREAM_HTTP_PORT, STREAM_HTTPS_PORT, PANEL_HTTP_PORT } from "@/lib/server-ports";
import { PanelRole } from "@prisma/client";
import { assertCanCreateMainServer } from "@/lib/plan-limits";
import { ensureMainServerOnline } from "@/lib/ensure-main-server-online";
import {
  isLocalPanelServer,
  serverPortProfile,
} from "@/lib/panel-local-server";
import { applyLocalServerPortProfile } from "@/lib/panel-port-sync";

export async function GET() {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await ensureMainServerOnline();

  const servers = await prisma.streamServer.findMany({
    include: {
      proxy: true,
      _count: { select: { streams: true, lbSessions: true, healthChecks: true } },
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return NextResponse.json({ servers });
}

export async function POST(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  if (body.dnsRotator) {
    const err = validateDnsRotator(body.dnsRotator);
    if (err) return NextResponse.json({ error: err }, { status: 400 });
  }
  const limitErr = await assertCanCreateMainServer();
  if (limitErr) return NextResponse.json({ error: limitErr }, { status: 403 });

  await ensurePanelCategory();

  const server = await prisma.streamServer.create({
    data: {
      name: body.name,
      host: body.host,
      port: Number(body.port ?? STREAM_HTTP_PORT),
      protocol: body.protocol ?? "http",
      maxClients: Number(body.maxClients ?? 1000),
      isActive: body.isActive !== false,
      sortOrder: Number(body.sortOrder ?? 0),
      proxyId: body.proxyId || null,
      description: body.description || null,
      privateIp: body.privateIp || null,
      domain: body.domain || null,
      panelPort: Number(body.panelPort ?? PANEL_HTTP_PORT),
      timeshiftOnly: body.timeshiftOnly === true,
      region: null,
      rtmpPort: body.rtmpPort != null ? Number(body.rtmpPort) : null,
      bandwidthMbps: body.bandwidthMbps != null ? Number(body.bandwidthMbps) : null,
      healthStatus: body.healthStatus ?? "unknown",
      healthMessage: body.healthMessage || null,
      dnsRotator: body.dnsRotator || null,
      agentSshHost: body.agentSshHost || null,
      agentSshPort: body.agentSshPort != null ? Number(body.agentSshPort) : undefined,
      agentSshUser: body.agentSshUser || null,
      agentUseSsh: body.agentUseSsh === true,
      httpsPort: body.httpsPort != null ? Number(body.httpsPort) : STREAM_HTTPS_PORT,
      geoLbCountries: body.geoLbCountries ?? null,
      geoLbIsps: body.geoLbIsps ?? null,
      panelSettings: body.panelSettings ?? null,
    },
  });
  const { cacheDel } = await import("@/lib/cache");
  await cacheDel("stats");

  let portSync: { ok: boolean; message: string; output: string } | undefined;
  if (isLocalPanelServer(server)) {
    portSync = await applyLocalServerPortProfile(serverPortProfile(server));
  }

  return NextResponse.json({ server, portSync });
}

export async function DELETE(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await prisma.stream.updateMany({ where: { serverId: id }, data: { serverId: null } });
  await prisma.streamServer.delete({ where: { id } });
  const { cacheDel } = await import("@/lib/cache");
  await cacheDel("stats");
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const id = body.id as string;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  if (body.dnsRotator) {
    const err = validateDnsRotator(body.dnsRotator);
    if (err) return NextResponse.json({ error: err }, { status: 400 });
  }

  const server = await prisma.streamServer.update({
    where: { id },
    data: {
      name: body.name,
      host: body.host,
      port: body.port != null ? Number(body.port) : undefined,
      protocol: body.protocol,
      maxClients: body.maxClients != null ? Number(body.maxClients) : undefined,
      isActive: body.isActive,
      sortOrder: body.sortOrder != null ? Number(body.sortOrder) : undefined,
      proxyId: body.proxyId === undefined ? undefined : body.proxyId || null,
      description: body.description,
      privateIp: body.privateIp !== undefined ? body.privateIp || null : undefined,
      domain: body.domain !== undefined ? body.domain || null : undefined,
      panelPort: body.panelPort != null ? Number(body.panelPort) : undefined,
      timeshiftOnly: body.timeshiftOnly !== undefined ? Boolean(body.timeshiftOnly) : undefined,
      rtmpPort: body.rtmpPort != null ? Number(body.rtmpPort) : body.rtmpPort === null ? null : undefined,
      bandwidthMbps:
        body.bandwidthMbps != null ? Number(body.bandwidthMbps) : body.bandwidthMbps === null ? null : undefined,
      healthStatus: body.healthStatus,
      healthMessage: body.healthMessage,
      lastHealthAt: body.lastHealthAt ? new Date(body.lastHealthAt) : undefined,
      dnsRotator: body.dnsRotator !== undefined ? body.dnsRotator || null : undefined,
      agentSshHost: body.agentSshHost !== undefined ? body.agentSshHost || null : undefined,
      agentSshPort: body.agentSshPort != null ? Number(body.agentSshPort) : undefined,
      agentSshUser: body.agentSshUser !== undefined ? body.agentSshUser || null : undefined,
      agentUseSsh: body.agentUseSsh !== undefined ? Boolean(body.agentUseSsh) : undefined,
      httpsPort: body.httpsPort != null ? Number(body.httpsPort) : undefined,
      geoLbCountries: body.geoLbCountries !== undefined ? body.geoLbCountries : undefined,
      geoLbIsps: body.geoLbIsps !== undefined ? body.geoLbIsps : undefined,
      panelSettings: body.panelSettings !== undefined ? body.panelSettings : undefined,
    },
  });
  const { cacheDel } = await import("@/lib/cache");
  await cacheDel("stats");

  let portSync: { ok: boolean; message: string; output: string } | undefined;
  let agentConfigQueued = false;

  if (isLocalPanelServer(server)) {
    portSync = await applyLocalServerPortProfile(serverPortProfile(server));
  } else {
    const { bumpConfigRevision } = await import("@/lib/stream-agent");
    await bumpConfigRevision(server.id);
    agentConfigQueued = true;
  }

  return NextResponse.json({ server, portSync, agentConfigQueued });
}
