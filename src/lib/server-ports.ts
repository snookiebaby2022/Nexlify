/** Default streaming / panel ports (panel 3000, public website / Xtream HTTP 3001). */
export const PANEL_HTTP_PORT = 3000;
export const WEBSITE_HTTP_PORT = 3001;
/** @deprecated Use WEBSITE_HTTP_PORT — alias for stream edge HTTP */
export const STREAM_HTTP_PORT = WEBSITE_HTTP_PORT;
export const STREAM_HTTPS_PORT = 443;

export const PANEL_CATEGORY_NAME = "Panel :3000";

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

/** Website / Xtream HTTP port advertised to clients (WEBSITE_PORT / STREAM_HTTP_PORT env or settings). */
export function resolveWebsiteHttpPort(): number {
  const raw =
    process.env.WEBSITE_PORT ?? process.env.STREAM_HTTP_PORT ?? process.env.NEXT_PUBLIC_WEBSITE_PORT;
  return parsePort(raw, WEBSITE_HTTP_PORT);
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

/** Client-facing website origin (streams / player_api server_info). */
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
