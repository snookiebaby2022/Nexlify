/** channelId on the hidden system stream used for Xtream API Live Connection rows. */
export const CATALOG_API_CHANNEL_MARKER = "__nexlify_xtream_api__";

export function isCatalogApiChannelId(channelId: string | null | undefined): boolean {
  return channelId === CATALOG_API_CHANNEL_MARKER;
}
