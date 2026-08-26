import { NextRequest, NextResponse } from "next/server";
import { Prisma, PanelRole } from "@prisma/client";
import { requireSession } from "@/lib/auth";
import { detectServerHardware } from "@/lib/server-hardware";
import { isLocalPanelHost } from "@/lib/panel-local-server";
import { prisma } from "@/lib/prisma";
import { decryptAtRest } from "@/lib/encryption-at-rest";
import { withSshClient } from "@/lib/ssh-exec";
import { detectHardwareOverSsh } from "@/lib/ssh-remote-detect";
import {
  buildServerPanelSettingsJson,
  parseServerPanelSettings,
} from "@/lib/server-panel-settings";
import { parseJsonBody } from "@/lib/parse-json-body";
import { guardAdminApiRequest } from "@/lib/admin-route-guard";

export async function GET() {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    return NextResponse.json({ ok: true, source: "panel", ...detectServerHardware() });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Detect failed" },
      { status: 500 }
    );
  }
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

    const serverId = body.serverId ? String(body.serverId) : "";
    let host = String(body.host ?? body.agentSshHost ?? "").trim();
    let port = Number(body.port ?? body.agentSshPort ?? 22);
    let username = String(body.username ?? body.agentSshUser ?? "root").trim() || "root";
    let password = String(body.password ?? body.agentSshPassword ?? "");

    if (serverId) {
      const row = await prisma.streamServer.findUnique({
        where: { id: serverId },
        select: {
          host: true,
          agentSshHost: true,
          agentSshPort: true,
          agentSshUser: true,
          agentSshPasswordEnc: true,
          panelSettings: true,
        },
      });
      if (!row) return NextResponse.json({ error: "Server not found" }, { status: 404 });
      host = host || row.agentSshHost || row.host;
      if (!Number.isFinite(port) || port <= 0) port = row.agentSshPort ?? 22;
      username = username || row.agentSshUser || "root";
      if (!password && row.agentSshPasswordEnc) {
        try {
          password = decryptAtRest(row.agentSshPasswordEnc);
        } catch {
          return NextResponse.json(
            { error: "Stored SSH password could not be decrypted" },
            { status: 400 }
          );
        }
      }
    }

    if (!host || isLocalPanelHost(host)) {
      const hw = detectServerHardware();
      if (serverId) {
        await markDetected(serverId, hw);
      }
      return NextResponse.json({ ok: true, source: "panel", ...hw });
    }

    if (!password) {
      return NextResponse.json(
        {
          error:
            "SSH password is required to auto-detect a remote server. This button probes the VPS, not this panel.",
        },
        { status: 400 }
      );
    }

    const hw = await withSshClient({ host, port, username, password }, (client) =>
      detectHardwareOverSsh(client)
    );
    if (serverId) {
      await markDetected(serverId, hw);
    }
    return NextResponse.json({ ok: true, source: "ssh", ...hw });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Detect failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

async function markDetected(
  serverId: string,
  hw: ReturnType<typeof detectServerHardware>
) {
  const row = await prisma.streamServer.findUnique({
    where: { id: serverId },
    select: { panelSettings: true },
  });
  if (!row) return;
  const parsed = parseServerPanelSettings(row.panelSettings);
  const panelSettings = buildServerPanelSettingsJson(row.panelSettings, {
    network: {
      ...parsed.network,
      interfaceName: hw.primaryInterface || parsed.network.interfaceName,
      gateway: hw.gateway || parsed.network.gateway,
    },
    performance: {
      ...parsed.performance,
      cpuThreads: hw.cpuThreads || parsed.performance.cpuThreads,
      maxConnections: hw.suggestedMaxConnections || parsed.performance.maxConnections,
      ioReadMbps: hw.suggestedIoReadMbps || parsed.performance.ioReadMbps,
      ioWriteMbps: hw.suggestedIoWriteMbps || parsed.performance.ioWriteMbps,
      bufferSizeMb: hw.suggestedBufferMb || parsed.performance.bufferSizeMb,
    },
    advanced: parsed.advanced,
    ssl: parsed.ssl,
  }) as Prisma.InputJsonValue;

  await prisma.streamServer.update({
    where: { id: serverId },
    data: {
      healthStatus: "online",
      healthMessage: `SSH auto-detect (${hw.primaryInterface})`,
      lastHealthAt: new Date(),
      privateIp: hw.ipv4[0] || undefined,
      panelSettings,
    },
  });
}
