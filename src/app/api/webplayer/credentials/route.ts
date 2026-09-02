import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { lineIsPlayable } from "@/lib/lines";
import { readWebplayerLinkLineId } from "@/lib/webplayer-link";

/** Exchange a short-lived webplayer link token for line credentials (not for URLs/logs). */
export async function GET(req: Request) {
  const t = new URL(req.url).searchParams.get("t")?.trim() ?? "";
  if (!t) return NextResponse.json({ error: "Missing token" }, { status: 400 });

  const lineId = await readWebplayerLinkLineId(t);
  if (!lineId) return NextResponse.json({ error: "Invalid or expired link" }, { status: 401 });

  const line = await prisma.line.findUnique({
    where: { id: lineId },
    select: { username: true, password: true, status: true, expiresAt: true },
  });
  if (!line || !lineIsPlayable(line)) {
    return NextResponse.json({ error: "Line unavailable" }, { status: 403 });
  }

  return NextResponse.json(
    { username: line.username, password: line.password },
    { headers: { "Cache-Control": "no-store" } }
  );
}
