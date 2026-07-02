/** Panel process listens on 13000 behind nginx, or 80 for direct IP installs. */
export const PANEL_UPSTREAM_PORT = 13000;
export const PANEL_HTTP_PORT = PANEL_UPSTREAM_PORT;
/** Marketing / billing website (nexlify-web) on 13001. */
export const WEBSITE_UPSTREAM_PORT = 13001;
export const WEBSITE_HTTP_PORT = WEBSITE_UPSTREAM_PORT;
/** Dedicated HTTP stream edge (Xtream / M3U / live) — nginx :8080 → panel. */
export const STREAM_EDGE_HTTP_PORT = 8080;
/** Client-facing HTTP stream port (alias for stream edge). */
export const STREAM_HTTP_PORT = STREAM_EDGE_HTTP_PORT;
export const STREAM_HTTPS_PORT = 443;

/** RTMP ingest (OBS / restream). */
export const RTMP_PORT = 1935;
/** RTSP (optional cameras). */
export const RTSP_PORT = 554;
/** SSH — never bind panel here; firewall only. */
export const SSH_PORT = 22;

/** Customer-facing TCP ports opened by scripts/nexlify-firewall-ports.sh */
export const CUSTOMER_FIREWALL_PORTS = {
  ssh: SSH_PORT,
  http: 80,
  https: STREAM_HTTPS_PORT,
  streamHttp: STREAM_EDGE_HTTP_PORT,
  rtmp: RTMP_PORT,
  rtsp: RTSP_PORT,
} as const;

export const PANEL_CATEGORY_NAME = "Panel";

/** Node upstream ports — never show these in browser-facing panel URLs. */
export const INTERNAL_UPSTREAM_PORTS = new Set([3000, 3001, 13000, 13001]);

function parsePort(raw: string | undefined, fallback: number): number {
  const n = raw != null ? Number(raw) : fallback;
  if (!Number.isFinite(n) || n < 1 || n > 65535) return fallback;
  return Math.floor(n);
}

/** Port the Next.js panel process listens on (PORT / PANEL_PORT env). */
export function resolvePanelListenPort(): number {
  const raw = process.env.PORT ?? process.env.PANEL_PORT;
  return parsePort(raw, PANEL_HTTP_PORT);
}

/** Marketing site port (WEBSITE_PORT env). */
export function resolveWebsiteHttpPort(): number {
  const raw = process.env.WEBSITE_PORT ?? process.env.NEXT_PUBLIC_WEBSITE_PORT;
  return parsePort(raw, WEBSITE_HTTP_PORT);
}

/** HTTP stream edge port advertised to IPTV clients (STREAM_EDGE_PORT / STREAM_HTTP_PORT env). */
export function resolveStreamEdgeHttpPort(): number {
  const raw =
    process.env.STREAM_EDGE_PORT ??
    process.env.STREAM_HTTP_PORT ??
    process.env.NEXT_PUBLIC_STREAM_HTTP_PORT;
  return parsePort(raw, STREAM_EDGE_HTTP_PORT);
}

/** HTTPS stream / panel port for player_api server_info. */
export function resolveStreamHttpsPort(): number {
  const raw =
    process.env.STREAM_HTTPS_PORT ??
    process.env.PANEL_SSL_PORT ??
    process.env.NEXT_PUBLIC_STREAM_HTTPS_PORT;
  return parsePort(raw, STREAM_HTTPS_PORT);
}

/** Xtream-style port string from a panel base URL. */
export function portFromPanelBaseUrl(baseUrl: string): string {
  try {
    const u = new URL(baseUrl);
    if (u.port) return u.port;
    return u.protocol === "https:" ? String(STREAM_HTTPS_PORT) : "80";
  } catch {
    return String(resolvePanelListenPort());
  }
}

/** Client-facing marketing website origin. */
export function websiteBaseUrl(panelBaseUrl?: string): string {
  const env = process.env.NEXT_PUBLIC_WEBSITE_URL?.trim();
  if (env) return env.replace(/\/+$/, "");
  const port = resolveWebsiteHttpPort();
  if (panelBaseUrl) {
    try {
      const u = new URL(panelBaseUrl);
      if (u.port === String(port)) return u.origin;
      u.port = String(port);
      return u.origin;
    } catch {
      /* fall through */
    }
  }
  try {
    const panelEnv = process.env.NEXT_PUBLIC_SERVER_URL?.trim();
    if (panelEnv) {
      const u = new URL(panelEnv);
      u.port = String(port);
      return u.origin;
    }
  } catch {
    /* ignore */
  }
  return `http://127.0.0.1:${port}`;
}

/** HTTP origin for stream edge URLs (http://host:8080). */
export function streamEdgeHttpOrigin(host: string): string {
  const port = resolveStreamEdgeHttpPort();
  const h = host.replace(/:\d+$/, "");
  if (port === 80) return `http://${h}`;
  return `http://${h}:${port}`;
}
