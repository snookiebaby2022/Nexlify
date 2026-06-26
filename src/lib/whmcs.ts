import { prisma } from "@/lib/prisma";
import { addDays, generateLicenseKey } from "@/lib/license";
import { hashPassword } from "@/lib/auth";
import { planLimitsFromPlan } from "@/lib/licensing";
import { randomBytes } from "crypto";

async function uniqueKey(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const key = generateLicenseKey();
    const existing = await prisma.license.findUnique({ where: { key } });
    if (!existing) return key;
  }
  throw new Error("Failed to generate unique license key");
}

export async function findOrCreateUser(email: string, name?: string) {
  const normalized = email.toLowerCase().trim();
  const existing = await prisma.user.findUnique({ where: { email: normalized } });
  if (existing) return existing;

  const randomPass = randomBytes(24).toString("hex");
  return prisma.user.create({
    data: {
      email: normalized,
      name: name ?? null,
      passwordHash: await hashPassword(randomPass),
    },
  });
}

function billingCycleToDays(cycle?: string): number | null {
  if (!cycle) return null;
  const c = cycle.toLowerCase();
  if (c.includes("month")) return 30;
  if (c.includes("quarter")) return 90;
  if (c.includes("semi")) return 180;
  if (c.includes("annual") || c.includes("year")) return 365;
  if (c.includes("biennial")) return 730;
  if (c.includes("triennial")) return 1095;
  return null;
}

export async function whmcsProvision(params: {
  serviceId: string;
  productId: number;
  email: string;
  clientName?: string;
  billingCycle?: string;
}) {
  const plan = await prisma.plan.findFirst({
    where: { whmcsProductId: params.productId, active: true },
  });
  if (!plan) {
    throw new Error(`No plan mapped to WHMCS product ID ${params.productId}`);
  }

  const user = await findOrCreateUser(params.email, params.clientName);
  const existing = await prisma.license.findUnique({
    where: { whmcsServiceId: params.serviceId },
    include: { plan: true },
  });

  const extraDays = billingCycleToDays(params.billingCycle) ?? plan.durationDays;
  const expiresAt = addDays(new Date(), extraDays);

  if (existing) {
    const renewed = await prisma.license.update({
      where: { id: existing.id },
      data: {
        status: "UNUSED",
        expiresAt,
        planId: plan.id,
        maxLines: plan.maxLines,
        notes: `WHMCS renew service ${params.serviceId}`,
      },
      include: { plan: true },
    });
    return { action: "renewed" as const, license: renewed };
  }

  const key = await uniqueKey();
  const license = await prisma.license.create({
    data: {
      key,
      userId: user.id,
      planId: plan.id,
      whmcsServiceId: params.serviceId,
      status: "UNUSED",
      expiresAt,
      maxLines: plan.maxLines,
      notes: `WHMCS provision service ${params.serviceId}`,
    },
    include: { plan: true },
  });

  return { action: "created" as const, license };
}

export async function whmcsSuspend(serviceId: string) {
  const license = await prisma.license.findUnique({ where: { whmcsServiceId: serviceId } });
  if (!license) throw new Error("License not found for service");
  return prisma.license.update({
    where: { id: license.id },
    data: { status: "SUSPENDED" },
    include: { plan: true },
  });
}

export async function whmcsUnsuspend(serviceId: string) {
  const license = await prisma.license.findUnique({ where: { whmcsServiceId: serviceId } });
  if (!license) throw new Error("License not found for service");
  const status = license.expiresAt && license.expiresAt < new Date() ? "EXPIRED" : "UNUSED";
  return prisma.license.update({
    where: { id: license.id },
    data: { status },
    include: { plan: true },
  });
}

export async function whmcsTerminate(serviceId: string) {
  const license = await prisma.license.findUnique({ where: { whmcsServiceId: serviceId } });
  if (!license) throw new Error("License not found for service");
  return prisma.license.update({
    where: { id: license.id },
    data: { status: "REVOKED", notes: `WHMCS terminated service ${serviceId}` },
    include: { plan: true },
  });
}

export function licensePayload(license: {
  key: string;
  status: string;
  expiresAt: Date | null;
  maxLines: number;
  plan: {
    name: string;
    slug: string;
    maxServers: number;
    featuresJson?: string | null;
  };
}) {
  const limits = planLimitsFromPlan(license.plan as Parameters<typeof planLimitsFromPlan>[0]);
  return {
    licenseKey: license.key,
    status: license.status,
    expiresAt: license.expiresAt?.toISOString() ?? null,
    maxLines: license.maxLines,
    maxServers: limits.maxServers,
    planName: license.plan.name,
    planSlug: limits.planSlug,
    maxMainServers: limits.maxMainServers,
    maxLoadBalancers: limits.maxLoadBalancers,
    allPlugins: limits.allPlugins,
  };
}
