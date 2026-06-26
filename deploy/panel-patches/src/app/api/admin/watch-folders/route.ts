import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { importFromFolder } from "@/lib/import-media";
import { prisma } from "@/lib/prisma";
import { ImportKind, PanelRole, WatchFolderType } from "@prisma/client";

export async function GET() {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const folders = await prisma.watchFolder.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json({ folders });
}

export async function POST(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();

  if (body.scan && body.id) {
    const folder = await prisma.watchFolder.findUnique({ where: { id: body.id } });
    if (!folder) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const mode =
      folder.type === "SERIES"
        ? "SERIES"
        : folder.type === "MOVIE"
          ? "MOVIE"
          : "MIXED";

    try {
      const result = await importFromFolder(folder.path, {
        mode,
        categoryId: folder.categoryId,
        serverId: folder.serverId,
        allowedRoot: process.env.MEDIA_IMPORT_ROOT,
      });

      await prisma.watchFolder.update({
        where: { id: folder.id },
        data: {
          lastScan: new Date(),
          importedCount: { increment: result.imported },
        },
      });

      await prisma.importJob.create({
        data: {
          kind: ImportKind.WATCH_SCAN,
          source: folder.path,
          imported: result.imported,
          skipped: result.skipped,
          status: "done",
        },
      });

      return NextResponse.json(result);
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Scan failed" },
        { status: 400 }
      );
    }
  }

  const folder = await prisma.watchFolder.create({
    data: {
      name: body.name,
      path: body.path,
      type: (body.type as WatchFolderType) ?? WatchFolderType.MIXED,
      categoryId: body.categoryId || null,
      serverId: body.serverId || null,
      autoScanMins: Number(body.autoScanMins ?? 0),
    },
  });
  return NextResponse.json({ folder });
}

export async function DELETE(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await prisma.watchFolder.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
