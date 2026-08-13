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
    bouquets: ["bouquets", "bouquet", "packages", "bundles"],
    lines: ["lines", "subscribers", "clients", "users"],
    resellers: ["users", "reg_users", "resellers", "sellers", "members"],
    mag: ["mag_devices", "mag", "stb_devices", "devices"],
    enigma: ["enigma_devices", "enigma", "enigma2_devices"],
    categories: ["stream_categories", "categories", "streams_categories", "channel_categories"],
    servers: ["streaming_servers", "servers", "streams_servers", "stream_servers"],
    epg: ["epg_sources", "epgs", "epg"],
    packages: ["packages", "user_packages", "line_packages", "credit_packages", "plans"],
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
    bouquets: ["bouquets", "bouquet", "packages", "bundles"],
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
    bouquets: ["bouquets", "bouquet", "packages", "bundles"],
    lines: ["users", "lines", "subscribers", "clients"],
    resellers: ["reg_users", "users", "resellers", "sellers", "members"],
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
    bouquets: ["bouquets", "bouquet", "packages", "bundles"],
    lines: ["lines", "users", "subscribers", "clients"],
    resellers: ["users", "reg_users", "resellers", "sellers", "members"],
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
