import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";

export async function GET(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const lineId = req.nextUrl.searchParams.get("lineId");
    const streamId = req.nextUrl.searchParams.get("streamId");
    const serverId = req.nextUrl.searchParams.get("serverId");
    const isActive = req.nextUrl.searchParams.get("isActive");

    const where: {
      lineId?: string;
      streamId?: string | null;
      serverId?: string | null;
      isActive?: boolean;
    } = {};

    if (lineId) where.lineId = lineId;
    if (streamId) where.streamId = streamId;
    if (serverId) where.serverId = serverId;
    if (isActive === "1" || isActive === "true") where.isActive = true;
    if (isActive === "0" || isActive === "false") where.isActive = false;

    const sessions = await prisma.loadBalancerSession.findMany({
      where,
      include: {
        line: { select: { id: true, username: true } },
        stream: { select: { id: true, name: true } },
        server: { select: { id: true, name: true } },
      },
      orderBy: { lastSeenAt: "desc" },
    });

    return NextResponse.json({ sessions });
  } catch (e) {
    console.error("[lb-sessions GET]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to fetch sessions" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const body = await req.json();
    const sessionKey = String(body.sessionKey ?? "").trim();
    const lineId = String(body.lineId ?? "").trim();

    if (!sessionKey || !lineId) {
      return NextResponse.json(
        { error: "sessionKey and lineId are required" },
        { status: 400 }
      );
    }

    const streamId = body.streamId ? String(body.streamId).trim() : null;
    const serverId = body.serverId ? String(body.serverId).trim() : null;

    const now = new Date();
    const bytesIn = BigInt(body.bytesIn ?? 0);
    const bytesOut = BigInt(body.bytesOut ?? 0);

    const lbSession = await prisma.loadBalancerSession.upsert({
      where: { sessionKey },
      create: {
        sessionKey,
        lineId,
        streamId,
        serverId,
        deviceId: body.deviceId ? String(body.deviceId) : null,
        ip: body.ip ? String(body.ip) : null,
        bytesIn,
        bytesOut,
        isActive: true,
        startedAt: now,
        lastSeenAt: now,
      },
      update: {
        lineId,
        streamId,
        serverId,
        deviceId: body.deviceId ? String(body.deviceId) : null,
        ip: body.ip ? String(body.ip) : null,
        bytesIn,
        bytesOut,
        isActive: true,
        lastSeenAt: now,
      },
      include: {
        line: { select: { id: true, username: true } },
        stream: { select: { id: true, name: true } },
        server: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ session: lbSession });
  } catch (e) {
    console.error("[lb-sessions POST]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to create or update session" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const id = req.nextUrl.searchParams.get("id");
    const sessionKey = req.nextUrl.searchParams.get("sessionKey");

    if (!id && !sessionKey) {
      return NextResponse.json(
        { error: "id or sessionKey is required" },
        { status: 400 }
      );
    }

    const where = id ? { id } : { sessionKey: sessionKey! };

    const ended = await prisma.loadBalancerSession.update({
      where,
      data: { isActive: false },
      include: {
        line: { select: { id: true, username: true } },
        stream: { select: { id: true, name: true } },
        server: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ session: ended });
  } catch (e) {
    console.error("[lb-sessions DELETE]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to end session" },
      { status: 500 }
    );
  }
}
