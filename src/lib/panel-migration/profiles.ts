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
};

export const PANEL_PROFILES: Record<MigrationSource, PanelTableProfile> = {
  xui: {
    streams: ["streams"],
    bouquets: ["bouquets"],
    lines: ["lines"],
    resellers: ["users", "reg_users"],
    mag: ["mag_devices"],
    enigma: ["enigma_devices"],
    categories: ["stream_categories", "categories"],
    servers: ["streaming_servers", "servers"],
    epg: ["epg_sources", "epgs"],
  },
  onestream: {
    streams: ["streams", "stream", "media_streams", "live_streams", "channels"],
    bouquets: ["bouquets", "bouquet", "packages", "package", "bundles"],
    lines: ["lines", "line", "subscriptions", "subscription", "subscribers", "clients"],
    resellers: ["users", "resellers", "reg_users", "sellers"],
    mag: ["mag_devices", "mag", "stb_devices", "devices"],
    enigma: ["enigma_devices", "enigma", "enigma2_devices"],
    categories: ["categories", "stream_categories", "channel_categories"],
    servers: ["streaming_servers", "servers", "stream_servers"],
    epg: ["epg_sources", "epg", "epgs"],
  },
  xtream_ui: {
    streams: ["streams"],
    bouquets: ["bouquets"],
    lines: ["users", "lines"],
    resellers: ["reg_users"],
    mag: ["mag_devices"],
    enigma: ["enigma_devices"],
    categories: ["stream_categories", "categories"],
    servers: ["streaming_servers", "servers"],
    epg: ["epg_sources", "epgs"],
  },
  midnight: {
    streams: ["streams", "channels"],
    bouquets: ["bouquets", "packages"],
    lines: ["lines", "subscribers", "users"],
    resellers: ["resellers", "users"],
    mag: ["mag_devices", "mag"],
    enigma: ["enigma_devices", "enigma"],
    categories: ["categories", "stream_categories"],
    servers: ["servers", "streaming_servers"],
    epg: ["epg_sources", "epg"],
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
  },
};

export function firstTableFound(sql: string, names: string[]): string | null {
  for (const name of names) {
    if (new RegExp(`INSERT\\s+INTO\\s+\`?${name}\`?`, "i").test(sql)) return name;
  }
  return null;
}
