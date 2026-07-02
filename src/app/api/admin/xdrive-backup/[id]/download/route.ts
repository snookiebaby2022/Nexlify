import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await ctx.params;

  const backup = await prisma.xdriveBackup.findUnique({ where: { id } });
  if (!backup) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!backup.uploadUrl && !backup.filePath) {
    return NextResponse.json({ error: "No download available" }, { status: 404 });
  }

  return NextResponse.json({
    url: backup.uploadUrl ?? backup.filePath,
    type: backup.type,
    status: backup.status,
    encrypted: backup.encrypted,
  });
}
