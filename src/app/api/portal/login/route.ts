import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createPortalSession, clearPortalSession } from "@/lib/portal-session";
import { lineIsPlayable } from "@/lib/lines";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const username = String(body.username ?? "").trim();
  const password = String(body.password ?? "");

  if (body.action === "logout") {
    await clearPortalSession();
    return NextResponse.json({ ok: true });
  }

  if (!username || !password) {
    return NextResponse.json({ error: "Missing credentials" }, { status: 400 });
  }

  const line = await prisma.line.findUnique({
    where: { username },
    include: { bouquets: { include: { bouquet: true } } },
  });

  if (!line || line.password !== password) {
    return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
  }

  await createPortalSession({ id: line.id, username: line.username });

  return NextResponse.json({
    ok: true,
    redirect: "/portal/dashboard",
    line: {
      username: line.username,
      status: line.status,
      expiresAt: line.expiresAt,
      playable: lineIsPlayable(line),
      bouquets: line.bouquets.map((b) => b.bouquet.name),
    },
  });
}
