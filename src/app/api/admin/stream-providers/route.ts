import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { LIVE_STALE_MS } from "@/lib/connections";
import {
  inferRemoteConnectionFromUrl,
  probeProviderAccountInfo,
  probeStreamProvider,
  validateProviderInput,
} from "@/lib/stream-provider-probe";
import { PanelRole, Prisma } from "@prisma/client";

import { parseJsonBody, apiMutationErrorResponse } from "@/lib/parse-json-body";
import { guardAdminApiRequest } from "@/lib/admin-route-guard";
function prismaError(e: unknown) {
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === "P2025") return { status: 404, error: "Provider not found" };
    if (e.code === "P2002") return { status: 409, error: "A provider with this name or URL already exists" };
  }
  console.error("[stream-providers]", e);
  return { status: 500, error: "Database error — try again" };
}

async function panelConnectionCounts(providerIds: string[]) {
  if (!providerIds.length) return new Map<string, number>();
  const staleBefore = new Date(Date.now() - LIVE_STALE_MS);
  const rows = await prisma.liveConnection.findMany({
    where: {
      lastSeenAt: { gte: staleBefore },
      stream: { providerId: { in: providerIds } },
    },
    select: {
      lineId: true,
      streamId: true,
      ip: true,
      stream: { select: { providerId: true } },
    },
  });
  const sessions = new Map<string, Set<string>>();
  for (const row of rows) {
    const pid = row.stream?.providerId;
    if (!pid) continue;
    const sessionKey = `${row.lineId}|${row.streamId ?? ""}|${row.ip ?? ""}`;
    let set = sessions.get(pid);
    if (!set) {
      set = new Set();
      sessions.set(pid, set);
    }
    set.add(sessionKey);
  }
  return new Map([...sessions.entries()].map(([id, set]) => [id, set.size]));
}

async function runProviderCheck(p: { baseUrl: string; apiKey: string | null }) {
  const [probe, remote, account] = await Promise.all([
    probeStreamProvider(p.baseUrl),
    Promise.resolve(inferRemoteConnectionFromUrl(p.baseUrl)),
    probeProviderAccountInfo(p.baseUrl, p.apiKey),
  ]);
  return { probe, remote, account };
}

function checkUpdateData(
  probe: Awaited<ReturnType<typeof probeStreamProvider>>,
  remote: ReturnType<typeof inferRemoteConnectionFromUrl>,
  account: Awaited<ReturnType<typeof probeProviderAccountInfo>>
) {
  return {
    status: probe.status,
    statusMessage: probe.message,
    lastCheckAt: new Date(),
    lastLatencyMs: probe.latencyMs ?? null,
    remoteHost: remote.remoteHost,
    remotePort: remote.remotePort,
    remoteProtocol: remote.remoteProtocol,
    remotePanelUrl: remote.remotePanelUrl,
    remoteExpiresAt: account.expiresAt,
    remoteMaxConnections: account.maxConnections,
    remoteUpstreamConnections: account.upstreamActiveConnections,
  };
}

export async function GET(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  const session = await requireSession([
    PanelRole.ADMIN,
    PanelRole.RESELLER,
    PanelRole.SUB_RESELLER,
  ]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const vodOnly = req.nextUrl.searchParams.get("vod") === "1";

  try {
    const providers = await prisma.streamProvider.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { streams: true, m3uSyncJobs: true } } },
    });
    const filtered = vodOnly
      ? providers.filter((p) => {
          const t = (p.providerType ?? "").toLowerCase();
          return t === "generic_url" || t === "file_host" || t === "xtream_vod" || !t;
        })
      : providers;
    const panelCounts = await panelConnectionCounts(filtered.map((p) => p.id));
    const enriched = filtered.map((p) => ({
      ...p,
      panelConnectionCount: panelCounts.get(p.id) ?? 0,
    }));
    return NextResponse.json({ providers: enriched, readOnly: session.role !== PanelRole.ADMIN });
  } catch (e) {
    const err = prismaError(e);
    return NextResponse.json({ error: err.error }, { status: err.status });
  }
}

