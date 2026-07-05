import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { PanelRole } from "@prisma/client";
import { createBackup, getBackups, deleteBackup, restoreBackup } from "@/lib/backup-restore";

export async function GET() {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const backups = await getBackups();
  return NextResponse.json({ backups });
}

export async function POST(req: Request) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { action, name, backupId, includes } = await req.json();

  if (action === "create") {
    const backup = await createBackup(name, includes);
    return NextResponse.json(backup);
  }

  if (action === "delete") {
    await deleteBackup(backupId);
    return NextResponse.json({ ok: true });
  }

  if (action === "restore") {
    await restoreBackup(backupId);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
