export type OperatorFeature = {
  label: string;
  href: string;
  group: string;
  aliases: string[];
};

/** Searchable map so operators can find XUI / 1-Stream names for Nexlify pages. */
export const OPERATOR_FEATURES: OperatorFeature[] = [
  { label: "Find a feature", href: "/admin/find", group: "Help", aliases: ["search", "where is", "index"] },
  { label: "Add line", href: "/admin/lines/add", group: "Lines", aliases: ["create user", "subscription", "xtream line"] },
  { label: "Manage lines", href: "/admin/lines", group: "Lines", aliases: ["users", "accounts", "expiring"] },
  { label: "Live connections", href: "/admin/connections", group: "Lines", aliases: ["who is watching", "kick", "online"] },
  { label: "Disable trials", href: "/admin/settings/general", group: "Lines", aliases: ["24 hours", "48 hours", "trial"] },
  { label: "Capture card / CCTV", href: "/admin/streams/capture", group: "Live", aliases: ["hdmi", "v4l2", "dshow", "ingest", "xui capture"] },
  { label: "Add stream", href: "/admin/streams/add", group: "Live", aliases: ["channel", "m3u"] },
  { label: "Import M3U", href: "/admin/import/m3u", group: "Live", aliases: ["playlist", "provider"] },
  { label: "On-video overlay", href: "/admin/settings/fingerprint", group: "Security", aliases: ["watermark", "fingerprint overlay", "drawtext", "1-stream fingerprint"] },
  { label: "Playback fingerprint", href: "/admin/settings/fingerprint", group: "Security", aliases: ["hmac url", "leak"] },
  { label: "VPN / proxy block", href: "/admin/settings/security-shield", group: "Security", aliases: ["datacenter", "tor", "ipqs", "autoblock"] },
  { label: "Blocked IPs", href: "/admin/management/blocked-ips", group: "Security", aliases: ["cidr", "blacklist"] },
  { label: "Admin API", href: "/admin/settings/api", group: "Billing", aliases: ["xui api", "create_line", "api_key", "hmac"] },
  { label: "Reseller rewards", href: "/admin/settings/billing", group: "Resellers", aliases: ["cashback", "reward plugin", "credit rebate"] },
  { label: "Customer shop", href: "/admin/shop", group: "Resellers", aliases: ["storefront", "stripe", "paypal"] },
  { label: "Rclone / S3 VOD", href: "/admin/settings/vod-storage", group: "VOD", aliases: ["gdrive", "remote library"] },
  { label: "Multi-view player", href: "/admin/player/multiview", group: "Player", aliases: ["multi stream", "grid", "1-stream player"] },
  { label: "Web player", href: "/webplayer", group: "Player", aliases: ["watch in browser"] },
  { label: "Load balancer", href: "/admin/servers/load-balancer", group: "Servers", aliases: ["lb", "geo", "proxy"] },
  { label: "Diagnostics", href: "/admin/diagnostics", group: "Diagnostics", aliases: ["fix", "recover", "probe", "reboot", "health", "lb recover"] },
  { label: "Stream errors", href: "/admin/content/streams?status=offline", group: "Diagnostics", aliases: ["down streams", "dead links", "offline channels", "probe failed"] },
  { label: "Proxies", href: "/admin/servers/proxies", group: "Servers", aliases: ["edge", "1-stream proxies"] },
  { label: "Transcoding", href: "/admin/streaming/transcoding", group: "Servers", aliases: ["nvenc", "ffmpeg", "gpu"] },
  { label: "Archive / catch-up", href: "/admin/settings/catchup", group: "Live", aliases: ["timeshift", "dvr", "time machine"] },
  { label: "Panel migration", href: "/admin/import/migrate", group: "Tools", aliases: ["xui import", "1-stream import"] },
  { label: "Plex importer", href: "/admin/integrations/plex", group: "Addons", aliases: ["emby", "jellyfin"] },
  { label: "2FA", href: "/admin/settings/security", group: "Security", aliases: ["totp", "authenticator"] },
  { label: "Generate reseller logins", href: "/admin/settings/security", group: "Security", aliases: ["auto username"] },
];

export function searchOperatorFeatures(query: string): OperatorFeature[] {
  const q = query.trim().toLowerCase();
  if (!q) return OPERATOR_FEATURES;
  return OPERATOR_FEATURES.filter((f) => {
    const hay = [f.label, f.group, f.href, ...f.aliases].join(" ").toLowerCase();
    return hay.includes(q);
  });
}
