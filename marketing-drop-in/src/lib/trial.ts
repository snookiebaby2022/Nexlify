import { prisma } from "@/lib/prisma";
import { addDays, uniqueLicenseKey } from "@/lib/license";
import { TRIAL_PLAN_SLUG } from "@/lib/plans";

export { TRIAL_PLAN_SLUG };
export const TRIAL_DURATION_DAYS = 7;
export const DEFAULT_TRIAL_PROMO_CODE = "XSTR-TRIAL-7DAY-NXLF";

export function getTrialPromoCode(): string {
  return (
    process.env.TRIAL_PROMO_CODE?.trim().toUpperCase() ||
    DEFAULT_TRIAL_PROMO_CODE
  );
}

async function uniqueKeyForUser(email: string, days: number): Promise<string> {
  return uniqueLicenseKey(email, days);
}

export async function getTrialPlan() {
  return prisma.plan.findFirst({
    where: { slug: TRIAL_PLAN_SLUG, active: true },
  });
}

export async function userHasTrialOrPaidLicense(userId: string): Promise<boolean> {
  const count = await prisma.license.count({
    where: {
      userId,
      status: { in: ["ACTIVE", "UNUSED"] },
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
  });
  return count > 0;
}

export async function userAlreadyUsedTrial(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { trialBypass: true },
  });
  if (user?.trialBypass) return false;

  const trial = await getTrialPlan();
  if (!trial) return false;
  const count = await prisma.license.count({
    where: { userId, planId: trial.id },
  });
  return count > 0;
}

/** Delete all trial licenses for a user so they can start a fresh trial. */
export async function resetTrialEligibility(userId: string): Promise<number> {
  const trial = await getTrialPlan();
  if (!trial) return 0;

  const trialLicenses = await prisma.license.findMany({
    where: { userId, planId: trial.id },
    select: { id: true, orderId: true },
  });

  for (const lic of trialLicenses) {
    await prisma.addonEntitlement.updateMany({
      where: { panelLicenseId: lic.id },
      data: { panelLicenseId: null },
    });
    await prisma.license.delete({ where: { id: lic.id } });
    if (lic.orderId) {
      await prisma.order.delete({ where: { id: lic.orderId } }).catch(() => {});
    }
  }

  return trialLicenses.length;
}

export async function getActiveTrialLicense(userId: string) {
  const plan = await getTrialPlan();
  if (!plan) return null;
  return prisma.license.findFirst({
    where: {
      userId,
      planId: plan.id,
      status: { in: ["ACTIVE", "UNUSED"] },
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    include: { plan: true },
    orderBy: { createdAt: "desc" },
  });
}

/** Issue a personal 7-day trial license (one per account). Returns existing if still valid. */
export async function issueTrialLicense(userId: string) {
  const plan = await getTrialPlan();
  if (!plan) throw new Error("Trial plan is not available");

  const existing = await getActiveTrialLicense(userId);
  if (existing) return existing;

  if (await userAlreadyUsedTrial(userId)) {
    throw new Error("You have already used your free trial");
  }

  const days = plan.durationDays || TRIAL_DURATION_DAYS;
  const expiresAt = addDays(new Date(), days);

  const order = await prisma.order.create({
    data: {
      userId,
      planId: plan.id,
      amountCents: 0,
      status: "COMPLETED",
    },
  });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });
  if (!user) throw new Error("User not found");

  const key = await uniqueKeyForUser(user.email, days);

  const license = await prisma.license.create({
    data: {
      key,
      userId,
      planId: plan.id,
      orderId: order.id,
      status: "ACTIVE",
      expiresAt,
      maxLines: plan.maxLines,
      notes: `Free ${days}-day trial — expires ${expiresAt.toISOString()}`,
    },
    include: { plan: true },
  });

  return license;
}

export function trialLicensePayload(license: {
  key: string;
  expiresAt: Date | null;
}) {
  return {
    key: license.key,
    expiresAt: license.expiresAt?.toISOString() ?? null,
  };
}
