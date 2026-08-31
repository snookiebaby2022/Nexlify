import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { importFromFolder, resolveSafePath } from "@/lib/import-media";
import { isRemoteM3uUrl } from "@/lib/m3u-watch-sync";
import { runWatchFolderM3uSync } from "@/lib/m3u-sync-jobs";
import { isLocalM3uPath, reviewWatchFolder, reviewWatchM3uContent, writeWatchM3uFile } from "@/lib/watch-folder-m3u";
import { prisma } from "@/lib/prisma";
import { ImportKind, PanelRole, WatchFolderType } from "@prisma/client";
import { getSettingGroup } from "@/lib/panel-settings";

import { parseJsonBody, apiMutationErrorResponse } from "@/lib/parse-json-body";
import { guardAdminApiRequest } from "@/lib/admin-route-guard";

function folderM3uFlags(body: Record<string, unknown>) {
  return {
    autoCategory: body.autoCategory !== false,
    updateNames: body.updateNames !== false,
    overwriteCategories: body.overwriteCategories !== false,
    onDemand: body.onDemand !== false,
    removeDuplicates: body.removeDuplicates === true,
  };
}
export async function GET() {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const folders = await prisma.watchFolder.findMany({ orderBy: { name: "asc" } });
  const vod = await getSettingGroup("vod-storage");
  return NextResponse.json({
    folders,
    vodStorage: {
      rcloneRemote: String(vod.rcloneRemote ?? ""),
      rclonePath: String(vod.rclonePath ?? ""),
      localMountPath: String(vod.localMountPath ?? ""),
      s3Bucket: String(vod.s3Bucket ?? ""),
    },
  });
}

export async function POST(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  try {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = await parseJsonBody(req);

  if (!parsed.ok) return parsed.response;

  const body = parsed.data;

  if (body.review) {
    const existing = body.id
      ? await prisma.watchFolder.findUnique({ where: { id: String(body.id) } })
      : null;
    if (body.id && !existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const flags = {
      autoCategory:
        body.autoCategory !== undefined ? body.autoCategory !== false : existing?.autoCategory !== false,
      updateNames:
        body.updateNames !== undefined ? body.updateNames !== false : existing?.updateNames !== false,
      overwriteCategories:
        body.overwriteCategories !== undefined
          ? body.overwriteCategories !== false
          : existing?.overwriteCategories !== false,
      onDemand: body.onDemand !== undefined ? body.onDemand !== false : existing?.onDemand !== false,
      removeDuplicates:
        body.removeDuplicates !== undefined
          ? body.removeDuplicates === true
          : existing?.removeDuplicates === true,
    };
    const folderPath = String(body.path ?? existing?.path ?? "").trim();
    const type = String(body.type ?? existing?.type ?? "LIVE");
    const categoryId =
      body.categoryId !== undefined ? (body.categoryId || null) : existing?.categoryId ?? null;
    const opts = {
      id: existing?.id,
      name: String(body.name ?? existing?.name ?? "Review"),
      path: folderPath,
      type,
      categoryId,
      serverId: existing?.serverId ?? null,
      ...flags,
      isAdult: body.isAdult !== undefined ? body.isAdult === true : existing?.isAdult === true,
    };
    const m3uContent = typeof body.m3uContent === "string" ? body.m3uContent : "";
    try {
      const review =
        m3uContent.includes("#EXTINF") || m3uContent.includes("#EXTM3U")
          ? await reviewWatchM3uContent(m3uContent, opts)
          : folderPath
            ? await reviewWatchFolder(opts)
            : null;
      if (!review) {
        return NextResponse.json({ error: "Path, M3U URL, or M3U file is required" }, { status: 400 });
      }
      return NextResponse.json({ review, wrote: false });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Review failed" },
        { status: 400 }
      );
    }
  }

  if (body.scan && body.id) {
    const folder = await prisma.watchFolder.findUnique({ where: { id: body.id } });
    if (!folder) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (isRemoteM3uUrl(folder.path) || isLocalM3uPath(folder.path)) {
      try {
        const result = await runWatchFolderM3uSync(folder);

        await prisma.watchFolder.update({
          where: { id: folder.id },
          data: { lastScan: new Date(), importedCount: { increment: result.imported } },
        });
        const renamed = result.updated ?? 0;
        const deduped = result.deduped ?? 0;
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
            message: `M3U sync: ${result.imported} new, ${result.skipped} existing${
              renamed ? `, ${renamed} updated` : ""
            }${deduped ? `, ${deduped} exact-name copies off` : ""}`,
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
            status: "failed",
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
          status: "failed",
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
  const m3uUpload = typeof body.m3uContent === "string" && body.m3uContent.includes("#EXT");
  const folderPath = String(body.path ?? "").trim() || (m3uUpload ? "upload" : "");
  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  if (!folderPath) {
    return NextResponse.json({ error: "Path, M3U URL, or M3U file is required" }, { status: 400 });
  }

  const isRemote = body.sourceKind === "m3u" || isRemoteM3uUrl(folderPath) || m3uUpload;
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

  const flags = folderM3uFlags(body);
  const m3uContent = typeof body.m3uContent === "string" ? body.m3uContent : "";
  const folder = await prisma.watchFolder.create({
    data: {
      name,
      path: folderPath,
      type,
      categoryId: body.categoryId || null,
      serverId: body.serverId || null,
      autoScanMins: Math.max(0, Number(body.autoScanMins ?? 0)),
      isAdult: body.isAdult === true,
      ...flags,
    },
  });
  if (m3uContent.includes("#EXTINF") || m3uContent.includes("#EXTM3U")) {
    const dest = writeWatchM3uFile(folder.id, m3uContent);
    const updated = await prisma.watchFolder.update({
      where: { id: folder.id },
      data: { path: dest },
    });
    return NextResponse.json({ folder: updated });
  }
  return NextResponse.json({ folder });
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}

export async function PATCH(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  try {
    const session = await requireSession([PanelRole.ADMIN]);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const parsed = await parseJsonBody(req);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;
    const id = String(body.id ?? "").trim();
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const existing = await prisma.watchFolder.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const data: Record<string, unknown> = {};
    if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
    if (typeof body.path === "string" && body.path.trim()) data.path = body.path.trim();
    if (typeof body.isActive === "boolean") data.isActive = body.isActive;
    if (body.autoScanMins !== undefined) data.autoScanMins = Math.max(0, Number(body.autoScanMins) || 0);
    if (body.categoryId !== undefined) data.categoryId = body.categoryId || null;
    if (body.serverId !== undefined) data.serverId = body.serverId || null;
    if (body.isAdult !== undefined) data.isAdult = body.isAdult === true;
    if (body.autoCategory !== undefined) data.autoCategory = body.autoCategory !== false;
    if (body.updateNames !== undefined) data.updateNames = body.updateNames !== false;
    if (body.overwriteCategories !== undefined) data.overwriteCategories = body.overwriteCategories !== false;
    if (body.onDemand !== undefined) data.onDemand = body.onDemand !== false;
    if (body.removeDuplicates !== undefined) data.removeDuplicates = body.removeDuplicates === true;
    if (body.type && Object.values(WatchFolderType).includes(body.type)) data.type = body.type;

    const m3uContent = typeof body.m3uContent === "string" ? body.m3uContent : "";
    if (m3uContent.includes("#EXTINF") || m3uContent.includes("#EXTM3U")) {
      data.path = writeWatchM3uFile(id, m3uContent);
    }

    const folder = await prisma.watchFolder.update({ where: { id }, data });
    return NextResponse.json({ folder });
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}

export async function DELETE(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  try {
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
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}
