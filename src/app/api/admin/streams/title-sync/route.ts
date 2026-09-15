import { NextRequest, NextResponse } from "next/server";
import { PanelRole } from "@prisma/client";
import { requireSession } from "@/lib/auth";
import { guardAdminApiRequest } from "@/lib/admin-route-guard";
import { parseJsonBody } from "@/lib/parse-json-body";
import { applyTitleSync, listTitleSyncGroups } from "@/lib/title-sync";

export async function GET(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const categoryId = req.nextUrl.searchParams.get("categoryId")?.trim() || undefined;
  const groups = await listTitleSyncGroups({ categoryId });
  return NextResponse.json({ groups, total: groups.length });
}

export async function POST(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = await parseJsonBody<{ streamIds?: unknown; suggested?: unknown }>(req);
  if (!parsed.ok) return parsed.response;
  const streamIds = Array.isArray(parsed.data.streamIds)
    ? parsed.data.streamIds.map((id) => String(id))
    : [];
  try {
    const updated = await applyTitleSync({
      streamIds,
      suggested: String(parsed.data.suggested ?? ""),
    });
    return NextResponse.json({ ok: true, updated });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Title sync failed" },
      { status: 400 }
    );
  }
}
