import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";
import { randomBytes } from "crypto";

import { parseJsonBody, apiMutationErrorResponse } from "@/lib/parse-json-body";
function generateKey(): string {
  return `nk_${randomBytes(24).toString("hex")}`;
}

export async function POST(req: NextRequest) {
  try {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = await parseJsonBody(req);

  if (!parsed.ok) return parsed.response;

  const body = parsed.data;

  const id = String(body.id ?? req.nextUrl.searchParams.get("id") ?? "").trim();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const existing = await prisma.resellerApiKey.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const newKey = generateKey();
  const updated = await prisma.resellerApiKey.update({
    where: { id },
    data: {
      key: newKey,
      usageCount: 0,
      lastUsedAt: null,
    },
  });

  return NextResponse.json({ key: updated });
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}
