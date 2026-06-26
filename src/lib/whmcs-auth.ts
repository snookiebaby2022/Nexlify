import { site } from "@/lib/site";

export function requireWhmcsApiKey(request: Request): boolean {
  const expected = process.env.WHMCS_API_SECRET;
  if (!expected) return false;
  const provided =
    request.headers.get("x-whmcs-api-key") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return provided === expected;
}

/** WHMCS billing root, e.g. https://billing.example.com */
export function getWhmcsBillingOrigin(baseUrl?: string | null): string | null {
  const cart = baseUrl ?? process.env.NEXT_PUBLIC_WHMCS_URL;
  if (!cart) return null;
  try {
    const url = new URL(cart);
    return url.origin;
  } catch {
    return null;
  }
}

/** Post-checkout landing page on the marketing site (public, no login required). */
export function getWhmcsReturnUrl(): string {
  return `${site.url}/order/success`;
}

function appendWhmcsReturnUrl(url: string): string {
  const parsed = new URL(url);
  parsed.searchParams.set("returnurl", getWhmcsReturnUrl());
  return parsed.toString();
}

/** Legacy cart add — works when product slugs are set in WHMCS. */
export function getWhmcsCartUrl(
  productId: number,
  baseUrl?: string | null,
): string | null {
  const base = baseUrl ?? process.env.NEXT_PUBLIC_WHMCS_URL;
  if (!base) return null;
  const url = new URL(base);
  url.searchParams.set("a", "add");
  url.searchParams.set("pid", String(productId));
  return appendWhmcsReturnUrl(url.toString());
}

/** Direct WHMCS store product URL (preferred when group + slug are configured). */
export function getWhmcsStoreProductUrl(
  storeGroup: string,
  storeSlug: string,
  baseUrl?: string | null,
): string | null {
  const origin = getWhmcsBillingOrigin(baseUrl);
  if (!origin || !storeGroup || !storeSlug) return null;
  return appendWhmcsReturnUrl(`${origin}/index.php?rp=/store/${storeGroup}/${storeSlug}`);
}

export function getWhmcsOrderUrl(
  productId: number,
  opts?: { storeGroup?: string; storeSlug?: string; baseUrl?: string | null },
): string | null {
  const base = opts?.baseUrl ?? process.env.NEXT_PUBLIC_WHMCS_URL ?? null;
  // Prefer WHMCS store product URL — opens the correct product checkout (tblproducts_slugs).
  if (opts?.storeGroup && opts?.storeSlug) {
    const store = getWhmcsStoreProductUrl(opts.storeGroup, opts.storeSlug, base);
    if (store) return store;
  }
  return getWhmcsCartUrl(productId, base);
}

const PLAN_STORE: Record<number, { group: string; slug: string }> = {
  1: { group: "nexlify", slug: "starter-package" },
  2: { group: "nexlify", slug: "main-package" },
  3: { group: "nexlify", slug: "top-tier" },
};

export function getWhmcsPlanOrderUrl(
  productId: number,
  baseUrl?: string | null,
): string | null {
  const store = PLAN_STORE[productId];
  return getWhmcsOrderUrl(productId, {
    storeGroup: store?.group,
    storeSlug: store?.slug,
    baseUrl,
  });
}
