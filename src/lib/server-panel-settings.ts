export type ServerNetworkSettings = {
  interfaceName: string;
  gateway: string;
  subnetMask: string;
  dnsServers: string;
  mtu: number;
  ipv6Enabled: boolean;
};

export type ServerPerformanceSettings = {
  cpuThreads: number;
  maxConnections: number;
  ioReadMbps: number;
  ioWriteMbps: number;
  bufferSizeMb: number;
  enableTimeshiftBuffer: boolean;
  sortOrder: number;
  sysctlConf: string;
};

export type ServerAdvancedSettings = {
  disableDiskRam: boolean;
  serverRole: "main" | "lb" | "standard";
  /** Extra HTTP ports beyond primary `StreamServer.port` */
  httpPorts?: number[];
  /** Extra HTTPS ports beyond primary `StreamServer.httpsPort` */
  httpsPorts?: number[];
  geoIpPriority?: "low" | "medium" | "high";
};

export type ServerSslSettings = {
  autoCertbot: boolean;
  certbotEmail: string;
};

export const defaultNetworkSettings = (): ServerNetworkSettings => ({
  interfaceName: "eth0",
  gateway: "",
  subnetMask: "255.255.255.0",
  dnsServers: "8.8.8.8\n8.8.4.4",
  mtu: 1500,
  ipv6Enabled: false,
});

export const defaultPerformanceSettings = (): ServerPerformanceSettings => ({
  cpuThreads: 0,
  maxConnections: 1000,
  ioReadMbps: 0,
  ioWriteMbps: 0,
  bufferSizeMb: 64,
  enableTimeshiftBuffer: false,
  sortOrder: 0,
  sysctlConf: "",
});

export const defaultAdvancedSettings = (): ServerAdvancedSettings => ({
  disableDiskRam: false,
  serverRole: "standard",
  httpPorts: [],
  httpsPorts: [],
  geoIpPriority: "low",
});

export const defaultSslSettings = (): ServerSslSettings => ({
  autoCertbot: false,
  certbotEmail: "",
});

export function parseServerPanelSettings(raw: unknown): {
  network: ServerNetworkSettings;
  performance: ServerPerformanceSettings;
  advanced: ServerAdvancedSettings;
  ssl: ServerSslSettings;
  rest: Record<string, unknown>;
} {
  const base =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const net = base.network;
  const perf = base.performance;
  const adv = base.advanced;
  const ssl = base.ssl;
  const network: ServerNetworkSettings = {
    ...defaultNetworkSettings(),
    ...(net && typeof net === "object" ? (net as ServerNetworkSettings) : {}),
  };
  const performance: ServerPerformanceSettings = {
    ...defaultPerformanceSettings(),
    ...(perf && typeof perf === "object" ? (perf as ServerPerformanceSettings) : {}),
  };
  const advanced: ServerAdvancedSettings = {
    ...defaultAdvancedSettings(),
    ...(adv && typeof adv === "object" ? (adv as ServerAdvancedSettings) : {}),
  };
  const sslParsed: ServerSslSettings = {
    ...defaultSslSettings(),
    ...(ssl && typeof ssl === "object" ? (ssl as ServerSslSettings) : {}),
  };
  const rest = Object.fromEntries(
    Object.entries(base).filter(
      ([k]) => k !== "network" && k !== "performance" && k !== "advanced" && k !== "ssl"
    )
  ) as Record<string, unknown>;
  return { network, performance, advanced, ssl: sslParsed, rest };
}

export function buildServerPanelSettingsJson(
  existing: unknown,
  parts: {
    network: ServerNetworkSettings;
    performance: ServerPerformanceSettings;
    advanced: ServerAdvancedSettings;
    ssl: ServerSslSettings;
  },
  snapshot?: Record<string, unknown> | null
): Record<string, unknown> {
  const { rest } = parseServerPanelSettings(existing);
  return {
    ...rest,
    ...(snapshot ?? {}),
    network: parts.network,
    performance: parts.performance,
    advanced: parts.advanced,
    ssl: parts.ssl,
  };
}
