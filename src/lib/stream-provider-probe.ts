import { looksLikePlayableMediaPayload } from "@/lib/live-upstream-proxy";
import { normalizeProviderUrl } from "@/lib/stream-provider-url";

export { normalizeProviderUrl, inferRemoteConnectionFromUrl } from "@/lib/stream-provider-url";
export type { InferredRemoteConnection } from "@/lib/stream-provider-url";

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

function isDirectMediaUrl(url: string): boolean {
  return /\.(m3u8|ts|mp4|m4v|mkv|avi)(\?|$)/i.test(url);
}

function isXtreamPanelUrl(url: string): boolean {
  if (isDirectMediaUrl(url)) return false;
  try {
    const u = new URL(url);
    const path = u.pathname.toLowerCase();
    if (
      path.includes("player_api.php") ||
      path.includes("panel_api.php") ||
      path.includes("get.php") ||
      path.includes("xmltv.php")
    ) {
      return true;
    }
    return path === "/" || path === "";
  } catch {
    return false;
  }
}

export type ProviderProbeOptions = {
  fast?: boolean;
  apiKey?: string | null;
  remoteUsername?: string | null;
  remotePassword?: string | null;
};

async function probeXtreamPanelHealth(
  baseUrl: string,
  opts?: ProviderProbeOptions
): Promise<ProbeResult | null> {
  if (!isXtreamPanelUrl(baseUrl)) return null;

  const creds = resolveProviderXtreamCreds({
    baseUrl,
    apiKey: opts?.apiKey,
    remoteUsername: opts?.remoteUsername,
    remotePassword: opts?.remotePassword,
  });
  const start = Date.now();

  if (creds.username && creds.password && creds.origin) {
    const apiUrl = `${creds.origin}/player_api.php?username=${encodeURIComponent(creds.username)}&password=${encodeURIComponent(creds.password)}`;
    try {
      const res = await fetch(apiUrl, {
        signal: AbortSignal.timeout(probeTimeoutMs()),
        headers: { "User-Agent": "Nexlify-Provider-Probe/1.0" },
      });
      const latencyMs = Date.now() - start;
      if (!res.ok) {
        return {
          status: res.status === 401 || res.status === 403 ? "degraded" : "offline",
          message: `Xtream API HTTP ${res.status} · ${latencyMs}ms`,
          httpStatus: res.status,
          latencyMs,
        };
      }
      const data = (await res.json()) as { user_info?: { auth?: number; message?: string } };
      if (data.user_info?.auth === 1) {
        return {
          status: "online",
          message: `Xtream login OK · ${latencyMs}ms`,
          httpStatus: res.status,
          latencyMs,
        };
      }
      const msg = data.user_info?.message?.trim() || "Invalid Xtream credentials";
      return {
        status: "degraded",
        message: `${msg} · ${latencyMs}ms`,
        httpStatus: res.status,
        latencyMs,
      };
    } catch (e) {
      return { status: "offline", message: friendlyFetchError(e), latencyMs: Date.now() - start };
    }
  }

  try {
    const normalized = normalizeProviderUrl(baseUrl);
    if (!normalized.ok) return null;
    const target = creds.origin ?? normalized.url;
    const { res, latencyMs } = await fetchProbe(target, "HEAD", probeTimeoutMs());
    const code = res.status;
    if (code >= 200 && code < 500) {
      return {
        status: "degraded",
        message: `Panel reachable (HTTP ${code}) — add credentials for full Xtream check · ${latencyMs}ms`,
        httpStatus: code,
        latencyMs,
      };
    }
    return {
      status: "offline",
      message: `Panel HTTP ${code} · ${latencyMs}ms`,
      httpStatus: code,
      latencyMs,
    };
  } catch (e) {
    return { status: "offline", message: friendlyFetchError(e), latencyMs: Date.now() - start };
  }
}

/** Match live playback / ffprobe — provider CDNs often 404 generic probe UAs. */
const PROBE_UA = "VLC/3.0.20 LibVLC/3.0.20";

