import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { getMediaImportRoot, importFromVodRows } from "@/lib/import-media";
import { parseVodImportFile } from "@/lib/vod-import-parser";
import { prisma } from "@/lib/prisma";
import { ImportKind, PanelRole, StreamType } from "@prisma/client";

import { parseJsonBody, apiMutationErrorResponse } from "@/lib/parse-json-body";
import { guardAdminApiRequest } from "@/lib/admin-route-guard";
import { assertPublicHttpUrl } from "@/lib/ssrf";
import { readResponseTextLimited } from "@/lib/read-response-limited";
import { ndjsonImportResponse } from "@/lib/admin-import-ndjson";

export async function POST(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  try {
    const session = await requireSession([PanelRole.ADMIN]);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const parsed = await parseJsonBody(req);
    if (!parsed.ok) return parsed.response;

    const body = parsed.data;

    const run = async (report?: (event: import("@/lib/admin-import-ndjson").ImportProgressEvent) => void) => {
      let content = body.content as string | undefined;

      if (!content?.trim() && body.url) {
        report?.({ phase: "fetch", message: "Downloading import file…", current: 0, total: 0 });
        const url = String(body.url).trim();
        await assertPublicHttpUrl(url);
        const res = await fetch(url, {
          signal: AbortSignal.timeout(60_000),
          redirect: "error",
        });
        if (!res.ok) throw new Error("Failed to fetch import file URL");
        content = await readResponseTextLimited(res);
      }

      if (!content?.trim()) {
        throw new Error("content or url required");
      }

      report?.({ phase: "parse", message: "Parsing import file…", current: 0, total: 0 });
      let rows;
      try {
        rows = parseVodImportFile(content);
      } catch (e) {
        throw new Error(e instanceof Error ? e.message : "Invalid import file format");
      }

      if (!rows.length) {
        throw new Error("No valid rows. Each entry needs name and source.");
      }

      const streamType = (body.streamType as StreamType) ?? StreamType.MOVIE;
      const result = await importFromVodRows(rows, {
        defaultType: streamType === StreamType.SERIES ? "SERIES" : "MOVIE",
        categoryId: body.categoryId ?? null,
        serverId: body.serverId ?? null,
        allowedRoot: getMediaImportRoot(),
        onProgress: report,
      });

      await prisma.importJob.create({
        data: {
          kind: ImportKind.M3U,
          source: body.url ?? "vod-json",
          streamType,
          imported: result.imported,
          skipped: result.skipped,
          status: result.errors?.length ? "partial" : "done",
        },
      });

      return result;
    };

    if (body.streamProgress === true) {
      return ndjsonImportResponse(async (report) => {
        const result = await run(report);
        return {
          phase: "done",
          message: `Imported ${result.imported}, skipped ${result.skipped}`,
          imported: result.imported,
          skipped: result.skipped,
          errors: result.errors,
        };
      });
    }

    try {
      const result = await run();
      return NextResponse.json(result);
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Import failed" },
        { status: 400 }
      );
    }
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}
