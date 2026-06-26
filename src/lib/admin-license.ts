import { addDays, uniqueLicenseKey } from "@/lib/license";
import { prisma } from "@/lib/prisma";

const DELETABLE_STATUSES = new Set(["REVOKED", "EXPIRED"]);

export function isLicenseDeletable(status: string, expiresAt: Date | null): boolean {
  if (DELETABLE_STATUSES.has(status)) return true;
  if (expiresAt && expiresAt.getTime() < Date.now()) return true;
  return false;
}

export async function clearLicenseMachineId(id: string) {
  return prisma.license.update({
    where: { id },
    data: { machineId: null },
  });
}

function daysUntilExpiry(expiresAt: Date | null): number {
  if (!expiresAt) return 365;
  const ms = expiresAt.getTime() - Date.now();
  return Math.max(1, Math.ceil(ms / 86400000));
}

/** Extend expiry and re-issue signed key so customer panels pick up the new date. */
export async function extendLicense(id: string, days: number) {
  const license = await prisma.license.findUnique({
    where: { id },
    include: { user: { select: { email: true } } },
  });
  if (!license) return null;

  const base =
    license.expiresAt && license.expiresAt.getTime() > Date.now()
      ? license.expiresAt
      : new Date();
  const expiresAt = addDays(base, days);
  const totalDays = daysUntilExpiry(expiresAt);

  const key = await uniqueLicenseKey(license.user.email, totalDays);

  return prisma.license.update({
    where: { id },
    data: {
      key,
      expiresAt,
      status: license.status === "EXPIRED" ? "ACTIVE" : license.status,
    },
    include: {
      user: { select: { email: true, name: true } },
      plan: { select: { name: true, slug: true } },
    },
  });
}

/** Reactivate and re-issue key with fresh 30-day window when expired. */
export async function reactivateLicense(id: string) {
  const license = await prisma.license.findUnique({
    where: { id },
    include: { user: { select: { email: true } } },
  });
  if (!license) return null;

  const expiresAt =
    license.expiresAt && license.expiresAt.getTime() > Date.now()
      ? license.expiresAt
      : addDays(new Date(), 30);

  const key = await uniqueLicenseKey(license.user.email, daysUntilExpiry(expiresAt));

  return prisma.license.update({
    where: { id },
    data: { status: "ACTIVE", expiresAt, key },
    include: {
      user: { select: { email: true, name: true } },
      plan: { select: { name: true, slug: true } },
    },
  });
}
