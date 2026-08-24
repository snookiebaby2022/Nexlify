import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { PanelRole } from "@prisma/client";
import { flagStream, getModerationFlags, reviewFlag, deleteFlag } from "@/lib/content-moderation";

import { parseJsonBody, apiMutationErrorResponse } from "@/lib/parse-json-body";
import { guardAdminApiRequest } from "@/lib/admin-route-guard";
export async function GET(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const status = req.nextUrl.searchParams.get("status") ?? undefined;
  const flags = await getModerationFlags(status ?? undefined);
  return NextResponse.json({ flags });
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

  const { action } = body;

  if (action === "flag") {
    const { streamId, reason, severity } = body;
    if (!streamId || !reason) {
      return NextResponse.json({ error: "streamId and reason required" }, { status: 400 });
    }
    const flag = await flagStream(streamId, reason, severity ?? "medium");
    return NextResponse.json(flag);
  }

  if (action === "review") {
    const { flagId, status } = body;
    if (!flagId || !status) {
      return NextResponse.json({ error: "flagId and status required" }, { status: 400 });
    }
    const ok = await reviewFlag(flagId, status, session.username);
    return NextResponse.json({ ok });
  }

  if (action === "delete") {
    const { flagId } = body;
    if (!flagId) {
      return NextResponse.json({ error: "flagId required" }, { status: 400 });
    }
    const ok = await deleteFlag(flagId);
    return NextResponse.json({ ok });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}
