export type ProbeResult = {
  status: "online" | "degraded" | "offline" | "unknown";
  message: string;
  httpStatus?: number;
  latencyMs?: number;
  videoCodec?: string;
  audioCodec?: string;
  resolution?: string;
  fps?: number;
  bitrateKbps?: number;
  durationSec?: number;
  format?: string;
};

export function normalizeProviderUrl(raw: string): { ok: true; url: string } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, error: "Base URL is required" };
  try {
    const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
    const url = new URL(withScheme);
    if (!["http:", "https:"].includes(url.protocol)) {
      return { ok: false, error: "URL must use http or https" };
    }
    if (!url.hostname) return { ok: false, error: "URL must include a valid host" };
    return { ok: true, url: url.toString().replace(/\/$/, "") || url.origin };
  } catch {
    return { ok: false, error: "Invalid URL format" };
  }
}

function friendlyFetchError(e: unknown): string {
  if (!(e instanceof Error)) return "Connection failed";
  const msg = e.message;
  if (e.name === "TimeoutError" || msg.includes("timeout")) return "Timed out after 8s";
  if (msg.includes("ENOTFOUND") || msg.includes("getaddrinfo")) return "Host not found (DNS)";
  if (msg.includes("ECONNREFUSED")) return "Connection refused";
  if (msg.includes("ECONNRESET")) return "Connection reset";
  if (msg.includes("certificate") || msg.includes("SSL") || msg.includes("TLS")) {
    return "TLS/SSL certificate error";
  }
  if (msg.includes("fetch failed")) return "Network unreachable";
  return msg.length > 120 ? `${msg.slice(0, 120)}…` : msg;
}

function probeTimeoutMs(): number {
  const n = Number(process.env.STREAM_PROBE_TIMEOUT_MS ?? "4000");
  return Number.isFinite(n) && n > 500 ? n : 4000;
}

async function fetchProbe(
  url: string,
  method: "HEAD" | "GET",
  timeoutMs?: number
): Promise<{ res: Response; latencyMs: number }> {
  const start = Date.now();
  const res = await fetch(url, {
    method,
    signal: AbortSignal.timeout(timeoutMs ?? probeTimeoutMs()),
    redirect: "follow",
    headers: { "User-Agent": "Nexlify-Provider-Probe/1.0" },
  });
  return { res, latencyMs: Date.now() - start };
}

export async function probeStreamProvider(
  baseUrl: string,
  opts?: { fast?: boolean }
): Promise<ProbeResult> {
  const normalized = normalizeProviderUrl(baseUrl);
  if (!normalized.ok) {
    return { status: "offline", message: normalized.error };
  }

  const url = normalized.url;
  const fast = opts?.fast === true;
  const timeout = fast ? Math.min(probeTimeoutMs(), 2500) : Math.max(probeTimeoutMs(), 12_000);
  const direct = /\.(m3u8|ts|mp4|m4v)(\?|$)/i.test(url);

  if (fast && direct) {
    try {
      const result = await fetchProbe(url, "HEAD", timeout);
      const code = result.res.status;
      if ((code >= 200 && code < 500) || code === 405 || code === 501) {
        return {
          status: code >= 200 && code < 300 ? "online" : "degraded",
          message: `Fast probe HTTP ${code} · ${result.latencyMs}ms`,
          httpStatus: code,
          latencyMs: result.latencyMs,
        };
      }
    } catch {
      // Fast probe must not claim "online/degraded" just because the URL looks playable.
      return {
        status: "offline",
        message: "Fast probe: HEAD failed (try Full probe)",
        latencyMs: 0,
      };
    }
  }

  try {
    let result: { res: Response; latencyMs: number };
    try {
      result = await fetchProbe(url, "HEAD", timeout);
    } catch (headErr) {
      try {
        result = await fetchProbe(url, "GET", timeout);
      } catch (getErr) {
        return { status: "offline", message: friendlyFetchError(getErr ?? headErr) };
      }
    }

    const { res, latencyMs } = result;
    const code = res.status;

    if (code >= 200 && code < 300) {
      return { status: "online", message: `OK (${code}) · ${latencyMs}ms`, httpStatus: code, latencyMs };
    }
    if (code === 401 || code === 403) {
      return {
        status: "degraded",
        message: `Reachable but auth required (HTTP ${code}) · ${latencyMs}ms`,
        httpStatus: code,
        latencyMs,
      };
    }
    if (code === 405 || code === 501) {
      return {
        status: "degraded",
        message: `Reachable (HTTP ${code}) · ${latencyMs}ms`,
        httpStatus: code,
        latencyMs,
      };
    }
    if (code >= 500) {
      return {
        status: "offline",
        message: `Server error HTTP ${code} · ${latencyMs}ms`,
        httpStatus: code,
        latencyMs,
      };
    }
    return {
      status: "degraded",
      message: `HTTP ${code} · ${latencyMs}ms`,
      httpStatus: code,
      latencyMs,
    };
  } catch (e) {
    return { status: "offline", message: friendlyFetchError(e) };
  }
}

export type InferredRemoteConnection = {
  remoteHost: string | null;
  remotePort: number | null;
  remoteProtocol: string | null;
  remotePanelUrl: string | null;
};

