import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { PanelRole } from "@prisma/client";

import { parseJsonBody, apiMutationErrorResponse } from "@/lib/parse-json-body";
import { guardAdminApiRequest } from "@/lib/admin-route-guard";
import { ndjsonImportResponse } from "@/lib/admin-import-ndjson";
import { fetchM3uImportContent, runAdminM3uImport } from "@/lib/admin-m3u-import";

export async function POST(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  try {
    const session = await requireSession([PanelRole.ADMIN]);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const parsed = await parseJsonBody(req);
    if (!parsed.ok) return parsed.response;

    const body = parsed.data;

    if (body.action === "review") {
      try {
        const content = await fetchM3uImportContent(body);
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
        const content = await fetchM3uImportContent(body);
        return NextResponse.json({ content, length: content.length });
      } catch (e) {
        return NextResponse.json(
          { error: e instanceof Error ? e.message : "Preview failed" },
          { status: 400 }
        );
      }
    }

    if (body.streamProgress === true) {
      return ndjsonImportResponse(async (report) => {
        const result = await runAdminM3uImport(body, report);
        return {
          phase: "done",
          message: `Imported ${result.imported}, skipped ${result.skipped}`,
          imported: result.imported,
          skipped: result.skipped,
          updated: result.updated,
          errors: result.errors,
          epgAssigned: (result as { epgAssigned?: number }).epgAssigned,
        };
      });
    }

    try {
      const result = await runAdminM3uImport(body);
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
