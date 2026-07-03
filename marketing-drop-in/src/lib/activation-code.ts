import { randomInt } from "crypto";
import { prisma } from "@/lib/prisma";

const CODE_EXPIRY_MINUTES = 15;
const CODE_LENGTH = 6;

export async function generateActivationCode(
  licenseId: string,
  userId: string,
  email: string
): Promise<string> {
  await prisma.activationCode.updateMany({
    where: { licenseId, used: false },
    data: { used: true },
  });

  const code = String(randomInt(0, 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, "0");
  const expiresAt = new Date(Date.now() + CODE_EXPIRY_MINUTES * 60_000);

  await prisma.activationCode.create({
    data: { code, licenseId, userId, email, expiresAt },
  });

  return code;
}

export async function verifyActivationCode(licenseKey: string, code: string) {
  const license = await prisma.license.findUnique({
    where: { key: licenseKey.trim() },
    select: {
      id: true,
      userId: true,
      status: true,
      expiresAt: true,
      plan: { select: { name: true } },
    },
  });
  if (!license) return { ok: false as const, error: "License not found" };
  if (license.status === "REVOKED" || license.status === "SUSPENDED") {
    return { ok: false as const, error: "License is inactive" };
  }

  const entry = await prisma.activationCode.findUnique({
    where: { code: code.trim() },
  });
  if (!entry) return { ok: false as const, error: "Invalid code" };
  if (entry.used) return { ok: false as const, error: "Code already used" };
  if (entry.expiresAt < new Date())
    return { ok: false as const, error: "Code expired" };
  if (entry.licenseId !== license.id)
    return { ok: false as const, error: "Code does not match this license" };

  await prisma.activationCode.update({
    where: { id: entry.id },
    data: { used: true, usedAt: new Date() },
  });

  return {
    ok: true as const,
    email: entry.email,
    plan: license.plan?.name ?? "unknown",
    expiresAt: license.expiresAt?.toISOString() ?? null,
  };
}
