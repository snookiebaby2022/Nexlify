/** XUI-style reseller panel modules (reseller folder parity) */

export type ResellerModuleDef = {
  slug: string;
  title: string;
  category: string;
  redirect?: string;
  description?: string;
};

export const XUI_RESELLER_MODULES: ResellerModuleDef[] = [
  { slug: "index", title: "Dashboard", category: "Core", redirect: "/reseller/dashboard" },
  { slug: "dashboard", title: "Dashboard", category: "Core", redirect: "/reseller/dashboard" },

  { slug: "line", title: "Add line", category: "Lines", redirect: "/reseller/lines" },
  { slug: "lines", title: "My lines", category: "Lines", redirect: "/reseller/lines" },
  { slug: "line_activity", title: "Line activity", category: "Lines", description: "Recent activity per line." },
  { slug: "live_connections", title: "Live connections", category: "Lines", description: "Active streams for your lines." },

  { slug: "users", title: "Sub-users", category: "Users", redirect: "/reseller/users" },
  { slug: "user", title: "Add sub-user", category: "Users", redirect: "/reseller/users" },
  { slug: "user_logs", title: "User logs", category: "Users", description: "Activity log for your account." },

  { slug: "edit_profile", title: "Edit profile", category: "Account", redirect: "/reseller/profile" },
  { slug: "profile", title: "Profile", category: "Account", redirect: "/reseller/profile" },
  { slug: "session", title: "Session", category: "Account", description: "Active login sessions." },

  { slug: "tickets", title: "Tickets", category: "Support", redirect: "/reseller/tickets" },
  { slug: "ticket", title: "New ticket", category: "Support", redirect: "/reseller/tickets/new" },
  { slug: "ticket_view", title: "View ticket", category: "Support", redirect: "/reseller/tickets" },

  { slug: "streams", title: "Streams", category: "Content", redirect: "/reseller/streams" },
  { slug: "movies", title: "Movies", category: "Content", redirect: "/reseller/movies" },
  { slug: "episodes", title: "Episodes", category: "Content", redirect: "/reseller/episodes" },
  { slug: "epg_view", title: "EPG", category: "Content", description: "EPG preview for bouquets." },
  { slug: "created_channels", title: "Created channels", category: "Content", description: "Custom channels." },
  { slug: "radios", title: "Radio", category: "Content", description: "Radio stations in bouquets." },

  { slug: "mag", title: "MAG device", category: "Devices", redirect: "/reseller/mags" },
  { slug: "mags", title: "MAG devices", category: "Devices", redirect: "/reseller/mags" },
  { slug: "enigma", title: "Enigma", category: "Devices", description: "Enigma2 device." },
  { slug: "enigmas", title: "Enigma devices", category: "Devices", description: "Enigma2 device list." },

  { slug: "credits", title: "Credits", category: "Billing", redirect: "/reseller/credits" },
  { slug: "api", title: "API", category: "Developers", description: "Reseller API key and endpoints." },
  { slug: "resize", title: "Resize", category: "Tools", description: "Image resize utility." },

  { slug: "content", title: "Content", category: "Content", redirect: "/reseller/content" },
  { slug: "content_created", title: "Content — created", category: "Content", redirect: "/reseller/content/created" },
  { slug: "content_video", title: "Content — video", category: "Content", redirect: "/reseller/content/video" },
  { slug: "content_archive", title: "Content — archive", category: "Content", redirect: "/reseller/content/archive" },
  { slug: "content_delayed", title: "Content — delayed", category: "Content", redirect: "/reseller/content/delayed" },
  { slug: "content_epg", title: "Content — EPG", category: "Content", redirect: "/reseller/content/epg" },
  { slug: "content_playlists", title: "Content — playlists", category: "Content", redirect: "/reseller/content/playlists" },
  { slug: "content_streams", title: "Content — streams", category: "Content", redirect: "/reseller/content/streams" },
  { slug: "content_vod", title: "Content — VOD", category: "Content", redirect: "/reseller/content/vod" },
];

/** Layout partials in XUI — not separate routes in Nexlify */
export const XUI_RESELLER_LAYOUT_PARTIALS = [
  "footer",
  "functions",
  "header",
  "modals",
  "table",
  "topbar",
  "post",
  "login",
  "logout",
] as const;

export function getResellerModuleBySlug(slug: string): ResellerModuleDef | undefined {
  return XUI_RESELLER_MODULES.find((m) => m.slug === slug);
}

export function resellerModulesByCategory() {
  const map = new Map<string, ResellerModuleDef[]>();
  for (const m of XUI_RESELLER_MODULES) {
    const list = map.get(m.category) ?? [];
    list.push(m);
    map.set(m.category, list);
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}
