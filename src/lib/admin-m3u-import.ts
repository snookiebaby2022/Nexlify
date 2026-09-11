import { ImportKind, StreamType } from "@prisma/client";
import { prisma } from "./prisma";
import { importFromM3uContent } from "./import-media";
import type { ImportProgressReporter } from "./admin-import-ndjson";
import { assertPublicHttpUrl } from "./ssrf";
import { readResponseTextLimited } from "./read-response-limited";

export async function fetchM3uImportContent(body: {
  url?: string;
  content?: string;
}): Promise<string> {
  let content = body.content;
  if (body.url) {
    const url = String(body.url).trim();
    await assertPublicHttpUrl(url);
    const res = await fetch(url, {
      signal: AbortSignal.timeout(60_000),
      redirect: "error",
    });
    if (!res.ok) throw new Error("Failed to fetch M3U URL");
    content = await readResponseTextLimited(res);
  }
  if (!content?.trim()) throw new Error("content or url required");
  return content;
}

export type M3uImportBody = {
  url?: string;
  content?: string;
  streamType?: StreamType;
  categoryId?: string | null;
  serverId?: string | null;
  serverIds?: string[];
  defaultOnDemand?: boolean;
  selectedUrls?: string[];
  autoCategory?: boolean;
  autoTmdb?: boolean;
  autoBouquetFromGroup?: boolean;
  autoAssignEpg?: boolean;
  importMeta?: Record<string, unknown>;
  bouquetIds?: string[];
};

export async function runAdminM3uImport(
  body: M3uImportBody,
  report?: ImportProgressReporter
) {
  report?.({ phase: "fetch", message: "Reading playlist…", current: 0, total: 0 });
  const content = await fetchM3uImportContent(body);
  const streamType = body.streamType ?? StreamType.LIVE;
  const defaultOnDemand =
    body.defaultOnDemand !== false && streamType === StreamType.LIVE;

  report?.({ phase: "import", message: "Importing streams…", current: 0, total: 0 });

  const result = await importFromM3uContent(content, {
    defaultType: streamType,
    categoryId: body.categoryId ?? null,
    serverId: body.serverId ?? null,
    serverIds: Array.isArray(body.serverIds) ? body.serverIds.map(String) : undefined,
    defaultOnDemand,
    selectedUrls: Array.isArray(body.selectedUrls) ? body.selectedUrls : undefined,
    autoCategory: body.autoCategory !== false,
    autoTmdb: body.autoTmdb !== false,
    autoBouquetFromGroup:
      streamType === StreamType.LIVE ? body.autoBouquetFromGroup === true : false,
    importMeta: body.importMeta,
    bouquetIds: body.bouquetIds,
    onProgress: report,
  });

  if (streamType === StreamType.LIVE && body.autoAssignEpg !== false && result.imported > 0) {
    const epgLimit = Math.min(150, Math.max(30, result.imported));
    report?.({
      phase: "epg",
      message: `Matching EPG (up to ${epgLimit} channels)…`,
      current: 0,
      total: epgLimit,
      imported: result.imported,
      skipped: result.skipped,
    });
    try {
      const { autoAssignMissingEpg } = await import("./epg-auto-match");
      const mapped = await autoAssignMissingEpg({ limit: epgLimit });
      (result as { epgAssigned?: number }).epgAssigned = mapped.assigned;
      report?.({
        phase: "epg",
        message: `EPG matched for ${mapped.assigned} channel(s)`,
        current: mapped.assigned,
        total: epgLimit,
        imported: result.imported,
        skipped: result.skipped,
      });
    } catch {
      /* non-fatal */
    }
  }

  await prisma.importJob.create({
    data: {
      kind: ImportKind.M3U,
      source: body.url ?? "paste",
      streamType,
      imported: result.imported,
      skipped: result.skipped,
      status: result.errors?.length ? "partial" : "done",
    },
  });

  return result;
}
