import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { STREAM_HTTP_PORT } from "@/lib/server-ports";
import { PanelRole } from "@prisma/client";

async function probeServer(host: string, port: number, protocol: string) {
  const proto = protocol === "https" ? "https" : "http";
  const url = `${proto}://${host}:${port}/`;
  const now = new Date();
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { "User-Agent": "Nexlify-Panel-Health/1.0" },
    });
    const status = res.ok || res.status < 500 ? "online" : "degraded";
    return { status, message: `HTTP ${res.status}`, at: now };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { status: "offline" as const, message, at: now };
  }
}

export async function POST() {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const servers = await prisma.streamServer.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  const results: { id: string; name: string; status: string; message: string }[] = [];

  for (const server of servers) {
    const port = server.port || STREAM_HTTP_PORT;
    const probe = await probeServer(server.host, port, server.protocol);
    await prisma.streamServer.update({
      where: { id: server.id },
      data: {
        healthStatus: probe.status,
        healthMessage: probe.message,
        lastHealthAt: probe.at,
      },
    });
    results.push({
      id: server.id,
      name: server.name,
      status: probe.status,
      message: probe.message,
    });
  }

  const online = results.filter((r) => r.status === "online").length;
  return NextResponse.json({
    message: `Tested ${results.length} server(s) — ${online} online`,
    results,
  });
}
