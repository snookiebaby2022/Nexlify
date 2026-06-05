export const CONTENT_FOLDER_SLUGS = [
  "created",
  "video",
  "archive",
  "delayed",
  "epg",
  "playlists",
  "streams",
  "vod",
] as const;

export type ContentFolderSlug = (typeof CONTENT_FOLDER_SLUGS)[number];

export type ContentFolderDef = {
  slug: ContentFolderSlug;
  title: string;
  description: string;
  adminRedirect?: string;
  resellerRedirect?: string;
};

export const CONTENT_FOLDERS: ContentFolderDef[] = [
  {
    slug: "streams",
    title: "Streams",
    description: "Live TV channels and stream sources.",
    adminRedirect: "/admin/servers/streams",
    resellerRedirect: "/reseller/streams",
  },
  {
    slug: "vod",
    title: "VOD",
    description: "Movies and series on demand.",
    adminRedirect: "/admin/content/vod",
    resellerRedirect: "/reseller/content/vod",
  },
  {
    slug: "epg",
    title: "EPG",
    description: "Electronic program guide sources and channel mapping.",
    adminRedirect: "/admin/epg",
    resellerRedirect: "/reseller/content/epg",
  },
  {
    slug: "playlists",
    title: "Playlists",
    description: "M3U playlists and imported channel lists.",
    adminRedirect: "/admin/import/m3u",
    resellerRedirect: "/reseller/content/playlists",
  },
  {
    slug: "created",
    title: "Created",
    description: "Panel-created channels and custom entries.",
  },
  {
    slug: "video",
    title: "Video",
    description: "Video files and direct video sources.",
  },
  {
    slug: "archive",
    title: "Archive",
    description: "Archived streams and retired content.",
  },
  {
    slug: "delayed",
    title: "Delayed",
    description: "Scheduled and time-shifted content.",
  },
];

export function getContentFolder(slug: string): ContentFolderDef | undefined {
  return CONTENT_FOLDERS.find((f) => f.slug === slug);
}

export function contentFolderHref(panel: "admin" | "reseller", slug: ContentFolderSlug) {
  return `/${panel}/content/${slug}`;
}
