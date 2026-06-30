import { NextRequest, NextResponse } from "next/server";

import { requireSession } from "@/lib/auth";

import { getSettingGroup } from "@/lib/panel-settings";

import { prisma } from "@/lib/prisma";

import { PanelRole } from "@prisma/client";

import { mkdir } from "fs/promises";

import path from "path";

import { buildFullBackupSnapshot } from "@/lib/backup-run";

import { writeBackupArchive } from "@/lib/backup-archive";



export async function GET() {

  const session = await requireSession([PanelRole.ADMIN]);

  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const backup = await getSettingGroup("backup");

  return NextResponse.json({ backup });

}



export async function POST(req: NextRequest) {

  const session = await requireSession([PanelRole.ADMIN]);

  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });



  const backup = await getSettingGroup("backup");

  const formatParam = req.nextUrl.searchParams.get("format");

  const format =

    formatParam === "zip" || formatParam === "gzip"

      ? formatParam

      : backup.exportFormat === "zip"

        ? "zip"

        : backup.exportFormat === "gzip"

          ? "gzip"

          : "json";

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");



  const snapshot = await buildFullBackupSnapshot();

  const payload = JSON.stringify(snapshot, null, 2);

  const baseName = `nexlify-backup-${stamp}`;



  const target = backup.target === "remote" ? "remote" : "local";



  if (target === "local") {

    const rawPath = String(backup.localPath ?? "").trim();

    const dir = path.resolve(

      process.cwd(),

      rawPath && !rawPath.startsWith("(") ? rawPath.replace(/^\.\//, "") : "./backups"

    );

    await mkdir(dir, { recursive: true });

    const { filePath, format: writtenFormat } = await writeBackupArchive(

      dir,

      baseName,

      payload,

      format

    );

    return NextResponse.json({

      ok: true,

      target: "local",

      path: filePath,

      format: writtenFormat,

      full: true,

      s3Configured: Boolean(String(backup.s3Bucket ?? "").trim()),

      message: `Full panel backup written (${writtenFormat})`,

    });

  }



  return NextResponse.json({

    ok: true,

    target: "remote",

    filename: `${baseName}.${format === "json" ? "json" : format === "zip" ? "zip" : "json.gz"}`,

    format,

    full: true,

    message: "Remote backup settings saved. Download via Run backup or SFTP.",

    remote: {

      protocol: backup.remoteProtocol,

      host: backup.remoteHost,

      path: backup.remotePath,

    },

    s3Placeholder: {

      bucket: backup.s3Bucket || "(set S3 bucket in backup settings)",

      region: backup.s3Region || "eu-west-1",

    },

    snapshotSize: payload.length,

  });

}



export async function PUT(req: NextRequest) {

  const session = await requireSession([PanelRole.ADMIN]);

  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });



  const backup = await getSettingGroup("backup");

  if (!backup.allowRestoreUpload) {

    return NextResponse.json({ error: "Restore upload disabled in settings" }, { status: 403 });

  }



  const body = await req.json();

  const settings = body.panelSettings as { key: string; value: string }[] | undefined;

  if (!Array.isArray(settings)) {

    return NextResponse.json({ error: "Invalid backup: panelSettings array required" }, { status: 400 });

  }



  for (const row of settings) {

    if (!row.key) continue;

    await prisma.panelSetting.upsert({

      where: { key: row.key },

      create: { key: row.key, value: row.value },

      update: { value: row.value },

    });

  }



  return NextResponse.json({

    ok: true,

    restored: settings.length,

    message: "Panel settings restored from backup. Full line/stream restore uses Panel Transfer import.",

  });

}

