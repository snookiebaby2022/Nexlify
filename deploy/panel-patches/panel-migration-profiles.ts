import type { MigrationSource } from "./types";

export type PanelTableProfile = {
  streams: string[];
  bouquets: string[];
  lines: string[];
  resellers: string[];
  mag: string[];
};

export const PANEL_PROFILES: Record<MigrationSource, PanelTableProfile> = {
  xui: {
    streams: ["streams"],
    bouquets: ["bouquets"],
    lines: ["lines"],
    resellers: ["users", "reg_users"],
    mag: ["mag_devices"],
  },
  onestream: {
    streams: ["streams", "stream", "media_streams", "live_streams", "channels"],
    bouquets: ["bouquets", "bouquet", "packages", "package", "bundles"],
    lines: ["lines", "line", "subscriptions", "subscription", "subscribers", "clients"],
    resellers: ["users", "resellers", "reg_users", "sellers"],
    mag: ["mag_devices", "mag", "stb_devices", "devices"],
  },
  xtream_ui: {
    streams: ["streams"],
    bouquets: ["bouquets"],
    lines: ["users", "lines"],
    // `users` holds IPTV lines in Xtream UI; resellers live in `reg_users` only.
    resellers: ["reg_users"],
    mag: ["mag_devices"],
  },
  midnight: {
    streams: ["streams", "channels"],
    bouquets: ["bouquets", "packages"],
    lines: ["lines", "subscribers", "users"],
    resellers: ["resellers", "users"],
    mag: ["mag_devices", "mag"],
  },
  nexlify_json: {
    streams: [],
    bouquets: [],
    lines: [],
    resellers: [],
    mag: [],
  },
};

export function firstTableFound(sql: string, names: string[]): string | null {
  for (const name of names) {
    if (new RegExp(`INSERT\\s+INTO\\s+\`?${name}\`?`, "i").test(sql)) return name;
  }
  return null;
}
