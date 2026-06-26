import { BUNDLE_CATALOG } from "@/lib/bundle-catalog";
import { ADDON_CATALOG } from "@/lib/addon-catalog";

const SERVICE_BY_PRODUCT = new Map(
  ADDON_CATALOG.map((a) => [a.whmcsProductId, a.service] as const)
);

/** WHMCS bundle product ID → panel plugin services to enable. */
export const BUNDLE_WHMCS_SERVICES: Record<number, string[]> = Object.fromEntries(
  BUNDLE_CATALOG.map((b) => [
    b.whmcsProductId,
    b.includes
      .map((label) => {
        const match = ADDON_CATALOG.find(
          (a) =>
            a.name.replace(/ Plugin$/, "") === label ||
            a.name === label ||
            a.service === label.toLowerCase().replace(/\s+/g, "_")
        );
        return match?.service;
      })
      .filter((s): s is string => Boolean(s)),
  ])
);

export function isBundleProductId(productId: number): boolean {
  return productId in BUNDLE_WHMCS_SERVICES;
}

export function bundleServicesForProduct(productId: number): string[] {
  return BUNDLE_WHMCS_SERVICES[productId] ?? [];
}

export function bundleNameForProduct(productId: number): string | null {
  return BUNDLE_CATALOG.find((b) => b.whmcsProductId === productId)?.name ?? null;
}

export function entitlementKeyForBundle(serviceId: string, service: string): string {
  return `${serviceId}:${service}`;
}

export function serviceFromProductId(productId: number): string | null {
  return SERVICE_BY_PRODUCT.get(productId) ?? null;
}
