import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPortalSession } from "@/lib/portal-session";
import { generateLinePassword, MIN_LINE_CREDENTIAL_LENGTH } from "@/lib/credential-generate";

export async function POST(req: NextRequest) {
  const session = await getPortalSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const current = String(body.currentPassword ?? "");
  const next = String(body.newPassword ?? "").trim();

  if (next.length < MIN_LINE_CREDENTIAL_LENGTH) {
    return NextResponse.json(
      { error: `Password must be at least ${MIN_LINE_CREDENTIAL_LENGTH} characters` },
      { status: 400 }
    );
  }

  const line = await prisma.line.findUnique({ where: { id: session.lineId } });
  if (!line || line.password !== current) {
    return NextResponse.json({ error: "Current password incorrect" }, { status: 400 });
  }

  await prisma.line.update({
    where: { id: line.id },
    data: { password: next },
  });

  return NextResponse.json({ ok: true });
}

export async function PUT(req: NextRequest) {
  const session = await getPortalSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  if (body.action === "generate") {
    const password = generateLinePassword();
    await prisma.line.update({
      where: { id: session.lineId },
      data: { password },
    });
    return NextResponse.json({ password });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
