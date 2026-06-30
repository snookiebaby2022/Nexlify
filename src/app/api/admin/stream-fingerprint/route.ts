import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole, FingerprintType } from "@prisma/client";
import crypto from "crypto";

export async function GET(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const streamId = req.nextUrl.searchParams.get("streamId");
    const lineId = req.nextUrl.searchParams.get("lineId");
    const isActive = req.nextUrl.searchParams.get("isActive");

    const where: {
      streamId?: string;
      lineId?: string;
      isActive?: boolean;
    } = {};

    if (streamId) where.streamId = streamId;
    if (lineId) where.lineId = lineId;
    if (isActive === "1" || isActive === "true") where.isActive = true;
    if (isActive === "0" || isActive === "false") where.isActive = false;

    const fingerprints = await prisma.streamFingerprint.findMany({
      where,
      include: {
        stream: { select: { id: true, name: true } },
        line: { select: { id: true, username: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ fingerprints });
  } catch (e) {
    console.error("[stream-fingerprint GET]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to fetch fingerprints" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const body = await req.json();
    const streamId = String(body.streamId ?? "").trim();
    const lineId = String(body.lineId ?? "").trim();

    if (!streamId || !lineId) {
      return NextResponse.json(
        { error: "streamId and lineId are required" },
        { status: 400 }
      );
    }

    const token = crypto.randomBytes(32).toString("hex");
    const type = FingerprintType.INVISIBLE_WATERMARK;

    const fingerprint = await prisma.streamFingerprint.create({
      data: {
        streamId,
        lineId,
        type,
        token,
        payload: body.payload ?? null,
        expiresAt: body.expiresAt ? new Date(String(body.expiresAt)) : null,
      },
      include: {
        stream: { select: { id: true, name: true } },
        line: { select: { id: true, username: true } },
      },
    });

    return NextResponse.json({ fingerprint });
  } catch (e) {
    console.error("[stream-fingerprint POST]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to generate fingerprint" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const fingerprint = await prisma.streamFingerprint.update({
      where: { id },
      data: { isActive: false },
      include: {
        stream: { select: { id: true, name: true } },
        line: { select: { id: true, username: true } },
      },
    });

    return NextResponse.json({ fingerprint });
  } catch (e) {
    console.error("[stream-fingerprint DELETE]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to deactivate fingerprint" },
      { status: 500 }
    );
  }
}
