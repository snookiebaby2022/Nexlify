import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { PanelRole } from "@prisma/client";
import { restoreFullBackup } from "@/lib/backup-restore";
import { computeChecksum, decryptBackup } from "@/lib/backup-run";

/**
 * POST /api/admin/backup-restore
 * 
 * Actions:
 * - restore: Restore from uploaded JSON snapshot
 * - restore-file: Restore from a file path on the server
 */
export async function POST(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { action } = body;

  if (action === "restore") {
    let snapshot = body.snapshot as Record<string, unknown> | undefined;

    // Handle encrypted backups
    if (body.encrypted && body.data && body.password) {
      try {
        const decrypted = decryptBackup(Buffer.from(body.data, "base64"), body.password);
        snapshot = JSON.parse(decrypted);
      } catch {
        return NextResponse.json({ error: "Decryption failed" }, { status: 400 });
      }
    }

    // Handle checksum verification
    if (body.checksum && snapshot) {
      const actualChecksum = computeChecksum(JSON.stringify(snapshot, null, 2));
      if (actualChecksum !== body.checksum) {
        return NextResponse.json({ error: "Checksum mismatch" }, { status: 400 });
      }
    }

    // Support legacy settings-only restore
    if (!snapshot && Array.isArray(body.panelSettings)) {
      snapshot = { panelSettings: body.panelSettings };
    }

    if (!snapshot) {
      return NextResponse.json({ error: "snapshot required" }, { status: 400 });
    }

    const result = await restoreFullBackup(snapshot);
    return NextResponse.json({
      ok: result.errors.length === 0,
      restored: result,
    });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}

export async function GET() {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ message: "Use POST with action=restore" });
}