export async function POST(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  try {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.check && body.id) {
    const id = String(body.id);
    try {
      const p = await prisma.streamProvider.findUnique({ where: { id } });
      if (!p) return NextResponse.json({ error: "Provider not found" }, { status: 404 });

      const { probe, remote, account } = await runProviderCheck(p);
      const updated = await prisma.streamProvider.update({
        where: { id: p.id },
        data: checkUpdateData(probe, remote, account),
      });
      const panelConnectionCount = (await panelConnectionCounts([p.id])).get(p.id) ?? 0;
      return NextResponse.json({ provider: { ...updated, panelConnectionCount }, probe, account });
    } catch (e) {
      const err = prismaError(e);
      return NextResponse.json({ error: err.error }, { status: err.status });
    }
  }

  const validated = validateProviderInput(body);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error, field: validated.field }, { status: 400 });
  }

  try {
    const { probe, remote, account } = await runProviderCheck({
      baseUrl: validated.data.baseUrl,
      apiKey: body.apiKey ? String(body.apiKey) : null,
    });
    const provider = await prisma.streamProvider.create({
      data: {
        name: validated.data.name,
        baseUrl: validated.data.baseUrl,
        apiKey: body.apiKey ? String(body.apiKey) : null,
        providerType: body.providerType ? String(body.providerType) : null,
        maxStreams: validated.data.maxStreams,
        notes: body.notes ? String(body.notes) : null,
        remoteUsername: body.remoteUsername ? String(body.remoteUsername).trim() : null,
        remotePassword: body.remotePassword ? String(body.remotePassword) : null,
        remoteNotes: body.remoteNotes ? String(body.remoteNotes) : null,
        ...checkUpdateData(probe, remote, account),
      },
    });
    return NextResponse.json({ provider, probe });
  } catch (e) {
    const err = prismaError(e);
    return NextResponse.json({ error: err.error }, { status: err.status });
  }
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

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const id = body.id as string;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const validated = validateProviderInput({
    name: body.name,
    baseUrl: body.baseUrl,
    maxStreams: body.maxStreams,
  });
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error, field: validated.field }, { status: 400 });
  }

  try {
    const existing = await prisma.streamProvider.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Provider not found" }, { status: 404 });

    const urlChanged = validated.data.baseUrl !== existing.baseUrl;
    let status = existing.status;
    let statusMessage = existing.statusMessage;
    let lastCheckAt = existing.lastCheckAt;
    let lastLatencyMs = existing.lastLatencyMs;

    const remote = inferRemoteConnectionFromUrl(validated.data.baseUrl);
    let account = {
      expiresAt: existing.remoteExpiresAt,
      maxConnections: existing.remoteMaxConnections,
      upstreamActiveConnections: existing.remoteUpstreamConnections,
    };
    if (urlChanged || body.recheck) {
      const checked = await runProviderCheck({
        baseUrl: validated.data.baseUrl,
        apiKey:
          body.apiKey === undefined
            ? existing.apiKey
            : body.apiKey
              ? String(body.apiKey)
              : null,
      });
      status = checked.probe.status;
      statusMessage = checked.probe.message;
      lastCheckAt = new Date();
      lastLatencyMs = checked.probe.latencyMs ?? null;
      account = checked.account;
    }

    const provider = await prisma.streamProvider.update({
      where: { id },
      data: {
        name: validated.data.name,
        baseUrl: validated.data.baseUrl,
        apiKey: body.apiKey === undefined ? undefined : body.apiKey ? String(body.apiKey) : null,
        isActive: body.isActive === undefined ? undefined : Boolean(body.isActive),
        providerType: body.providerType === undefined ? undefined : body.providerType ? String(body.providerType) : null,
        maxStreams: validated.data.maxStreams,
        notes: body.notes === undefined ? undefined : body.notes ? String(body.notes) : null,
        remotePanelUrl: urlChanged || body.recheck ? remote.remotePanelUrl : undefined,
        remoteHost: urlChanged || body.recheck ? remote.remoteHost : undefined,
        remotePort: urlChanged || body.recheck ? remote.remotePort : undefined,
        remoteProtocol: urlChanged || body.recheck ? remote.remoteProtocol : undefined,
        remoteExpiresAt: urlChanged || body.recheck ? account.expiresAt : undefined,
        remoteMaxConnections: urlChanged || body.recheck ? account.maxConnections : undefined,
        remoteUpstreamConnections:
          urlChanged || body.recheck ? account.upstreamActiveConnections : undefined,
        remoteUsername:
          body.remoteUsername === undefined
            ? undefined
            : body.remoteUsername
              ? String(body.remoteUsername).trim()
              : null,
        remotePassword:
          body.remotePassword === undefined
            ? undefined
            : body.remotePassword
              ? String(body.remotePassword)
              : null,
        remoteNotes:
          body.remoteNotes === undefined
            ? undefined
            : body.remoteNotes
              ? String(body.remoteNotes)
              : null,
        status,
        statusMessage,
        lastCheckAt,
        lastLatencyMs,
      },
    });
    return NextResponse.json({ provider });
  } catch (e) {
    const err = prismaError(e);
    return NextResponse.json({ error: err.error }, { status: err.status });
  }
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

  try {
    await prisma.streamProvider.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const err = prismaError(e);
    return NextResponse.json({ error: err.error }, { status: err.status });
  }
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}
