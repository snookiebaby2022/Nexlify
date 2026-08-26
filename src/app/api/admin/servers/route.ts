import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { validateDnsRotator } from "@/lib/dns-rotator";
import { ensurePanelCategory } from "@/lib/ensure-panel-category";
import { STREAM_HTTP_PORT, STREAM_HTTPS_PORT, PANEL_HTTP_PORT } from "@/lib/server-ports";
import { PanelRole } from "@prisma/client";
import { assertCanCreateMainServer } from "@/lib/plan-limits";
import { sortServersMainFirst } from "@/lib/ensure-main-server-online";
import {
  isLocalPanelServer,
  serverPortProfile,
} from "@/lib/panel-local-server";
import { applyLocalServerPortProfile } from "@/lib/panel-port-sync";
import { syncStreamServerPublicHosts } from "@/lib/panel-public-hosts";
import { publicStreamServer } from "@/lib/server-public";
import { encodeSshPasswordOrThrow, serverGeoFields } from "@/lib/server-save-fields";

import { parseJsonBody, apiMutationErrorResponse } from "@/lib/parse-json-body";
import { guardAdminApiRequest } from "@/lib/admin-route-guard";
export async function GET(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (req.nextUrl.searchParams.get("lite") === "1") {
    const servers = await prisma.streamServer.findMany({
      select: { id: true, name: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    return NextResponse.json({ servers: sortServersMainFirst(servers) });
  }

  const servers = await prisma.streamServer.findMany({
    include: {
      proxy: true,
      _count: { select: { streams: true, lbSessions: true } },
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return NextResponse.json({ servers: sortServersMainFirst(servers).map(publicStreamServer) });
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

  if (body.dnsRotator) {
    const err = validateDnsRotator(body.dnsRotator);
    if (err) return NextResponse.json({ error: err }, { status: 400 });
  }
  const limitErr = await assertCanCreateMainServer();
  if (limitErr) return NextResponse.json({ error: limitErr }, { status: 403 });

  await ensurePanelCategory();

  const geo = await serverGeoFields(String(body.host ?? ""));
  let agentSshPasswordEnc: string | undefined;
  try {
    agentSshPasswordEnc = encodeSshPasswordOrThrow(body.agentSshPassword);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Cannot encrypt SSH password" },
      { status: 400 }
    );
  }

  const useSsh = body.agentUseSsh !== false;

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
      region: geo.region,
      countryCode: geo.countryCode,
      rtmpPort: body.rtmpPort != null ? Number(body.rtmpPort) : null,
      bandwidthMbps: body.bandwidthMbps != null ? Number(body.bandwidthMbps) : null,
      healthStatus: body.healthStatus ?? "unknown",
      healthMessage: body.healthMessage || null,
      dnsRotator: body.dnsRotator || null,
      agentSshHost: body.agentSshHost || body.host || null,
      agentSshPort: body.agentSshPort != null ? Number(body.agentSshPort) : 22,
      agentSshUser: body.agentSshUser || "root",
      agentSshPasswordEnc,
      agentUseSsh: useSsh,
      httpsPort: body.httpsPort != null ? Number(body.httpsPort) : STREAM_HTTPS_PORT,
      geoLbCountries: body.geoLbCountries ?? null,
      geoLbIsps: body.geoLbIsps ?? null,
      panelSettings: body.panelSettings ?? null,
    },
  });
  const { cacheDelExact } = await import("@/lib/cache");
  await Promise.all([cacheDelExact("stats:header"), cacheDelExact("stats:dashboard")]);

  let portSync: { ok: boolean; message: string; output: string } | undefined;
  if (isLocalPanelServer(server)) {
    portSync = await applyLocalServerPortProfile(serverPortProfile(server));
  }
  await syncStreamServerPublicHosts(server);

  return NextResponse.json({ server: publicStreamServer(server), portSync });
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

  await prisma.stream.updateMany({ where: { serverId: id }, data: { serverId: null } });
  await prisma.streamServer.delete({ where: { id } });
  const { cacheDelExact } = await import("@/lib/cache");
  await Promise.all([cacheDelExact("stats:header"), cacheDelExact("stats:dashboard")]);
  return NextResponse.json({ ok: true });
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
  if (body.dnsRotator) {
    const err = validateDnsRotator(body.dnsRotator);
    if (err) return NextResponse.json({ error: err }, { status: 400 });
  }

  const geo =
    body.host != null
      ? await serverGeoFields(String(body.host))
      : null;
  let agentSshPasswordEnc: string | undefined;
  try {
    agentSshPasswordEnc = encodeSshPasswordOrThrow(body.agentSshPassword);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Cannot encrypt SSH password" },
      { status: 400 }
    );
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
      ...(agentSshPasswordEnc ? { agentSshPasswordEnc } : {}),
      agentUseSsh: body.agentUseSsh !== undefined ? Boolean(body.agentUseSsh) : undefined,
      httpsPort: body.httpsPort != null ? Number(body.httpsPort) : undefined,
      geoLbCountries: body.geoLbCountries !== undefined ? body.geoLbCountries : undefined,
      geoLbIsps: body.geoLbIsps !== undefined ? body.geoLbIsps : undefined,
      panelSettings: body.panelSettings !== undefined ? body.panelSettings : undefined,
      ...(geo
        ? {
            countryCode: geo.countryCode,
            region: geo.region,
          }
        : {}),
    },
  });
  const { cacheDelExact } = await import("@/lib/cache");
  await Promise.all([cacheDelExact("stats:header"), cacheDelExact("stats:dashboard")]);

  let portSync: { ok: boolean; message: string; output: string } | undefined;
  let agentConfigQueued = false;

  if (isLocalPanelServer(server)) {
    portSync = await applyLocalServerPortProfile(serverPortProfile(server));
  } else {
    const { bumpConfigRevision } = await import("@/lib/stream-agent");
    await bumpConfigRevision(server.id);
    agentConfigQueued = true;
  }
  if (body.domain !== undefined || body.dnsRotator !== undefined) {
    await syncStreamServerPublicHosts(server);
  }

  return NextResponse.json({ server: publicStreamServer(server), portSync, agentConfigQueued });
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}
