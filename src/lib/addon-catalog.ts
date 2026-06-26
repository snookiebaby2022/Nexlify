/** Display + WHMCS store metadata for panel plugins (prices match billing GBP monthly). */
export type AddonCatalogItem = {
  service: string;
  name: string;
  description: string;
  whmcsProductId: number;
  priceCents: number;
  storeGroup: string;
  storeSlug: string;
};

export const ADDON_CATALOG: AddonCatalogItem[] = [
  {
    service: "plex",
    name: "Plex Plugin",
    description: "Import your Plex library as streamable movies and series on your panel.",
    whmcsProductId: 4,
    priceCents: 2000,
    storeGroup: "panel-plugins",
    storeSlug: "plex-plugin",
  },
  {
    service: "emby",
    name: "Emby Plugin",
    description: "Sync Emby movies and shows into bouquets your subscribers can browse.",
    whmcsProductId: 5,
    priceCents: 1800,
    storeGroup: "panel-plugins",
    storeSlug: "emby-plugin",
  },
  {
    service: "jellyfin",
    name: "Jellyfin Plugin",
    description: "Self-hosted Jellyfin libraries, imported as panel streams.",
    whmcsProductId: 6,
    priceCents: 1500,
    storeGroup: "panel-plugins",
    storeSlug: "jellyfin-plugin",
  },
  {
    service: "youtube",
    name: "YouTube Plugin",
    description: "Pull YouTube channels and videos onto your lines as live content.",
    whmcsProductId: 7,
    priceCents: 1200,
    storeGroup: "panel-plugins",
    storeSlug: "youtube-plugin",
  },
  {
    service: "spotify",
    name: "Spotify Plugin",
    description: "Turn Spotify playlists into tune-in channels for your subscribers.",
    whmcsProductId: 8,
    priceCents: 1000,
    storeGroup: "panel-plugins",
    storeSlug: "spotify-plugin",
  },
  {
    service: "apple_music",
    name: "Apple Music Plugin",
    description: "Import Apple Music playlists and stream them through your panel.",
    whmcsProductId: 9,
    priceCents: 1000,
    storeGroup: "panel-plugins",
    storeSlug: "apple-music-plugin",
  },
  {
    service: "deezer",
    name: "Deezer Plugin",
    description: "Import Deezer playlists as tune-in channels — full tracks via music relay.",
    whmcsProductId: 10,
    priceCents: 800,
    storeGroup: "panel-plugins",
    storeSlug: "deezer-plugin",
  },
  {
    service: "youtube_music",
    name: "YouTube Music Plugin",
    description: "YouTube Music content on your lines — great for music-focused bouquets.",
    whmcsProductId: 11,
    priceCents: 1000,
    storeGroup: "panel-plugins",
    storeSlug: "youtube-music-plugin",
  },
  {
    service: "statistics",
    name: "Statistics Plugin",
    description: "Real-time usage stats so you know what your subscribers are watching.",
    whmcsProductId: 12,
    priceCents: 800,
    storeGroup: "panel-plugins",
    storeSlug: "statistics-plugin",
  },
];
