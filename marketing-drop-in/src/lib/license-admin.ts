import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { clearLicenseServerBinding } from "@/lib/license-server-admin";
import { syncLicenseToPanel } from "@/lib/panel-sync";
import { TRIAL_PLAN_SLUG } from "@/lib/plans";
import { isLicenseDeletable } from "@/lib/license-deletable";

export { isLicenseDeletable } from "@/lib/license-deletable";

export async function deleteLicensesSafely(
  ids: string[],
  opts: {
    adminId?: string;
    adminEmail?: string;
    skipDeletableCheck?: boolean;
  } = {}
): Promise<{ deleted: number; skipped: number; errors: string[] }> {
  if (!ids.length) return { deleted: 0, skipped: 0, errors: [] };

  const uniqueIds = [...new Set(ids)];
  const licenses = await prisma.license.findMany({
    where: { id: { in: uniqueIds } },
    include: { plan: { select: { slug: true, name: true } } },
  });

  let deleted = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const lic of licenses) {
    if (!opts.skipDeletableCheck && !isLicenseDeletable(lic)) {
      skipped++;
      continue;
    }

    try {
      if (lic.panelUrl) {
        await syncLicenseToPanel(lic.id, "DELETE").catch(() => {});
      }
      await clearLicenseServerBinding(lic.key).catch(() => {});

      await prisma.activationCode.deleteMany({ where: { licenseId: lic.id } });
      await prisma.addonEntitlement.updateMany({
        where: { panelLicenseId: lic.id },
        data: { panelLicenseId: null },
      });

      const orderId = lic.orderId;
      await prisma.license.delete({ where: { id: lic.id } });
      if (orderId) {
        await prisma.order.delete({ where: { id: orderId } }).catch(() => {});
      }

      if (opts.adminEmail) {
        await logAudit({
          userId: opts.adminId,
          email: opts.adminEmail,
          action: "license_delete",
          detail: `${lic.key} (${lic.plan.slug}, was ${lic.status})`,
        });
      }

      deleted++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Delete failed";
      errors.push(`${lic.key}: ${msg}`);
    }
  }

  return { deleted, skipped, errors };
}

/** All ended trial licenses eligible for cleanup. */
export async function findBulkDeletableTrialIds(): Promise<string[]> {
  const now = new Date();
  const rows = await prisma.license.findMany({
    where: {
      plan: { slug: TRIAL_PLAN_SLUG },
      OR: [
        { status: { in: ["REVOKED", "EXPIRED", "UNUSED"] } },
        { expiresAt: { lt: now } },
      ],
    },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}
