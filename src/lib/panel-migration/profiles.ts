import type { MigrationSource } from "./types";

export type PanelTableProfile = {
  streams: string[];
  bouquets: string[];
  lines: string[];
  resellers: string[];
  mag: string[];
  enigma: string[];
  categories: string[];
  servers: string[];
  epg: string[];
  /** Duration/credit packages (optional — XUI/1-stream billing packages). */
  packages: string[];
};

export const PANEL_PROFILES: Record<MigrationSource, PanelTableProfile> = {
  xui: {
    streams: ["streams", "media_streams", "live_streams", "channels", "stream"],
    // Do not treat billing `packages` as bouquets — XUI keeps channel lists on `bouquets`.
    bouquets: ["bouquets", "bouquet", "bundles"],
    // Modern XUI.one has a dedicated `lines` table; classic XC used `users` for lines.
    lines: ["lines", "subscribers", "clients", "users"],
    // Modern XUI.one: panel users/resellers are `users`. Classic: `reg_users`.
    // `users` is last so it is only used when not already consumed as lines
    // (finder skips line-table names when a dedicated reseller table exists).
    resellers: ["reg_users", "resellers", "sellers", "members", "users"],
    mag: ["mag_devices", "mag", "stb_devices", "devices"],
    enigma: ["enigma_devices", "enigma", "enigma2_devices"],
    categories: ["streams_categories", "stream_categories", "categories", "channel_categories"],
    // Prefer real streaming servers — never streams_servers (that's a junction).
    servers: ["streaming_servers", "servers"],
    epg: ["epg_sources", "epgs", "epg"],
    packages: [
      "users_packages",
      "packages",
      "user_packages",
      "line_packages",
      "credit_packages",
      "plans",
    ],
  },
  onestream: {
    streams: ["streams", "stream", "media_streams", "live_streams", "channels"],
    bouquets: ["bouquets", "bouquet", "packages", "package", "bundles"],
    lines: ["lines", "line", "subscriptions", "subscription", "subscribers", "clients"],
    resellers: ["users", "resellers", "reg_users", "sellers"],
    mag: ["mag_devices", "mag", "stb_devices", "devices"],
    enigma: ["enigma_devices", "enigma", "enigma2_devices"],
    categories: ["categories", "stream_categories", "streams_categories", "channel_categories"],
    servers: ["streaming_servers", "servers", "streams_servers", "stream_servers"],
    epg: ["epg_sources", "epg", "epgs"],
    packages: ["packages", "package", "plans", "credit_packages", "user_packages"],
  },
  xtream_ui: {
    streams: ["streams", "media_streams", "live_streams", "channels"],
    bouquets: ["bouquets", "bouquet", "bundles"],
    lines: ["users", "lines", "subscribers", "clients"],
    resellers: ["reg_users", "resellers", "sellers"],
    mag: ["mag_devices", "mag", "stb_devices", "devices"],
    enigma: ["enigma_devices", "enigma", "enigma2_devices"],
    categories: ["stream_categories", "categories", "streams_categories", "channel_categories"],
    servers: ["streaming_servers", "servers", "streams_servers", "stream_servers"],
    epg: ["epg_sources", "epgs", "epg"],
    packages: ["packages", "user_packages", "plans"],
  },
  /** StreamCreed — same MySQL lineage as XUI / XC; default DB streamcreed_db */
  streamcreed: {
    streams: ["streams", "media_streams", "live_streams", "channels", "stream"],
    bouquets: ["bouquets", "bouquet", "bundles"],
    lines: ["users", "lines", "subscribers", "clients"],
    resellers: ["reg_users", "resellers", "sellers", "members"],
    mag: ["mag_devices", "mag", "stb_devices", "devices"],
    enigma: ["enigma_devices", "enigma", "enigma2_devices"],
    categories: ["stream_categories", "categories", "streams_categories", "channel_categories"],
    servers: ["streaming_servers", "servers", "streams_servers", "stream_servers"],
    epg: ["epg_sources", "epgs", "epg"],
    packages: ["packages", "user_packages", "line_packages", "credit_packages", "plans"],
  },
  /** NXT-DASH — default DB nxt; best-effort XUI-lineage table names */
  nxt: {
    streams: ["streams", "media_streams", "live_streams", "channels", "stream"],
    bouquets: ["bouquets", "bouquet", "bundles"],
    lines: ["lines", "users", "subscribers", "clients"],
    resellers: ["reg_users", "resellers", "sellers", "members"],
    mag: ["mag_devices", "mag", "stb_devices", "devices"],
    enigma: ["enigma_devices", "enigma", "enigma2_devices"],
    categories: ["stream_categories", "categories", "streams_categories", "channel_categories"],
    servers: ["streaming_servers", "servers", "streams_servers", "stream_servers"],
    epg: ["epg_sources", "epgs", "epg"],
    packages: ["packages", "user_packages", "plans", "credit_packages"],
  },
  midnight: {
    streams: ["streams", "channels", "media_streams", "live_streams"],
    bouquets: ["bouquets", "packages", "bouquet", "bundles"],
    lines: ["lines", "subscribers", "users", "clients"],
    resellers: ["resellers", "users", "reg_users", "sellers"],
    mag: ["mag_devices", "mag", "stb_devices", "devices"],
    enigma: ["enigma_devices", "enigma", "enigma2_devices"],
    categories: ["categories", "stream_categories", "streams_categories", "channel_categories"],
    servers: ["servers", "streaming_servers", "streams_servers", "stream_servers"],
    epg: ["epg_sources", "epg", "epgs"],
    packages: ["packages", "plans"],
  },
  nexlify_json: {
    streams: [],
    bouquets: [],
    lines: [],
    resellers: [],
    mag: [],
    enigma: [],
    categories: [],
    servers: [],
    epg: [],
    packages: [],
  },
};

