import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";
import { randomBytes } from "crypto";

function generateKey(): string {
  return `nk_${randomBytes(24).toString("hex")}`;
}

export async function POST(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
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
}