/** Derive SSH/panel host details from the stream base URL (hostname, port, protocol, origin). */
export function inferRemoteConnectionFromUrl(raw: string): InferredRemoteConnection {
  const normalized = normalizeProviderUrl(raw);
  if (!normalized.ok) {
    return { remoteHost: null, remotePort: null, remoteProtocol: null, remotePanelUrl: null };
  }

  try {
    const url = new URL(normalized.url);
    const remoteHost = url.hostname || null;
    const defaultPort = url.protocol === "https:" ? 443 : url.protocol === "http:" ? 80 : null;
    const remotePort = url.port ? Number(url.port) : defaultPort;
    const remoteProtocol =
      url.protocol === "https:" ? "https" : url.protocol === "http:" ? "http" : "other";
    return {
      remoteHost,
      remotePort,
      remoteProtocol,
      remotePanelUrl: url.origin,
    };
  } catch {
    return { remoteHost: null, remotePort: null, remoteProtocol: null, remotePanelUrl: null };
  }
}

export type ProviderAccountProbe = {
  expiresAt: Date | null;
  maxConnections: number | null;
  upstreamActiveConnections: number | null;
};

function parsePositiveInt(raw: unknown): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}

function parseExpiry(raw: unknown): Date | null {
  if (raw == null || raw === "") return null;
  if (typeof raw === "string" && /^\d+$/.test(raw.trim())) {
    const sec = Number(raw);
    if (sec > 1_000_000_000) return new Date(sec * 1000);
  }
  const d = new Date(String(raw));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Pull username/password from provider URL query or apiKey (`user:pass`). */
export function extractProviderCredentials(
  baseUrl: string,
  apiKey?: string | null
): { username?: string; password?: string; origin?: string } {
  try {
    const normalized = normalizeProviderUrl(baseUrl);
    if (!normalized.ok) return {};
    const url = new URL(normalized.url);
    const username =
      url.searchParams.get("username") ??
      url.searchParams.get("user") ??
      url.searchParams.get("login") ??
      undefined;
    const password =
      url.searchParams.get("password") ??
      url.searchParams.get("pass") ??
      url.searchParams.get("pwd") ??
      undefined;
    if (username && password) {
      return { username, password, origin: url.origin };
    }
    const key = apiKey?.trim();
    if (key?.includes(":")) {
      const idx = key.indexOf(":");
      return {
        username: key.slice(0, idx),
        password: key.slice(idx + 1),
        origin: url.origin,
      };
    }
    return { origin: url.origin };
  } catch {
    return {};
  }
}

export function resolveProviderXtreamCreds(provider: {
  baseUrl: string;
  apiKey?: string | null;
  remoteUsername?: string | null;
  remotePassword?: string | null;
}): { username?: string; password?: string; origin?: string } {
  const extracted = extractProviderCredentials(provider.baseUrl, provider.apiKey);
  const username = provider.remoteUsername?.trim() || extracted.username;
  const password = provider.remotePassword?.trim() || extracted.password;
  return { username, password, origin: extracted.origin };
}

/** Query upstream Xtream player_api for account expiry and connection stats. */
export async function probeProviderAccountInfo(
  baseUrl: string,
  apiKey?: string | null
): Promise<ProviderAccountProbe> {
  const creds = extractProviderCredentials(baseUrl, apiKey);
  if (!creds.username || !creds.password || !creds.origin) {
    return { expiresAt: null, maxConnections: null, upstreamActiveConnections: null };
  }

  const apiUrl = `${creds.origin}/player_api.php?username=${encodeURIComponent(creds.username)}&password=${encodeURIComponent(creds.password)}`;
  try {
    const res = await fetch(apiUrl, {
      signal: AbortSignal.timeout(probeTimeoutMs()),
      headers: { "User-Agent": "Nexlify-Provider-Probe/1.0" },
    });
    if (!res.ok) {
      return { expiresAt: null, maxConnections: null, upstreamActiveConnections: null };
    }
    const data = (await res.json()) as {
      user_info?: {
        auth?: number;
        exp_date?: string;
        max_connections?: string;
        active_cons?: string;
      };
    };
    const info = data.user_info;
    if (!info || info.auth === 0) {
      return { expiresAt: null, maxConnections: null, upstreamActiveConnections: null };
    }
    return {
      expiresAt: parseExpiry(info.exp_date),
      maxConnections: parsePositiveInt(info.max_connections),
      upstreamActiveConnections: parsePositiveInt(info.active_cons),
    };
  } catch {
    return { expiresAt: null, maxConnections: null, upstreamActiveConnections: null };
  }
}

export function validateProviderInput(body: {
  name?: unknown;
  baseUrl?: unknown;
  maxStreams?: unknown;
}): { ok: true; data: { name: string; baseUrl: string; maxStreams: number | null } } | { ok: false; error: string; field?: string } {
  const name = String(body.name ?? "").trim();
  if (!name) return { ok: false, error: "Name is required", field: "name" };

  const baseUrlRaw = String(body.baseUrl ?? "").trim();
  const urlCheck = normalizeProviderUrl(baseUrlRaw);
  if (!urlCheck.ok) return { ok: false, error: urlCheck.error, field: "baseUrl" };

  let maxStreams: number | null = null;
  if (body.maxStreams != null && body.maxStreams !== "") {
    const n = Number(body.maxStreams);
    if (!Number.isFinite(n) || n < 0) {
      return { ok: false, error: "Max streams must be a positive number", field: "maxStreams" };
    }
    maxStreams = Math.floor(n);
  }

  return { ok: true, data: { name, baseUrl: urlCheck.url, maxStreams } };
}
