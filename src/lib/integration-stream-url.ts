export const NEXLIFY_INTEGRATION = "nexlify://";

export function buildIntegrationStreamUrl(
  type: string,
  integrationId: string,
  itemId: string
): string {
  return `${NEXLIFY_INTEGRATION}${type}/${integrationId}/${encodeURIComponent(itemId)}`;
}

export function parseIntegrationStreamUrl(
  url: string
): { type: string; integrationId: string; itemId: string } | null {
  if (!url.startsWith(NEXLIFY_INTEGRATION)) return null;
  const rest = url.slice(NEXLIFY_INTEGRATION.length);
  const slash = rest.indexOf("/");
  if (slash < 0) return null;
  const type = rest.slice(0, slash);
  const afterType = rest.slice(slash + 1);
  const slash2 = afterType.indexOf("/");
  if (slash2 < 0) return null;
  const integrationId = afterType.slice(0, slash2);
  const itemId = decodeURIComponent(afterType.slice(slash2 + 1));
  if (!type || !integrationId || !itemId) return null;
  return { type, integrationId, itemId };
}

export function isIntegrationStreamUrl(url: string): boolean {
  return url.startsWith(NEXLIFY_INTEGRATION);
}
