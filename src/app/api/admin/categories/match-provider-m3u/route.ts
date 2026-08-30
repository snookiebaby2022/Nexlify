import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { PanelRole } from "@prisma/client";
import { recategorizeLiveFromProviders } from "@/lib/recategorize-from-provider";
import { parseJsonBody, apiMutationErrorResponse } from "@/lib/parse-json-body";
import { guardAdminApiRequest } from "@/lib/admin-route-guard";
import { logActivity } from "@/lib/lines";

export async function POST(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  try {
    const session = await requireSession([PanelRole.ADMIN]);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const parsed = await parseJsonBody(req);
    if (!parsed.ok) return parsed.response;
    const dryRun = parsed.data.dryRun === true;

    const result = await recategorizeLiveFromProviders({ dryRun });

    if (!dryRun && result.updated > 0) {
      await logActivity("match_provider_m3u_categories", {
        userId: session.id,
        entity: "category",
        meta: { updated: result.updated, created: result.createdCategories.length },
      });
    }

    return NextResponse.json({ ok: true, dryRun, ...result });
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}