async function fetchBodySample(
  url: string,
  timeoutMs: number
): Promise<{ ok: boolean; message: string; httpStatus?: number }> {
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        "User-Agent": PROBE_UA,
        Range: "bytes=0-8191",
        Accept: "*/*",
      },
    });
    if (res.status === 404 || res.status >= 500) {
      return { ok: false, message: `GET HTTP ${res.status}`, httpStatus: res.status };
    }
    if (res.status === 401 || res.status === 403) {
      return { ok: false, message: `Auth required (HTTP ${res.status})`, httpStatus: res.status };
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0) {
      return { ok: false, message: "Empty body (HEAD-only check is not enough)", httpStatus: res.status };
    }
    if (!looksLikePlayableMediaPayload(buf)) {
      const head = buf.subarray(0, 48).toString("utf8");
      if (head.trimStart().startsWith("<") || /html/i.test(head)) {
        return { ok: false, message: "HTML error page, not media" };
      }
      if (res.status >= 200 && res.status < 300) {
        return { ok: false, message: "Could not verify media signature (HTTP OK)", httpStatus: res.status };
      }
      return { ok: false, message: "Response is not playable media" };
    }
    return {
      ok: true,
      message: `Playable · ${buf.length}B sample · HTTP ${res.status}`,
      httpStatus: res.status,
    };
  } catch (e) {
    return { ok: false, message: friendlyFetchError(e) };
  }
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
    headers: { "User-Agent": PROBE_UA },
  });
  return { res, latencyMs: Date.now() - start };
}

export async function probeStreamProvider(
  baseUrl: string,
  opts?: ProviderProbeOptions
): Promise<ProbeResult> {
  const normalized = normalizeProviderUrl(baseUrl);
  if (!normalized.ok) {
    return { status: "offline", message: normalized.error };
  }

  const panelProbe = await probeXtreamPanelHealth(baseUrl, opts);
  if (panelProbe) return panelProbe;

  const url = normalized.url;
  const fast = opts?.fast === true;
  const timeout = fast ? Math.min(probeTimeoutMs(), 2500) : Math.max(probeTimeoutMs(), 12_000);
  const sampleTimeout = fast ? Math.min(timeout + 2000, 6000) : Math.max(timeout, 14_000);
  const direct = isDirectMediaUrl(url);
  const verifyBody = direct || isDirectMediaUrl(url);

  const finishWithBodyCheck = async (
    headResult: { status: "online" | "degraded"; message: string; httpStatus?: number; latencyMs?: number }
  ): Promise<ProbeResult> => {
    if (!verifyBody) {
      return {
        status: headResult.status,
        message: headResult.message,
        httpStatus: headResult.httpStatus,
        latencyMs: headResult.latencyMs,
      };
    }
    const sample = await fetchBodySample(url, sampleTimeout);
    if (sample.ok) {
      return {
        status: "online",
        message: `${headResult.message} · ${sample.message}`,
        httpStatus: sample.httpStatus ?? headResult.httpStatus,
        latencyMs: headResult.latencyMs,
      };
    }
    const httpOk = (sample.httpStatus ?? headResult.httpStatus ?? 0) >= 200 && (sample.httpStatus ?? headResult.httpStatus ?? 0) < 300;
    return {
      status: httpOk ? "degraded" : "offline",
      message: `${headResult.message} · ${sample.message}`,
      httpStatus: sample.httpStatus ?? headResult.httpStatus,
      latencyMs: headResult.latencyMs,
    };
  };

  if (fast && direct) {
    try {
      const result = await fetchProbe(url, "HEAD", timeout);
      const code = result.res.status;
      if (code >= 200 && code < 500) {
        const len = Number(result.res.headers.get("content-length") ?? "0");
        const headStatus: "online" | "degraded" = code >= 200 && code < 300 ? "online" : "degraded";
        const headOk = {
          status: headStatus,
          message: `Fast probe HTTP ${code} · ${result.latencyMs}ms`,
          httpStatus: code,
          latencyMs: result.latencyMs,
        };
        if (code >= 200 && code < 300 && len === 0) {
          return finishWithBodyCheck(headOk);
        }
        if (headOk.status === "online") {
          return finishWithBodyCheck(headOk);
        }
        return headOk as ProbeResult;
      }
    } catch {
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
      return finishWithBodyCheck({
        status: "online",
        message: `OK (${code}) · ${latencyMs}ms`,
        httpStatus: code,
        latencyMs,
      });
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
