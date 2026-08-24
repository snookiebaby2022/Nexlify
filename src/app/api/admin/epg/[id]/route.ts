import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";

import { parseJsonBody, apiMutationErrorResponse } from "@/lib/parse-json-body";
import { guardAdminApiRequest } from "@/lib/admin-route-guard";
type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  try {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await ctx.params;
  const parsed = await parseJsonBody(req);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const source = await prisma.epgSource.update({
    where: { id },
    data: {
      name: body.name,
      url: body.url,
      country: body.country,
      isActive: body.isActive,
      syncEveryHours:
        body.syncEveryHours != null ? Number(body.syncEveryHours) : undefined,
    },
  });
  return NextResponse.json({ source });
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}
