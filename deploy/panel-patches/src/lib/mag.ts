export function normalizeMac(mac: string): string {
  const hex = mac.replace(/[^a-fA-F0-9]/g, "").toUpperCase();
  if (hex.length !== 12) return mac.toUpperCase();
  return hex.match(/.{2}/g)!.join(":");
}

export function magPortalUrl(baseUrl: string) {
  return `${baseUrl}/c/`;
}
