import { prisma } from "@/lib/prisma";
import { addDays } from "@/lib/license";
import { findOrCreateUser } from "@/lib/whmcs";
import type { LicenseStatus } from "@/generated/prisma/client";
import {
  bundleNameForProduct,
  bundleServicesForProduct,
  entitlementKeyForBundle,
  isBundleProductId,
} from "@/lib/bundle-entitlements";

function billingCycleToDays(cycle?: string): number {
  if (!cycle) return 30;
  const c = cycle.toLowerCase();
  if (c.includes("month")) return 30;
  if (c.includes("quarter")) return 90;
  if (c.includes("semi")) return 180;
  if (c.includes("annual") || c.includes("year")) return 365;
  if (c.includes("biennial")) return 730;
  return 30;
}

async function findPanelLicenseForEmail(email: string) {
  const normalized = email.toLowerCase().trim();
  return prisma.license.findFirst({
    where: {
      user: { email: normalized },
      status: { in: ["ACTIVE", "UNUSED"] },
    },
    orderBy: { createdAt: "desc" },
  });
}

function addonRowsForWhmcsService(serviceId: string) {
  return prisma.addonEntitlement.findMany({
    where: {
      OR: [{ whmcsServiceId: serviceId }, { whmcsServiceId: { startsWith: `${serviceId}:` } }],
    },
    include: { panelLicense: true },
  });
}

async function upsertBundleEntitlement(opts: {
  whmcsServiceId: string;
  service: string;
  email: string;
  userId: string | null;
  panelLicenseId: string | null;
  expiresAt: Date;
  notes: string;
}) {
  const existing = await prisma.addonEntitlement.findUnique({
    where: { whmcsServiceId: opts.whmcsServiceId },
  });
  if (existing) {
    return prisma.addonEntitlement.update({
      where: { id: existing.id },
      data: {
        status: "ACTIVE",
        expiresAt: opts.expiresAt,
        panelLicenseId: opts.panelLicenseId ?? existing.panelLicenseId,
        userId: opts.userId ?? existing.userId,
        notes: opts.notes,
      },
      include: { panelLicense: true },
    });
  }
  return prisma.addonEntitlement.create({
    data: {
      whmcsServiceId: opts.whmcsServiceId,
      service: opts.service,
      email: opts.email,
      userId: opts.userId,
      panelLicenseId: opts.panelLicenseId,
      status: "ACTIVE",
      expiresAt: opts.expiresAt,
      notes: opts.notes,
    },
    include: { panelLicense: true },
  });
}

export async function whmcsBundleProvision(params: {
  serviceId: string;
  productId: number;
  email: string;
  billingCycle?: string;
}) {
  const services = bundleServicesForProduct(params.productId);
  const bundleName = bundleNameForProduct(params.productId) ?? `Bundle ${params.productId}`;
  if (!services.length) {
    throw new Error(`No services mapped for bundle WHMCS product ID ${params.productId}`);
  }

  const user = await findOrCreateUser(params.email);
  const panelLicense = await findPanelLicenseForEmail(params.email);
  const expiresAt = addDays(new Date(), billingCycleToDays(params.billingCycle));
  const email = params.email.toLowerCase().trim();
  const existingRows = await addonRowsForWhmcsService(params.serviceId);
  const action = existingRows.length ? ("renewed" as const) : ("created" as const);

  const entitlements = [];
  for (const service of services) {
    const row = await upsertBundleEntitlement({
      whmcsServiceId: entitlementKeyForBundle(params.serviceId, service),
      service,
      email,
      userId: user?.id ?? null,
      panelLicenseId: panelLicense?.id ?? null,
      expiresAt,
      notes: `WHMCS ${action} bundle ${bundleName} (${params.serviceId})`,
    });
    entitlements.push(row);
  }

  return {
    action,
    entitlements,
    product: { name: bundleName, service: services.join(",") },
    bundleServices: services,
  };
}

