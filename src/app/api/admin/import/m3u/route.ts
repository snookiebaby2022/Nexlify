import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { importFromM3uContent } from "@/lib/import-media";
import { prisma } from "@/lib/prisma";
import { ImportKind, PanelRole, StreamType } from "@prisma/client";

async function fetchM3uContent(body: { url?: string; content?: string }) {
  let content = body.content as string | undefined;
  if (body.url) {
    const res = await fetch(body.url, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new Error("Failed to fetch M3U URL");
    content = await res.text();
  }
  if (!content?.trim()) throw new Error("content or url required");
  return content;
}

export async function POST(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();

  if (body.action === "review") {
    try {
      const content = await fetchM3uContent(body);
      const { buildM3uReview } = await import("@/lib/m3u-review");
      const review = buildM3uReview(content);
      return NextResponse.json(review);
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Review failed" },
        { status: 400 }
      );
    }
  }

  if (body.action === "preview") {
    try {
      const content = await fetchM3uContent(body);
      return NextResponse.json({ content, length: content.length });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Preview failed" },
        { status: 400 }
      );
    }
  }

  try {
    const content = await fetchM3uContent(body);
    const streamType = (body.streamType as StreamType) ?? StreamType.LIVE;
    const defaultOnDemand =
      body.defaultOnDemand !== false && streamType === StreamType.LIVE;
    const result = await importFromM3uContent(content, {
      defaultType: streamType,
      categoryId: body.categoryId ?? null,
      serverId: body.serverId ?? null,
      defaultOnDemand,
      selectedUrls: Array.isArray(body.selectedUrls) ? body.selectedUrls : undefined,
      autoCategory: body.autoCategory !== false,
      autoTmdb: body.autoTmdb !== false,
      importMeta: body.importMeta,
      bouquetIds: body.bouquetIds,
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
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Import failed" },
      { status: 400 }
    );
  }
}
