/** XUI-style admin module slugs → Nexlify routes or stub metadata */

export type AdminModuleDef = {
  slug: string;
  title: string;
  category: string;
  /** If set, /admin/{slug} redirects here */
  redirect?: string;
  description?: string;
};

export const XUI_ADMIN_MODULES: AdminModuleDef[] = [
  { slug: "index", title: "Dashboard", category: "Core", redirect: "/admin/dashboard" },
  { slug: "dashboard", title: "Dashboard", category: "Core", redirect: "/admin/dashboard" },

  { slug: "bouquets", title: "Bouquets", category: "Bouquets", redirect: "/admin/bouquets" },
  { slug: "bouquet", title: "Add bouquet", category: "Bouquets", redirect: "/admin/bouquets/add" },
  { slug: "bouquet_order", title: "Bouquet order", category: "Bouquets", redirect: "/admin/bouquets/order" },
  { slug: "bouquet_sort", title: "Bouquet sort", category: "Bouquets", redirect: "/admin/bouquets/order" },

  { slug: "lines", title: "Lines", category: "Lines", redirect: "/admin/lines" },
  { slug: "line", title: "Add line", category: "Lines", redirect: "/admin/lines/add" },
  { slug: "line_mass", title: "Mass edit lines", category: "Lines", redirect: "/admin/lines/mass-edit" },
  { slug: "line_activity", title: "Line activity", category: "Lines", redirect: "/admin/line_activity" },
  { slug: "line_ips", title: "Line IPs", category: "Lines", redirect: "/admin/lines" },

  { slug: "users", title: "Users", category: "Users", redirect: "/admin/resellers" },
  { slug: "user", title: "Add user", category: "Users", redirect: "/admin/resellers/add" },
  { slug: "user_mass", title: "Mass edit users", category: "Users", redirect: "/admin/management/mass-edit/users" },
  { slug: "user_logs", title: "User logs", category: "Users", redirect: "/admin/management/logs" },
  { slug: "profiles", title: "Profiles", category: "Users", description: "Stalker / device profiles." },
  { slug: "profile", title: "My profile", category: "Account", redirect: "/admin/profile" },
  { slug: "edit_profile", title: "Edit profile", category: "Account", redirect: "/admin/profile" },

  { slug: "streams", title: "Streams", category: "Streams", redirect: "/admin/servers/streams" },
  { slug: "stream", title: "Add stream", category: "Streams", redirect: "/admin/streams/add" },
  { slug: "stream_mass", title: "Mass edit streams", category: "Streams", redirect: "/admin/management/mass-edit/streams" },
  { slug: "stream_tools", title: "Stream tools", category: "Streams", redirect: "/admin/management/tools/stream-tools" },
  { slug: "stream_view", title: "Stream view", category: "Streams", redirect: "/admin/servers/streams" },
  { slug: "stream_categories", title: "Stream categories", category: "Streams", redirect: "/admin/management/categories" },
  { slug: "stream_category", title: "Stream category", category: "Streams", redirect: "/admin/management/categories" },
  { slug: "stream_errors", title: "Stream errors", category: "Streams", redirect: "/admin/stream_errors" },
  { slug: "stream_rank", title: "Stream rank", category: "Streams", description: "Popularity ranking for channels." },
  { slug: "stream_review", title: "Stream review", category: "Streams", description: "Review queue before publishing." },
  { slug: "channel_order", title: "Channel order", category: "Streams", redirect: "/admin/management/tools/channel-order" },

  { slug: "movies", title: "Movies", category: "VOD", redirect: "/admin/content/movies" },
  { slug: "movie", title: "Add movie", category: "VOD", redirect: "/admin/content/movies/add" },
  { slug: "movie_mass", title: "Mass edit movies", category: "VOD", redirect: "/admin/management/mass-edit/movies" },

  { slug: "series", title: "Series", category: "VOD", redirect: "/admin/content/series" },
  { slug: "serie", title: "Add series", category: "VOD", redirect: "/admin/content/series/add" },
  { slug: "series_mass", title: "Mass edit series", category: "VOD", redirect: "/admin/management/mass-edit/series" },
  { slug: "episodes", title: "Episodes", category: "VOD", redirect: "/admin/management/mass-edit/episodes" },
  { slug: "episode", title: "Episode", category: "VOD", redirect: "/admin/management/mass-edit/episodes" },
  { slug: "episodes_mass", title: "Mass edit episodes", category: "VOD", redirect: "/admin/management/mass-edit/episodes" },

  { slug: "servers", title: "Servers", category: "Servers", redirect: "/admin/servers" },
  { slug: "server", title: "Add server", category: "Servers", redirect: "/admin/servers/add" },
  { slug: "server_order", title: "Server order", category: "Servers", redirect: "/admin/servers" },
  { slug: "server_view", title: "Server view", category: "Servers", redirect: "/admin/servers" },
  { slug: "server_install", title: "Server install wizard", category: "Servers", redirect: "/admin/servers/install" },
  { slug: "proxies", title: "Proxies", category: "Servers", redirect: "/admin/servers/proxies" },
  { slug: "proxy", title: "Add proxy", category: "Servers", redirect: "/admin/servers/proxies" },

  { slug: "providers", title: "Stream providers", category: "Sources", redirect: "/admin/management/stream-providers" },
  { slug: "provider", title: "Add provider", category: "Sources", redirect: "/admin/management/stream-providers" },

  { slug: "epg", title: "EPG", category: "EPG", redirect: "/admin/epg" },
  { slug: "epgs", title: "EPG sources", category: "EPG", redirect: "/admin/epg/sources" },
  { slug: "epg_view", title: "EPG view", category: "EPG", redirect: "/admin/epg/sources" },

  { slug: "mag", title: "MAG devices", category: "Devices", redirect: "/admin/mag" },
  { slug: "mags", title: "MAG list", category: "Devices", redirect: "/admin/mag" },
  { slug: "mag_mass", title: "MAG bulk", category: "Devices", redirect: "/admin/mag/bulk" },
  { slug: "mag_events", title: "MAG events", category: "Devices", description: "STB event log." },
  { slug: "enigma", title: "Enigma", category: "Devices", redirect: "/admin/enigmas" },
  { slug: "enigmas", title: "Enigma devices", category: "Devices", redirect: "/admin/enigmas" },
  { slug: "enigma_mass", title: "Enigma bulk", category: "Devices", redirect: "/admin/enigmas" },

  { slug: "tickets", title: "Tickets", category: "Support", redirect: "/admin/tickets" },
  { slug: "ticket", title: "Create ticket", category: "Support", redirect: "/admin/tickets/new" },
  { slug: "ticket_view", title: "Ticket view", category: "Support", redirect: "/admin/tickets" },

  { slug: "packages", title: "Packages", category: "System", redirect: "/admin/management/packages" },
  { slug: "package", title: "Package", category: "System", redirect: "/admin/management/packages" },
  { slug: "groups", title: "Manage groups", category: "System", redirect: "/admin/management/groups" },
  { slug: "group", title: "Add group", category: "System", redirect: "/admin/management/groups/add" },

  { slug: "settings", title: "Settings", category: "Settings", redirect: "/admin/settings" },
  { slug: "cache", title: "Cache", category: "Settings", redirect: "/admin/settings/cache" },
  { slug: "backups", title: "Backups", category: "Settings", redirect: "/admin/settings/backup" },
  { slug: "session", title: "Sessions", category: "Settings", redirect: "/admin/settings/security" },
  { slug: "settings_watch", title: "Watch folder settings", category: "Settings", redirect: "/admin/watch-folders" },
  { slug: "settings_plex", title: "Plex settings", category: "Settings", description: "Plex library integration." },
  { slug: "setup", title: "Setup wizard", category: "Settings", description: "First-run panel setup." },
  { slug: "license", title: "License", category: "Settings", redirect: "/admin/license" },
  { slug: "license_info", title: "License info", category: "Settings", redirect: "/admin/license" },

  { slug: "asns", title: "Blocked ASNs", category: "Blocking", redirect: "/admin/management/blocked-asns" },
  { slug: "ip", title: "Blocked IP", category: "Blocking", redirect: "/admin/management/blocked-ips" },
  { slug: "ips", title: "Blocked IPs", category: "Blocking", redirect: "/admin/management/blocked-ips" },
  { slug: "isp", title: "Blocked ISP", category: "Blocking", redirect: "/admin/management/blocked-isps" },
  { slug: "isps", title: "Blocked ISPs", category: "Blocking", redirect: "/admin/management/blocked-isps" },
  { slug: "useragent", title: "Blocked user agent", category: "Blocking", redirect: "/admin/management/blocked-user-agents" },
  { slug: "useragents", title: "Blocked user agents", category: "Blocking", redirect: "/admin/management/blocked-user-agents" },
  { slug: "rtmp_ip", title: "RTMP IP", category: "Blocking", redirect: "/admin/management/rtmp-ips" },
  { slug: "rtmp_ips", title: "RTMP IPs", category: "Blocking", redirect: "/admin/management/rtmp-ips" },
  { slug: "rtmp_monitor", title: "RTMP monitor", category: "Blocking", description: "Live RTMP publish monitor." },

  { slug: "fingerprint", title: "Fingerprint", category: "Tools", redirect: "/admin/management/tools/fingerprint" },
  { slug: "mass_delete", title: "Mass delete", category: "Tools", redirect: "/admin/management/tools/mass-delete" },
  { slug: "quick_tools", title: "Quick tools", category: "Tools", redirect: "/admin/management/tools" },

  { slug: "credit_logs", title: "Credit logs", category: "Logs", redirect: "/admin/resellers/credits" },
  { slug: "panel_logs", title: "Panel logs", category: "Logs", redirect: "/admin/management/logs" },
  { slug: "client_logs", title: "Client logs", category: "Logs", description: "Player / app client logs." },
  { slug: "restream_logs", title: "Restream logs", category: "Logs", description: "Restream detection log." },
  { slug: "login_logs", title: "Login logs", category: "Logs", description: "Panel login attempts." },
  { slug: "mysql_syslog", title: "MySQL syslog", category: "Logs", description: "Database syslog." },

  { slug: "live_connections", title: "Live connections", category: "Monitor", redirect: "/admin/connections" },
  { slug: "process_monitor", title: "Process monitor", category: "Monitor", redirect: "/admin/process_monitor" },
  { slug: "theft_detection", title: "Theft detection", category: "Monitor", redirect: "/admin/theft_detection" },

  { slug: "watch", title: "Watch folders", category: "Import", redirect: "/admin/watch-folders" },
  { slug: "watch_add", title: "Add watch folder", category: "Import", redirect: "/admin/watch-folders" },
  { slug: "watch_output", title: "Watch output", category: "Import", description: "Watch folder scan output." },
  { slug: "ondemand", title: "On demand", category: "Import", description: "On-demand scan jobs." },
  { slug: "queue", title: "Queue", category: "Import", redirect: "/admin/queue" },

  { slug: "created_channels", title: "Created channels", category: "Channels", redirect: "/admin/created_channels" },
  { slug: "created_channel", title: "Created channel", category: "Channels", redirect: "/admin/created_channels" },
  { slug: "created_channel_mass", title: "Created channels mass", category: "Channels", redirect: "/admin/created_channels" },

  { slug: "radio", title: "Radio", category: "Radio", redirect: "/admin/radios" },
  { slug: "radios", title: "Radios", category: "Radio", redirect: "/admin/radios" },
  { slug: "radio_mass", title: "Radio mass", category: "Radio", redirect: "/admin/radios" },

  { slug: "plex", title: "Plex", category: "Integrations", redirect: "/admin/integrations/plex" },
  { slug: "plex_add", title: "Add Plex", category: "Integrations", redirect: "/admin/integrations/plex" },
  { slug: "player", title: "Player", category: "Integrations", description: "Built-in player settings." },

  { slug: "archive", title: "Archive", category: "Data", description: "Archived streams and lines." },
  { slug: "record", title: "Record", category: "DVR", description: "Recording rules." },
  { slug: "resize", title: "Resize", category: "Tools", description: "Logo / thumbnail resize." },
  { slug: "review", title: "Review", category: "Content", description: "Content review queue." },
  { slug: "hmac", title: "HMAC", category: "Security", description: "HMAC signing keys." },
  { slug: "hmacs", title: "HMAC keys", category: "Security", description: "HMAC key list." },
  { slug: "api", title: "API", category: "Developers", description: "REST / Xtream API reference." },
  { slug: "webhooks", title: "Webhooks", category: "Developers", description: "Outbound event webhooks." },
  { slug: "videolog", title: "Video log", category: "Streams", description: "Probe and preview streams." },

  { slug: "content", title: "Content", category: "Content", redirect: "/admin/content" },
  { slug: "content_created", title: "Content — created", category: "Content", redirect: "/admin/content/created" },
  { slug: "content_video", title: "Content — video", category: "Content", redirect: "/admin/content/video" },
  { slug: "content_archive", title: "Content — archive", category: "Content", redirect: "/admin/content/archive" },
  { slug: "content_delayed", title: "Content — delayed", category: "Content", redirect: "/admin/content/delayed" },
  { slug: "content_epg", title: "Content — EPG", category: "Content", redirect: "/admin/content/epg" },
  { slug: "content_playlists", title: "Content — playlists", category: "Content", redirect: "/admin/content/playlists" },
  { slug: "content_streams", title: "Content — streams", category: "Content", redirect: "/admin/content/streams" },
  { slug: "content_vod", title: "Content — VOD", category: "Content", redirect: "/admin/content/vod" },
];

export function getModuleBySlug(slug: string): AdminModuleDef | undefined {
  return XUI_ADMIN_MODULES.find((m) => m.slug === slug);
}

export function modulesByCategory() {
  const map = new Map<string, AdminModuleDef[]>();
  for (const m of XUI_ADMIN_MODULES) {
    const list = map.get(m.category) ?? [];
    list.push(m);
    map.set(m.category, list);
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}
