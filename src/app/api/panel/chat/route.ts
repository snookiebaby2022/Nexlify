import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";

const CHAT_ROLES: PanelRole[] = [PanelRole.ADMIN, PanelRole.RESELLER, PanelRole.SUB_RESELLER];

export async function GET(req: NextRequest) {
  const session = await requireSession(CHAT_ROLES);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const sinceRaw = req.nextUrl.searchParams.get("since");
  const since = sinceRaw ? new Date(sinceRaw) : null;
  const countOnly = req.nextUrl.searchParams.get("count") === "1";

  if (countOnly) {
    const unread = await prisma.panelChatMessage.count({
      where: {
        userId: { not: session.id },
        ...(since && !Number.isNaN(since.getTime())
          ? { createdAt: { gt: since } }
          : {}),
      },
    });
    return NextResponse.json({ unread });
  }

  const messages = await prisma.panelChatMessage.findMany({
    where:
      since && !Number.isNaN(since.getTime())
        ? { createdAt: { gt: since } }
        : undefined,
    take: 200,
    orderBy: { createdAt: "asc" },
    include: {
      user: { select: { id: true, username: true, displayName: true, role: true, avatarUrl: true } },
    },
  });

  return NextResponse.json({ messages });
}

export async function POST(req: NextRequest) {
  const session = await requireSession(CHAT_ROLES);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const text = String(body.body ?? "").trim();
  if (!text || text.length > 4000) {
    return NextResponse.json({ error: "Message required (max 4000 chars)" }, { status: 400 });
  }

  const message = await prisma.panelChatMessage.create({
    data: { userId: session.id, body: text },
    include: {
      user: { select: { id: true, username: true, displayName: true, role: true, avatarUrl: true } },
    },
  });

  void import("@/lib/panel-chat-notify").then(({ notifyLiveChatMessage }) =>
    notifyLiveChatMessage({
      fromUserId: session.id,
      fromUsername: session.username,
      fromRole: session.role,
      body: text,
    })
  );

  return NextResponse.json({ message });
}
