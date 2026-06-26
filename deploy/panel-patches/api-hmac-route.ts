import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";

export async function GET() {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const row = await prisma.panelSetting.findUnique({ where: { key: "hmac_api_secret" } });
  return NextResponse.json({ secret: row?.value ?? "" });
}

export async function POST(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json();
  const secret = String(body.secret ?? "");
  await prisma.panelSetting.upsert({
    where: { key: "hmac_api_secret" },
    create: { key: "hmac_api_secret", value: secret },
    update: { value: secret },
  });
  return NextResponse.json({ ok: true });
}
