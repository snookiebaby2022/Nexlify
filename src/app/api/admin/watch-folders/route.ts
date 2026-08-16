import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { importFromFolder, resolveSafePath } from "@/lib/import-media";
import { isRemoteM3uUrl } from "@/lib/m3u-watch-sync";
import { runWatchFolderM3uSync } from "@/lib/m3u-sync-jobs";
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

    if (isRemoteM3uUrl(folder.path)) {
      try {
        const result = await runWatchFolderM3uSync(folder);

        await prisma.watchFolder.update({
          where: { id: folder.id },
          data: { lastScan: new Date(), importedCount: { increment: result.imported } },
        });
        await prisma.importJob.create({
          data: {
            kind: ImportKind.WATCH_SCAN,
            source: folder.path,
            streamType:
              folder.type === "SERIES"
                ? "SERIES"
                : folder.type === "MOVIE"
                  ? "MOVIE"
                  : folder.type === "LIVE"
                    ? "LIVE"
                    : "LIVE",
            imported: result.imported,
            skipped: result.skipped,
            status: "done",
            watchFolderId: folder.id,
            categoryId: folder.categoryId,
            serverId: folder.serverId,
            message: `M3U sync: ${result.imported} imported, ${result.skipped} skipped`,
          },
        });
        return NextResponse.json(result);
      } catch (e) {
        await prisma.importJob.create({
          data: {
            kind: ImportKind.WATCH_SCAN,
            source: folder.path,
            imported: 0,
            skipped: 0,
            status: "error",
            watchFolderId: folder.id,
            message: e instanceof Error ? e.message : "M3U sync failed",
          },
        });
        return NextResponse.json(
          { error: e instanceof Error ? e.message : "M3U sync failed" },
          { status: 400 }
        );
      }
    }

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
        isAdult: folder.isAdult === true,
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
          watchFolderId: folder.id,
          categoryId: folder.categoryId,
          serverId: folder.serverId,
          message: `Scan completed: ${result.imported} imported, ${result.skipped} skipped`,
        },
      });

      return NextResponse.json(result);
    } catch (e) {
      await prisma.importJob.create({
        data: {
          kind: ImportKind.WATCH_SCAN,
          source: folder.path,
          imported: 0,
          skipped: 0,
          status: "error",
          watchFolderId: folder.id,
          message: e instanceof Error ? e.message : "Scan failed",
        },
      });
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Scan failed" },
        { status: 400 }
      );
    }
  }

  const name = String(body.name ?? "").trim();
  const folderPath = String(body.path ?? "").trim();
  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  if (!folderPath) {
    return NextResponse.json({ error: "Path is required" }, { status: 400 });
  }

  const isRemote = body.sourceKind === "m3u" || isRemoteM3uUrl(folderPath);
  if (!isRemote && process.env.MEDIA_IMPORT_ROOT) {
    try {
      resolveSafePath(folderPath, process.env.MEDIA_IMPORT_ROOT);
    } catch {
      return NextResponse.json(
        { error: `Path must be under MEDIA_IMPORT_ROOT (${process.env.MEDIA_IMPORT_ROOT})` },
        { status: 400 }
      );
    }
  }

  const validTypes = Object.values(WatchFolderType);
  let type = validTypes.includes(body.type) ? body.type : WatchFolderType.MIXED;
  if (isRemote && type === WatchFolderType.M3U) {
    type = WatchFolderType.MIXED;
  }

  const folder = await prisma.watchFolder.create({
    data: {
      name,
      path: folderPath,
      type,
      categoryId: body.categoryId || null,
      serverId: body.serverId || null,
      autoScanMins: Math.max(0, Number(body.autoScanMins ?? 0)),
      isAdult: body.isAdult === true,
    },
  });
  return NextResponse.json({ folder });
}

export async function DELETE(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const folder = await prisma.watchFolder.findUnique({ where: { id } });
  if (!folder) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.importJob.updateMany({
    where: { watchFolderId: id },
    data: { watchFolderId: null },
  });

  await prisma.watchFolder.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
