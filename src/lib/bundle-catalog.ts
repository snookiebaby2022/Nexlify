/** WHMCS bundle products (IDs 14–16) — panel-plugins store group. */
export type BundleCatalogItem = {
  id: string;
  name: string;
  description: string;
  includes: string[];
  whmcsProductId: number;
  priceCents: number;
  storeGroup: string;
  storeSlug: string;
  badge?: string;
};

export const BUNDLE_CATALOG: BundleCatalogItem[] = [
  {
    id: "media-pack",
    name: "Media Pack",
    description: "Stream movies and series from Plex, Emby, and Jellyfin — one subscription, three libraries.",
    includes: ["Plex", "Emby", "Jellyfin"],
    whmcsProductId: 14,
    priceCents: 4500,
    storeGroup: "panel-plugins",
    storeSlug: "media-pack",
    badge: "Save ~£8/mo vs separate",
  },
  {
    id: "music-pack",
    name: "Music Pack",
    description: "Bring music and video content onto your lines — YouTube, Spotify, Apple Music, Deezer & more.",
    includes: ["YouTube", "Spotify", "Apple Music", "Deezer", "YouTube Music"],
    whmcsProductId: 15,
    priceCents: 3500,
    storeGroup: "panel-plugins",
    storeSlug: "music-pack",
    badge: "Most popular add-on",
  },
  {
    id: "full-plugin-pack",
    name: "Full Plugin Pack",
    description: "Unlock the full integration suite — media servers, music, and analytics in one go.",
    includes: [
      "Plex",
      "Emby",
      "Jellyfin",
      "YouTube",
      "Spotify",
      "Apple Music",
      "Deezer",
      "YouTube Music",
      "Statistics",
    ],
    whmcsProductId: 16,
    priceCents: 9900,
    storeGroup: "panel-plugins",
    storeSlug: "full-plugin-pack",
    badge: "Everything except Top Tier",
  },
];
