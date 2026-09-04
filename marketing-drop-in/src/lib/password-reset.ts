import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { sendMarketingEmail, resolveSmtpConfig } from "@/lib/mail";

export const EMAIL_UNAVAILABLE =
  "We couldn't send a reset email right now. Please try again later or contact support@nexlify.live.";

function generateToken(): string {
  return randomBytes(32).toString("hex");
}

export async function sendPasswordResetEmail(email: string): Promise<{ ok: true; resetUrl?: string } | { ok: false; error: string; status: number }> {
  const normalized = email.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email: normalized } });
  if (!user) return { ok: true };

  if (!resolveSmtpConfig()) {
    return { ok: false, error: EMAIL_UNAVAILABLE, status: 503 };
  }

  await prisma.passwordResetToken.deleteMany({ where: { email: normalized } });

  const token = generateToken();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60);
  await prisma.passwordResetToken.create({
    data: { email: normalized, token, expiresAt },
  });

  const resetUrl = `${process.env.NEXT_PUBLIC_WEBSITE_URL ?? "https://nexlify.live"}/reset-password/${token}`;

  try {
    await sendMarketingEmail({
      to: normalized,
      subject: "Reset your Nexlify password",
      text: `Hi ${user.name ?? "there"},\n\nYou requested a password reset for your Nexlify account.\n\nClick this link to reset your password (expires in 1 hour):\n${resetUrl}\n\nIf you didn't request this, you can safely ignore this email.\n\n— Nexlify`,
      html: `<p>Hi ${user.name ?? "there"},</p><p>You requested a password reset for your Nexlify account.</p><p><a href="${resetUrl}">Click here to reset your password</a> (expires in 1 hour)</p><p>If you didn't request this, you can safely ignore this email.</p><p>— Nexlify</p>`,
    });
  } catch (e) {
    console.error("Failed to send reset email:", e);
    await prisma.passwordResetToken.deleteMany({ where: { email: normalized } });
    return { ok: false, error: EMAIL_UNAVAILABLE, status: 503 };
  }

  return {
    ok: true,
    resetUrl: process.env.NODE_ENV === "development" ? resetUrl : undefined,
  };
}