export function firstTableFound(sql: string, names: string[]): string | null {
  for (const name of names) {
    if (new RegExp(`INSERT\\s+INTO\\s+\`?${name}\`?`, "i").test(sql)) return name;
  }
  return null;
}

/** Extended entity table aliases for providers / watch / tickets / EPG guide / logs / ASN / settings. */
export type Phase3AliasKind =
  | "providers"
  | "providerStreams"
  | "watchFolders"
  | "watchLogs"
  | "tickets"
  | "ticketReplies"
  | "epgChannels"
  | "epgPrograms"
  | "blockedAsns"
  | "panelLogs"
  | "lineLogs"
  | "userLogs"
  | "loginLogs"
  | "streamLogs"
  | "serverStats"
  | "settings"
  | "accessCodes"
  | "blockedUserAgents"
  | "userGroups"
  | "liveConnections"
  | "onDemandCheck"
  | "watchCategories"
  | "watchRefresh"
  | "epgApi"
  | "epgLanguages"
  | "crontab"
  | "profiles"
  | "creditLogs";

type Phase3AliasMap = Partial<Record<Phase3AliasKind, string[]>>;

/**
 * Shared aliases work across XUI / StreamCreed / Xtream Codes / NXT dumps.
 * bySource adds panel-specific names (checked first).
 */
