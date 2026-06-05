import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { getMediaImportRoot, importFromVodRows } from "@/lib/import-media";
import { parseVodImportFile } from "@/lib/vod-import-parser";
import { prisma } from "@/lib/prisma";
import { ImportKind, PanelRole, StreamType } from "@prisma/client";

export async function POST(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  let content = body.content as string | undefined;

  if (!content?.trim() && body.url) {
    const res = await fetch(body.url, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) return NextResponse.json({ error: "Failed to fetch import file URL" }, { status: 400 });
    content = await res.text();
  }

  if (!content?.trim()) {
    return NextResponse.json({ error: "content or url required" }, { status: 400 });
  }

  let rows;
  try {
    rows = parseVodImportFile(content);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Invalid import file format" },
      { status: 400 }
    );
  }

  if (!rows.length) {
    return NextResponse.json(
      { error: "No valid rows. Each entry needs name and source." },
      { status: 400 }
    );
  }

  const streamType = (body.streamType as StreamType) ?? StreamType.MOVIE;
  const result = await importFromVodRows(rows, {
    defaultType: streamType === StreamType.SERIES ? "SERIES" : "MOVIE",
    categoryId: body.categoryId ?? null,
    serverId: body.serverId ?? null,
    allowedRoot: getMediaImportRoot(),
  });

  await prisma.importJob.create({
    data: {
      kind: ImportKind.M3U,
      source: body.url ?? "vod-json",
      streamType,
      imported: result.imported,
      skipped: result.skipped,
      status: result.errors.length ? "partial" : "done",
    },
  });

  return NextResponse.json(result);
}
