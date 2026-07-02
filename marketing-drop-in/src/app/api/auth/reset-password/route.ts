import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const token = String(body.token ?? "").trim();
  const password = String(body.password ?? "").trim();

  if (!token || !password) {
    return NextResponse.json({ error: "Token and password are required" }, { status: 400 });
  }

  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  const resetToken = await prisma.passwordResetToken.findUnique({ where: { token } });

  if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email: resetToken.email } });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash },
  });

  await prisma.passwordResetToken.update({
    where: { id: resetToken.id },
    data: { usedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
