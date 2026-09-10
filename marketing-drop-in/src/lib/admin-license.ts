import { addDays } from "@/lib/license";
import { prisma } from "@/lib/prisma";
import { setLicenseServerExpiry, setLicenseServerStatus } from "@/lib/license-server-admin";
import { syncLicenseToPanel } from "@/lib/panel-sync";

export async function clearLicenseMachineId(id: string) {
  return prisma.license.update({
    where: { id },
    data: { machineId: null, panelHost: null },
  });
}

/** Extend expiry in place — keeps the same license key string. */
export async function extendLicense(
  id: string,
  days: number,
  opts?: { upgradePlanSlug?: string }
) {
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

  const data: {
    expiresAt: Date;
    status: string;
    planId?: string;
  } = {
    expiresAt,
    status: license.status === "EXPIRED" ? "ACTIVE" : license.status,
  };

  if (opts?.upgradePlanSlug) {
    const plan = await prisma.plan.findUnique({ where: { slug: opts.upgradePlanSlug } });
    if (plan) data.planId = plan.id;
  }

  const updated = await prisma.license.update({
    where: { id },
    data,
    include: {
      user: { select: { email: true, name: true } },
      plan: { select: { name: true, slug: true } },
    },
  });

  await setLicenseServerExpiry(updated.key, expiresAt);
  if (updated.status === "ACTIVE") {
    await setLicenseServerStatus(updated.key, "ACTIVE");
  }
  const sync = await syncLicenseToPanel(id, "REPLACE", { licenseKey: updated.key });
  return { license: updated, sync };
}

/** Reactivate expired license — same key, fresh 30-day window. */
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

  const updated = await prisma.license.update({
    where: { id },
    data: { status: "ACTIVE", expiresAt },
    include: {
      user: { select: { email: true, name: true } },
      plan: { select: { name: true, slug: true } },
    },
  });

  await setLicenseServerExpiry(updated.key, expiresAt);
  await setLicenseServerStatus(updated.key, "ACTIVE");
  const sync = await syncLicenseToPanel(id, "REPLACE", { licenseKey: updated.key });
  return { license: updated, sync };
}
