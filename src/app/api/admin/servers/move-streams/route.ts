import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/lines";
import { bumpConfigRevision } from "@/lib/stream-agent";
import { PanelRole, StreamType } from "@prisma/client";
import { parseJsonBody, apiMutationErrorResponse } from "@/lib/parse-json-body";
import { guardAdminApiRequest } from "@/lib/admin-route-guard";

const VALID_TYPES: StreamType[] = ["LIVE", "MOVIE", "SERIES"];

export async function POST(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  try {
    const session = await requireSession([PanelRole.ADMIN]);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const parsed = await parseJsonBody(req);
    if (!parsed.ok) return parsed.response;

    const body = parsed.data;
    const fromServerId = String(body.fromServerId ?? "").trim();
    const toServerId = String(body.toServerId ?? "").trim();
    const typesRaw = Array.isArray(body.types) ? body.types.map(String) : ["LIVE", "MOVIE", "SERIES"];
    const types = typesRaw.filter((t: string): t is StreamType =>
      (VALID_TYPES as readonly string[]).includes(t)
    );

    if (!fromServerId || !toServerId) {
      return NextResponse.json({ error: "fromServerId and toServerId are required" }, { status: 400 });
    }
    if (fromServerId === toServerId) {
      return NextResponse.json({ error: "Source and destination must differ" }, { status: 400 });
    }
    if (!types.length) {
      return NextResponse.json({ error: "Select at least one content type" }, { status: 400 });
    }

    const [fromServer, toServer] = await Promise.all([
      prisma.streamServer.findUnique({ where: { id: fromServerId }, select: { id: true, name: true } }),
      prisma.streamServer.findUnique({ where: { id: toServerId }, select: { id: true, name: true } }),
    ]);

    if (!fromServer) return NextResponse.json({ error: "Source server not found" }, { status: 404 });
    if (!toServer) return NextResponse.json({ error: "Destination server not found" }, { status: 404 });

    const result = await prisma.stream.updateMany({
      where: {
        serverId: fromServerId,
        type: { in: types },
      },
      data: { serverId: toServerId },
    });

    if (result.count > 0) {
      await Promise.all([
        bumpConfigRevision(fromServerId),
        bumpConfigRevision(toServerId),
      ]);
    }

    await logActivity("servers_move_streams", {
      userId: session.id,
      entity: "server",
      meta: {
        fromServerId,
        toServerId,
        types,
        moved: result.count,
      },
    });

    return NextResponse.json({
      ok: true,
      moved: result.count,
      message: `Moved ${result.count} stream(s) from ${fromServer.name} to ${toServer.name}`,
    });
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}
