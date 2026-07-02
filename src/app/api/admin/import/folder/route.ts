import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { importFromFolder } from "@/lib/import-media";
import { prisma } from "@/lib/prisma";
import { ImportKind, PanelRole, StreamType } from "@prisma/client";

export async function POST(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const folderPath = String(body.path ?? "").trim();
  if (!folderPath) {
    return NextResponse.json({ error: "path required" }, { status: 400 });
  }

  const mode = (body.mode as "MOVIE" | "SERIES" | "MIXED") ?? "MIXED";
  const streamType =
    mode === "SERIES" ? StreamType.SERIES : mode === "MOVIE" ? StreamType.MOVIE : StreamType.MOVIE;

  try {
    const result = await importFromFolder(folderPath, {
      mode,
      categoryId: body.categoryId ?? null,
      serverId: body.serverId ?? null,
      allowedRoot: process.env.MEDIA_IMPORT_ROOT,
    });

    await prisma.importJob.create({
      data: {
        kind: ImportKind.FOLDER,
        source: folderPath,
        streamType,
        imported: result.imported,
        skipped: result.skipped,
        status: "done",
      },
    });

    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Import failed" },
      { status: 400 }
    );
  }
}
