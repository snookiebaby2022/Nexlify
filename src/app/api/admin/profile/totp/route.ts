import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateTotpSecret, totpUri, verifyTotpCode } from "@/lib/totp";

export async function POST(req: NextRequest) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const action = String(body.action ?? "");

  if (action === "setup") {
    const secret = generateTotpSecret();
    return NextResponse.json({
      secret,
      uri: totpUri(secret, session.username),
    });
  }

  if (action === "enable") {
    const secret = String(body.secret ?? "").trim();
    const code = String(body.code ?? "").trim();
    if (!secret || !verifyTotpCode(secret, code)) {
      return NextResponse.json({ error: "Invalid authenticator code" }, { status: 400 });
    }
    await prisma.panelUser.update({
      where: { id: session.id },
      data: { totpSecret: secret, totpEnabled: true },
    });
    return NextResponse.json({ ok: true, totpEnabled: true });
  }

  if (action === "disable") {
    const user = await prisma.panelUser.findUnique({ where: { id: session.id } });
    if (!user?.totpSecret) {
      await prisma.panelUser.update({
        where: { id: session.id },
        data: { totpSecret: null, totpEnabled: false },
      });
      return NextResponse.json({ ok: true, totpEnabled: false });
    }
    const code = String(body.code ?? "").trim();
    if (!verifyTotpCode(user.totpSecret, code)) {
      return NextResponse.json({ error: "Invalid authenticator code" }, { status: 400 });
    }
    await prisma.panelUser.update({
      where: { id: session.id },
      data: { totpSecret: null, totpEnabled: false },
    });
    return NextResponse.json({ ok: true, totpEnabled: false });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
