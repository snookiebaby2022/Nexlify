import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole, BackupType, BackupStatus } from "@prisma/client";

export async function GET(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = req.nextUrl;
  const type = searchParams.get("type") as BackupType | null;
  const status = searchParams.get("status") as BackupStatus | null;

  const where: Record<string, unknown> = {};
  if (type && Object.values(BackupType).includes(type)) where.type = type;
  if (status && Object.values(BackupStatus).includes(status)) where.status = status;

  const backups = await prisma.xdriveBackup.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ backups });
}

export async function POST(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const type = String(body.type ?? "").trim() as BackupType;
  if (!type || !Object.values(BackupType).includes(type)) {
    return NextResponse.json({ error: "Invalid backup type" }, { status: 400 });
  }

  const backup = await prisma.xdriveBackup.create({
    data: {
      type,
      status: "QUEUED",
      encrypted: Boolean(body.encrypted),
      uploadProvider: body.uploadProvider ? String(body.uploadProvider) : null,
      retentionDays: Number(body.retentionDays ?? 30),
      createdById: session.id,
    },
  });

  return NextResponse.json({ backup });
}

export async function PATCH(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const body = await req.json();
  const data: Record<string, unknown> = {};

  if (body.status !== undefined) {
    const status = String(body.status) as BackupStatus;
    if (Object.values(BackupStatus).includes(status)) data.status = status;
  }
  if (body.error !== undefined) data.error = body.error ? String(body.error) : null;
  if (body.filePath !== undefined) data.filePath = body.filePath ? String(body.filePath) : null;
  if (body.fileSizeBytes !== undefined) data.fileSizeBytes = BigInt(body.fileSizeBytes);
  if (body.uploadUrl !== undefined) data.uploadUrl = body.uploadUrl ? String(body.uploadUrl) : null;
  if (body.completedAt !== undefined) data.completedAt = body.completedAt ? new Date(String(body.completedAt)) : null;

  const backup = await prisma.xdriveBackup.update({
    where: { id },
    data,
  });

  return NextResponse.json({ backup });
}

export async function DELETE(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await prisma.xdriveBackup.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
