import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { PanelRole } from "@prisma/client";
import { parseJsonBody, apiMutationErrorResponse } from "@/lib/parse-json-body";
import { guardAdminApiRequest } from "@/lib/admin-route-guard";
import { deleteForeignVod, findForeignVodItems, type ForeignVodKind } from "@/lib/foreign-vod";

function parseKind(raw: unknown): ForeignVodKind | null {
  const t = String(raw ?? "").toUpperCase();
  if (t === "MOVIE" || t === "SERIES") return t;
  return null;
}

export async function GET(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const kind = parseKind(req.nextUrl.searchParams.get("type"));
  if (!kind) return NextResponse.json({ error: "type must be MOVIE or SERIES" }, { status: 400 });
  const { count, items } = await findForeignVodItems(kind, 200);
  return NextResponse.json({ type: kind, count, items });
}

export async function POST(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;
  try {
    const session = await requireSession([PanelRole.ADMIN]);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const parsed = await parseJsonBody(req);
    if (!parsed.ok) return parsed.response;
    const kind = parseKind(parsed.data.type);
    if (!kind) return NextResponse.json({ error: "type must be MOVIE or SERIES" }, { status: 400 });
    const ids = Array.isArray(parsed.data.ids)
      ? parsed.data.ids.map((id: unknown) => String(id).trim()).filter(Boolean)
      : undefined;
    const result = await deleteForeignVod(kind, ids);
    return NextResponse.json({ ok: true, type: kind, deleted: result.deleted });
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}
