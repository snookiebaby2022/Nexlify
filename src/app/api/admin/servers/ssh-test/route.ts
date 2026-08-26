import { NextRequest, NextResponse } from "next/server";
import { PanelRole } from "@prisma/client";
import { requireSession } from "@/lib/auth";
import { parseJsonBody, apiMutationErrorResponse } from "@/lib/parse-json-body";
import { guardAdminApiRequest } from "@/lib/admin-route-guard";
import { testStreamServerSsh } from "@/lib/ssh-server-test";
import { prisma } from "@/lib/prisma";
import { decryptAtRest } from "@/lib/encryption-at-rest";

export async function POST(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  try {
    const session = await requireSession([PanelRole.ADMIN]);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const parsed = await parseJsonBody(req);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;

    let host = String(body.host ?? body.agentSshHost ?? "").trim();
    let port = Number(body.port ?? body.agentSshPort ?? 22);
    let username = String(body.username ?? body.agentSshUser ?? "root").trim() || "root";
    let password = String(body.password ?? body.agentSshPassword ?? "");

    const serverId = body.serverId ? String(body.serverId) : "";
    if (serverId && !password) {
      const row = await prisma.streamServer.findUnique({
        where: { id: serverId },
        select: {
          host: true,
          agentSshHost: true,
          agentSshPort: true,
          agentSshUser: true,
          agentSshPasswordEnc: true,
        },
      });
      if (!row?.agentSshPasswordEnc) {
        return NextResponse.json({ error: "Enter the SSH password to test" }, { status: 400 });
      }
      try {
        password = decryptAtRest(row.agentSshPasswordEnc);
      } catch {
        return NextResponse.json({ error: "Stored SSH password could not be decrypted" }, { status: 400 });
      }
      host = host || row.agentSshHost || row.host;
      if (!Number.isFinite(port) || port <= 0) port = row.agentSshPort ?? 22;
      username = username || row.agentSshUser || "root";
    }

    const result = await testStreamServerSsh({ host, port, username, password });
    if (result.ok && serverId) {
      await prisma.streamServer.update({
        where: { id: serverId },
        data: {
          healthStatus: "online",
          healthMessage: result.message,
          lastHealthAt: new Date(),
        },
      });
    }
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}
