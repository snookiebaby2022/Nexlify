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
    const body = parsed.data;

    const channelName = String(body.channelName ?? "").trim();
    const suggestedName = String(body.suggestedName ?? "").trim();
    const suggestedCategory = String(body.suggestedCategory ?? "").trim();

    if (!channelName) {
      return NextResponse.json({ error: "channelName required" }, { status: 400 });
    }

    const stream = await prisma.stream.findFirst({
      where: { name: { equals: channelName, mode: "insensitive" }, type: "LIVE" },
      select: { id: true, name: true, categoryId: true },
    });

    if (!stream) {
      return NextResponse.json({ error: "Stream not found for channel name" }, { status: 404 });
    }

    let categoryId = stream.categoryId;
    if (suggestedCategory) {
      const cat = await prisma.category.findFirst({
        where: { name: { equals: suggestedCategory, mode: "insensitive" }, categoryType: "LIVE" },
      });
      if (cat) categoryId = cat.id;
      else {
        const created = await prisma.category.create({
          data: { name: suggestedCategory, categoryType: "LIVE" },
        });
        categoryId = created.id;
      }
    }

    const updated = await prisma.stream.update({
      where: { id: stream.id },
      data: {
        name: suggestedName || stream.name,
        categoryId,
      },
    });

    return NextResponse.json({ ok: true, stream: updated });
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}