export const PHASE3_TABLE_ALIASES: {
  shared: Record<Phase3AliasKind, string[]>;
  bySource: Partial<Record<MigrationSource, Phase3AliasMap>>;
} = {
  shared: {
    providers: [
      "providers",
      "stream_providers",
      "streams_providers",
      "StreamProvider",
      "streamprovider",
    ],
    providerStreams: [
      "providers_streams",
      "provider_streams",
      "streams_providers_streams",
    ],
    watchFolders: [
      "watch_folders",
      "watch_folder",
      "WatchFolder",
      "watchfolder",
    ],
    watchLogs: ["watch_logs", "watch_log"],
    tickets: ["tickets", "ticket", "Ticket"],
    ticketReplies: [
      "tickets_replies",
      "ticket_replies",
      "ticket_messages",
      "TicketMessage",
      "ticketmessage",
    ],
    epgChannels: ["epg_channels", "epg_channel", "epg_channel_ids"],
    epgPrograms: [
      "epg_data",
      "epg_programs",
      "epg_programme",
      "EpgProgram",
      "epgprogram",
      "epg_programmes",
    ],
    blockedAsns: [
      "blocked_asns",
      "blocked_asn",
      "asn_blocks",
      "BlockedAsn",
      "blockedasn",
    ],
    panelLogs: ["panel_logs", "ActivityLog", "activity_logs", "activitylog"],
    lineLogs: ["lines_logs", "line_logs", "client_logs"],
    userLogs: ["users_logs", "user_logs", "reg_userlog", "reseller_logs"],
    loginLogs: ["login_logs", "mag_logs", "suspicious_logs"],
    streamLogs: ["streams_logs", "stream_logs"],
    serverStats: [
      "servers_stats",
      "server_stats",
      "server_activity",
      "BandwidthSnapshot",
      "bandwidth_snapshots",
      "bandwidthsnapshot",
    ],
    settings: [
      "settings",
      "setting",
      "PanelSetting",
      "panel_settings",
      "panelsetting",
    ],
    accessCodes: ["access_codes", "access_code", "AccessCode", "activation_codes"],
    blockedUserAgents: [
      "blocked_uas",
      "blocked_ua",
      "blocked_user_agents",
      "BlockedUserAgent",
      "user_agents_blocked",
    ],
    userGroups: [
      "users_groups",
      "user_groups",
      "member_groups",
      "reg_user_group",
      "UserGroup",
    ],
    liveConnections: [
      "lines_live",
      "line_live",
      "live_connections",
      "LiveConnection",
      "lines_activity",
    ],
    onDemandCheck: [
      "ondemand_check",
      "on_demand_check",
      "ondemand",
      "streams_ondemand",
    ],
    watchCategories: ["watch_categories", "watch_category"],
    watchRefresh: ["watch_refresh", "watch_refreshes"],
    epgApi: ["epg_api", "epg_apis", "epg_api_channels"],
    epgLanguages: ["epg_languages", "epg_language", "epg_langs"],
    crontab: ["crontab", "cron_jobs", "cron_tab", "panel_crontab"],
    profiles: ["profiles", "transcode_profiles", "encode_profiles", "stream_profiles"],
    creditLogs: [
      "users_credits_logs",
      "user_credits_logs",
      "credits_logs",
      "CreditTransaction",
    ],
  },
  bySource: {
    xui: {
      providers: ["providers", "stream_providers"],
      providerStreams: ["providers_streams"],
      watchFolders: ["watch_folders"],
      watchLogs: ["watch_logs"],
      epgChannels: ["epg_channels"],
      epgPrograms: ["epg_data"],
      blockedAsns: ["blocked_asns"],
      serverStats: ["servers_stats"],
    },
    streamcreed: {
      // StreamCreed ≈ XC lineage; providers often via streams_providers addon.
      providers: ["streams_providers", "providers", "stream_providers"],
      epgPrograms: ["epg_data"],
      lineLogs: ["client_logs", "lines_logs"],
      userLogs: ["reg_userlog", "users_logs"],
      serverStats: ["server_activity", "servers_stats"],
    },
    xtream_ui: {
      providers: ["streams_providers", "providers", "stream_providers"],
      providerStreams: ["providers_streams", "provider_streams"],
      epgPrograms: ["epg_data"],
      lineLogs: ["client_logs", "lines_logs"],
      userLogs: ["reg_userlog", "users_logs"],
      loginLogs: ["login_logs", "mag_logs", "suspicious_logs"],
      serverStats: ["server_activity", "servers_stats"],
    },
    nxt: {
      providers: ["providers", "streams_providers", "stream_providers"],
      epgPrograms: ["epg_data", "epg_programs"],
      watchFolders: ["watch_folders"],
    },
    onestream: {
      providers: ["StreamProvider", "stream_providers", "providers"],
      watchFolders: ["WatchFolder", "watch_folders"],
      watchLogs: ["ImportJob", "import_jobs", "watch_logs"],
      tickets: ["Ticket", "tickets"],
      ticketReplies: ["TicketMessage", "ticket_messages", "tickets_replies"],
      epgChannels: ["epg_channels"],
      epgPrograms: ["EpgProgram", "epg_programs", "epg_data"],
      blockedAsns: ["BlockedAsn", "blocked_asns"],
      panelLogs: ["ActivityLog", "activity_logs", "panel_logs"],
      serverStats: ["BandwidthSnapshot", "bandwidth_snapshots", "servers_stats"],
      settings: ["PanelSetting", "panel_settings", "settings"],
    },
    midnight: {
      providers: ["providers", "stream_providers"],
      epgPrograms: ["epg_data", "epg_programs"],
      watchFolders: ["watch_folders"],
    },
  },
};
