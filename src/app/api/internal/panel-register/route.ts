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
      domain?: string;
      ip?: string;
      metadata?: Record<string, unknown>;
    };

    if (!body.url || !body.url.startsWith("http")) {
      return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
    }

    const url = body.url.trim().replace(/\/$/, "");
    const version = body.version?.trim() || "1.0.0";
    const domain = body.domain?.trim() || null;
    const ip = body.ip?.trim() || null;

    const instance = await prisma.panelInstance.upsert({
      where: { url },
      update: {
        version,
        domain,
        ip,
        lastSeenAt: new Date(),
        lastError: null,
        metadata: body.metadata ? JSON.stringify(body.metadata) : undefined,
      },
      create: {
        url,
        version,
        domain,
        ip,
        secret: secret || crypto.randomUUID(),
        metadata: body.metadata ? JSON.stringify(body.metadata) : undefined,
      },
    });

    return NextResponse.json({
      ok: true,
      id: instance.id,
      registered: true,
      autoUpdateEnabled: instance.autoUpdateEnabled,
    });
  } catch (e) {
    console.error("[panel-register] error:", e);
    return NextResponse.json(
      { error: "Registration failed", detail: String(e) },
      { status: 500 }
    );
  }
}