export async function whmcsAddonProvision(params: {
  serviceId: string;
  productId: number;
  email: string;
  billingCycle?: string;
}) {
  if (isBundleProductId(params.productId)) {
    return whmcsBundleProvision(params);
  }

  const product = await prisma.addonProduct.findFirst({
    where: { whmcsProductId: params.productId, active: true },
  });
  if (!product) {
    throw new Error(`No addon product mapped to WHMCS product ID ${params.productId}`);
  }

  const user = await findOrCreateUser(params.email);
  const panelLicense = await findPanelLicenseForEmail(params.email);
  const expiresAt = addDays(new Date(), billingCycleToDays(params.billingCycle));

  const existing = await prisma.addonEntitlement.findUnique({
    where: { whmcsServiceId: params.serviceId },
  });

  if (existing) {
    const renewed = await prisma.addonEntitlement.update({
      where: { id: existing.id },
      data: {
        status: "ACTIVE",
        expiresAt,
        service: product.service,
        panelLicenseId: panelLicense?.id ?? existing.panelLicenseId,
        userId: user?.id ?? existing.userId,
        notes: `WHMCS renew service ${params.serviceId}`,
      },
      include: { panelLicense: true },
    });
    return { action: "renewed" as const, entitlement: renewed, product };
  }

  const entitlement = await prisma.addonEntitlement.create({
    data: {
      whmcsServiceId: params.serviceId,
      service: product.service,
      email: params.email.toLowerCase().trim(),
      userId: user?.id ?? null,
      panelLicenseId: panelLicense?.id ?? null,
      status: "ACTIVE",
      expiresAt,
      notes: `WHMCS provision service ${params.serviceId}`,
    },
    include: { panelLicense: true },
  });

  return { action: "created" as const, entitlement, product };
}

export async function whmcsAddonSuspend(serviceId: string) {
  const rows = await addonRowsForWhmcsService(serviceId);
  if (!rows.length) throw new Error("Addon entitlement not found for service");
  await prisma.addonEntitlement.updateMany({
    where: {
      OR: [{ whmcsServiceId: serviceId }, { whmcsServiceId: { startsWith: `${serviceId}:` } }],
    },
    data: { status: "SUSPENDED" },
  });
  return rows[0];
}

export async function whmcsAddonUnsuspend(serviceId: string) {
  const rows = await addonRowsForWhmcsService(serviceId);
  if (!rows.length) throw new Error("Addon entitlement not found for service");
  const now = new Date();
  for (const row of rows) {
    const status: LicenseStatus =
      row.expiresAt && row.expiresAt < now ? "EXPIRED" : "ACTIVE";
    await prisma.addonEntitlement.update({
      where: { id: row.id },
      data: { status },
    });
  }
  return rows[0];
}

export async function whmcsAddonTerminate(serviceId: string) {
  const rows = await addonRowsForWhmcsService(serviceId);
  if (!rows.length) throw new Error("Addon entitlement not found for service");
  await prisma.addonEntitlement.updateMany({
    where: {
      OR: [{ whmcsServiceId: serviceId }, { whmcsServiceId: { startsWith: `${serviceId}:` } }],
    },
    data: { status: "REVOKED", notes: `WHMCS terminated service ${serviceId}` },
  });
  return rows[0];
}

export function addonEntitlementPayload(
  entitlement: {
    id: string;
    service: string;
    status: string;
    expiresAt: Date | null;
    whmcsServiceId: string;
  },
  product: { name: string; service: string },
  extras?: { bundleServices?: string[] }
) {
  return {
    type: "addon" as const,
    addonId: entitlement.id,
    service: entitlement.service,
    productName: product.name,
    status: entitlement.status,
    expiresAt: entitlement.expiresAt?.toISOString() ?? null,
    whmcsServiceId: entitlement.whmcsServiceId,
    ...(extras?.bundleServices ? { bundleServices: extras.bundleServices } : {}),
  };
}
