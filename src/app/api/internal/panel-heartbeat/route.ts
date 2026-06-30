import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const secret =
    process.env.PANEL_INTERNAL_SECRET?.trim() ??
    process.env.NEXLIFY_PANEL_API_SECRET?.trim() ??
    process.env.PANEL_API_SECRET?.trim();

  const provided =
    req.headers.get("x-panel-internal-secret") ??
    req.headers.get("x-panel-api-key");

  if (!secret || provided !== secret) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = (await req.json()) as {
      url?: string;
      version?: string;
      stats?: Record<string, unknown>;
    };

    if (!body.url) {
      return NextResponse.json({ error: "Missing URL" }, { status: 400 });
    }

    const url = body.url.trim().replace(/\/$/, "");

    await prisma.panelInstance.updateMany({
      where: { url },
      data: {
        lastSeenAt: new Date(),
        version: body.version?.trim() || undefined,
        lastError: null,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[panel-heartbeat] error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
