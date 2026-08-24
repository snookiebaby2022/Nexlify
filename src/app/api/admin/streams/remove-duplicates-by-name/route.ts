import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/lines";
import {
  invalidateDashboardStats,
  invalidatePlaybackUrls,
  invalidateXtreamCategories,
} from "@/lib/cache-invalidate";
import { PanelRole, StreamType } from "@prisma/client";
import { removeDuplicateStreamsByName } from "@/lib/remove-duplicate-streams-by-name";
import { parseJsonBody, apiMutationErrorResponse } from "@/lib/parse-json-body";
import { guardAdminApiRequest } from "@/lib/admin-route-guard";

const VALID_TYPES = new Set<string>([StreamType.LIVE, StreamType.MOVIE, StreamType.SERIES]);

export async function POST(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  try {
    const session = await requireSession([PanelRole.ADMIN]);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const parsed = await parseJsonBody(req);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;

    const streamTypeRaw = String(body.streamType ?? "LIVE").toUpperCase();
    if (!VALID_TYPES.has(streamTypeRaw)) {
      return NextResponse.json({ error: "Invalid streamType" }, { status: 400 });
    }
    const streamType = streamTypeRaw as StreamType;
    const isRadio = body.isRadio === true;
    const dryRun = body.dryRun === true;

    const result = await removeDuplicateStreamsByName(prisma, {
      streamType,
      isRadio: streamType === StreamType.LIVE ? isRadio : undefined,
      dryRun,
    });

    if (!dryRun && result.merged > 0) {
      await logActivity("remove_duplicates", {
        userId: session.id,
        entity: "stream",
        meta: { byName: true, streamType, deleted: result.merged },
      });
      await invalidatePlaybackUrls();
      await invalidateXtreamCategories();
      await invalidateDashboardStats();
    }

    return NextResponse.json({ ok: true, dryRun, streamType, isRadio, ...result });
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}
