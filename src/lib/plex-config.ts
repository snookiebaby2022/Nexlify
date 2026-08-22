export type PlexIntegrationConfig = {
  url?: string;
  host?: string;
  port?: number | string;
  username?: string;
  password?: string;
  token?: string;
  serverId?: string | null;
  transcodeProfile?: string;
  /** XUI direct_proxy — prefer direct play; panel still resolves upstream for movie route. */
  directStream?: boolean;
  libraryKey?: string;
  libraryTitle?: string;
};

export function buildPlexBaseUrl(cfg: PlexIntegrationConfig): string {
  const fromUrl = String(cfg.url ?? "").trim().replace(/\/$/, "");
  if (fromUrl) return fromUrl;
  const host = String(cfg.host ?? "").trim();
  if (!host) return "";
  const port = cfg.port ?? 32400;
  return `http://${host}:${port}`;
}

export function normalizePlexConfig(raw: Record<string, unknown>): PlexIntegrationConfig {
  return {
    url: raw.url ? String(raw.url) : undefined,
    host: raw.host ? String(raw.host) : undefined,
    port:
      raw.port != null && (typeof raw.port === "string" || typeof raw.port === "number")
        ? raw.port
        : undefined,
    username: raw.username ? String(raw.username) : undefined,
    password: raw.password ? String(raw.password) : undefined,
    token: raw.token ? String(raw.token) : undefined,
    serverId: raw.serverId ? String(raw.serverId) : null,
    transcodeProfile: raw.transcodeProfile ? String(raw.transcodeProfile) : "1080p",
    directStream: raw.directStream === true,
    libraryKey: raw.libraryKey ? String(raw.libraryKey) : undefined,
    libraryTitle: raw.libraryTitle ? String(raw.libraryTitle) : undefined,
  };
}

export function plexTokenParam(cfg: PlexIntegrationConfig): string {
  return `X-Plex-Token=${encodeURIComponent(String(cfg.token ?? ""))}`;
}

/** Public origin for a streaming server row (LB node). */
export function buildServerStreamingOrigin(server: {
  host: string;
  port: number;
  protocol?: string | null;
  domain?: string | null;
}): string {
  const host = String(server.domain ?? server.host).trim();
  const protocol = server.protocol?.trim() || "http";
  return `${protocol}://${host}:${server.port}`;
}
