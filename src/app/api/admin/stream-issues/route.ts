import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";

export async function GET(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = req.nextUrl;
  const streamId = searchParams.get("streamId");
  const issueType = searchParams.get("issueType");
  const autoFixed = searchParams.get("autoFixed");
  const limit = Math.min(Number(searchParams.get("limit") ?? 50), 200);
  const offset = Number(searchParams.get("offset") ?? 0);

  const where: Record<string, unknown> = {};
  if (streamId) where.streamId = streamId;
  if (issueType) where.issueType = issueType;
  if (autoFixed !== null) where.autoFixed = autoFixed === "true";

  const [issues, total] = await Promise.all([
    prisma.streamIssue.findMany({
      where,
      orderBy: { detectedAt: "desc" },
      take: limit,
      skip: offset,
      include: {
        stream: { select: { id: true, name: true } },
        server: { select: { id: true, name: true } },
      },
    }),
    prisma.streamIssue.count({ where }),
  ]);

  return NextResponse.json({ issues, total, limit, offset });
}

export async function POST(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const streamId = String(body.streamId ?? "");
  const issueType = String(body.issueType ?? "").trim();
  if (!streamId) return NextResponse.json({ error: "streamId required" }, { status: 400 });
  if (!issueType) return NextResponse.json({ error: "issueType required" }, { status: 400 });

  const issue = await prisma.streamIssue.create({
    data: {
      streamId,
      issueType,
      severity: String(body.severity ?? "warning"),
      serverId: body.serverId ? String(body.serverId) : null,
      autoFixed: Boolean(body.autoFixed ?? false),
      fixAction: body.fixAction ? String(body.fixAction) : null,
      fixResult: body.fixResult ? String(body.fixResult) : null,
    },
  });

  return NextResponse.json({ issue });
}

export async function PATCH(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const id = String(body.id ?? "");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const data: Record<string, unknown> = {};
  if (body.resolved === true) {
    data.resolvedAt = new Date();
  }
  if (body.autoFixed !== undefined) {
    data.autoFixed = Boolean(body.autoFixed);
  }
  if (body.fixAction !== undefined) {
    data.fixAction = body.fixAction ? String(body.fixAction) : null;
  }
  if (body.fixResult !== undefined) {
    data.fixResult = body.fixResult ? String(body.fixResult) : null;
  }
  if (body.severity !== undefined) {
    data.severity = String(body.severity);
  }

  const issue = await prisma.streamIssue.update({ where: { id }, data });
  return NextResponse.json({ issue });
}
