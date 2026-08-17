/** Bump when logo/favicon files change — busts Cloudflare/browser cache on static icons. */
export const BRAND_ASSET_VERSION = "20260817";

export function brandAssetUrl(path: string): string {
  const base = path.startsWith("/") ? path : `/${path}`;
  return `${base}?v=${BRAND_ASSET_VERSION}`;
}
