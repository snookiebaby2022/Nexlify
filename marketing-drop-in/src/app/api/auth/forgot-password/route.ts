import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendMarketingEmail, resolveSmtpConfig } from "@/lib/mail";
import { randomBytes } from "crypto";

function generateToken(): string {
  return randomBytes(32).toString("hex");
}

const EMAIL_UNAVAILABLE =
  "We couldn't send a reset email right now. Please try again later or contact support@nexlify.live.";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const email = String(body.email ?? "").trim().toLowerCase();

  if (!email) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return NextResponse.json({ ok: true });
  }

  if (!resolveSmtpConfig()) {
    console.error("Password reset blocked: SMTP not configured");
    return NextResponse.json({ error: EMAIL_UNAVAILABLE }, { status: 503 });
  }

  await prisma.passwordResetToken.deleteMany({ where: { email } });

  const token = generateToken();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60);

  await prisma.passwordResetToken.create({
    data: { email, token, expiresAt },
  });

  const resetUrl = `${process.env.NEXT_PUBLIC_WEBSITE_URL ?? "https://nexlify.live"}/reset-password/${token}`;

  try {
    await sendMarketingEmail({
      to: email,
      subject: "Reset your Nexlify password",
      text: `Hi ${user.name ?? "there"},\n\nYou requested a password reset for your Nexlify account.\n\nClick this link to reset your password (expires in 1 hour):\n${resetUrl}\n\nIf you didn't request this, you can safely ignore this email.\n\n— Nexlify`,
      html: `<p>Hi ${user.name ?? "there"},</p><p>You requested a password reset for your Nexlify account.</p><p><a href="${resetUrl}">Click here to reset your password</a> (expires in 1 hour)</p><p>If you didn't request this, you can safely ignore this email.</p><p>— Nexlify</p>`,
    });
  } catch (e) {
    console.error("Failed to send reset email:", e);
    await prisma.passwordResetToken.deleteMany({ where: { email } });
    return NextResponse.json({ error: EMAIL_UNAVAILABLE }, { status: 503 });
  }

  return NextResponse.json({
    ok: true,
    resetUrl: process.env.NODE_ENV === "development" ? resetUrl : undefined,
  });
}
