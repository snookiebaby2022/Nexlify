import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";
import { parseJsonBody, apiMutationErrorResponse } from "@/lib/parse-json-body";
import { guardAdminApiRequest } from "@/lib/admin-route-guard";

export async function POST(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  try {
    const session = await requireSession([PanelRole.ADMIN]);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const parsed = await parseJsonBody(req);
    if (!parsed.ok) return parsed.response;
    const ids = Array.isArray(parsed.data.ids)
      ? parsed.data.ids.map((id: unknown) => String(id).trim()).filter(Boolean)
      : [];
    if (!ids.length) {
      return NextResponse.json({ error: "ids required" }, { status: 400 });
    }

    const result = await prisma.streamFingerprint.updateMany({
      where: { id: { in: ids } },
      data: { isActive: false },
    });

    return NextResponse.json({ ok: true, updated: result.count });
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}
