import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { importFromM3uContent } from "@/lib/import-media";
import { prisma } from "@/lib/prisma";
import { ImportKind, PanelRole, StreamType } from "@prisma/client";

export async function POST(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  let content = body.content as string | undefined;

  if (body.url) {
    const res = await fetch(body.url, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) return NextResponse.json({ error: "Failed to fetch M3U URL" }, { status: 400 });
    content = await res.text();
  }

  if (!content?.trim()) {
    return NextResponse.json({ error: "content or url required" }, { status: 400 });
  }

  const streamType = (body.streamType as StreamType) ?? StreamType.LIVE;
  const result = await importFromM3uContent(content, {
    defaultType: streamType,
    categoryId: body.categoryId ?? null,
    serverId: body.serverId ?? null,
  });

  await prisma.importJob.create({
    data: {
      kind: ImportKind.M3U,
      source: body.url ?? "paste",
      streamType,
      imported: result.imported,
      skipped: result.skipped,
      status: "done",
    },
  });

  return NextResponse.json(result);
}
