import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { getSettingGroup } from "@/lib/panel-settings";
import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

export async function GET() {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const backup = await getSettingGroup("backup");
  return NextResponse.json({ backup });
}

export async function POST() {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const backup = await getSettingGroup("backup");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");

  const snapshot = {
    createdAt: new Date().toISOString(),
    panelSettings: await prisma.panelSetting.findMany(),
    counts: {
      streams: await prisma.stream.count(),
      lines: await prisma.line.count(),
      users: await prisma.panelUser.count(),
      bouquets: await prisma.bouquet.count(),
    },
  };

  const target = backup.target === "remote" ? "remote" : "local";
  const filename = `nexlify-backup-${stamp}.json`;
  const payload = JSON.stringify(snapshot, null, 2);

  if (target === "local") {
    const rawPath = String(backup.localPath ?? "").trim();
    const dir = path.resolve(
      process.cwd(),
      rawPath && !rawPath.startsWith("(") ? rawPath.replace(/^\.\//, "") : "./backups"
    );
    await mkdir(dir, { recursive: true });
    const filePath = path.join(dir, filename);
    await writeFile(filePath, payload, "utf8");
    return NextResponse.json({
      ok: true,
      target: "local",
      path: filePath,
      message: "Backup written on this server",
    });
  }

  return NextResponse.json({
    ok: true,
    target: "remote",
    filename,
    message:
      "Remote backup settings saved. Copy backup JSON via SFTP using configured host, or run server cron with scripts/backup-cron.sh",
    remote: {
      protocol: backup.remoteProtocol,
      host: backup.remoteHost,
      path: backup.remotePath,
    },
    snapshotSize: payload.length,
  });
}
