import { looksLikePlayableMediaPayload } from "@/lib/live-upstream-proxy";
import { normalizeProviderUrl } from "@/lib/stream-provider-url";
import { cacheGet, cacheGetOrSet, cacheSet } from "@/lib/cache";
import { createHash } from "crypto";
import { probeTimeoutMs as resolveProbeTimeoutMs } from "@/lib/stream-probe-fast";

export { normalizeProviderUrl, inferRemoteConnectionFromUrl } from "@/lib/stream-provider-url";
export type { InferredRemoteConnection } from "@/lib/stream-provider-url";

export type ProbeResult = {
  status: "online" | "degraded" | "offline" | "unknown";
  message: string;
  /** Classified failure: timeout | 401 | 403 | 404 | 502 | dns | error */
  failureReason?: string;
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

function probeTimeoutMs(fast?: boolean): number {
  return resolveProbeTimeoutMs(fast);
}

export function classifyProbeFailure(message: string, httpStatus?: number): string {
  if (httpStatus === 401) return "401";
  if (httpStatus === 403) return "403";
  if (httpStatus === 404) return "404";
  if (httpStatus === 502 || httpStatus === 503 || httpStatus === 504) return "502";
  const m = message.toLowerCase();
  if (m.includes("timeout") || m.includes("timed out")) return "timeout";
  if (m.includes("dns") || m.includes("enotfound") || m.includes("host not found")) return "dns";
  return "error";
}

export function formatProbeFailure(probe: ProbeResult): string {
  const reason = probe.failureReason ?? classifyProbeFailure(probe.message, probe.httpStatus);
  return `[${reason}] ${probe.message}`;
}

function withFailureReason(result: ProbeResult): ProbeResult {
  if (result.status === "online" || result.status === "degraded") return result;
  return {
    ...result,
    failureReason: result.failureReason ?? classifyProbeFailure(result.message, result.httpStatus),
  };
}

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
  skipCache?: boolean;
  apiKey?: string | null;
  apiToken?: string | null;
  providerType?: string | null;
  remoteUsername?: string | null;
  remotePassword?: string | null;
};

async function probeManagedProviderHealth(
  baseUrl: string,
  opts: ProviderProbeOptions
): Promise<ProbeResult | null> {
  if (opts.providerType !== "onestream" && opts.providerType !== "nxt") return null;
  const origin = normalizeProviderUrl(baseUrl);
  if (!origin.ok) return null;
  const start = Date.now();
  const [storedKey, storedToken] = (opts.apiKey ?? "").split(/:([\s\S]*)/, 2);
  const apiKey = storedKey || opts.apiKey || "";
  const apiToken = opts.apiToken || storedToken || "";
  try {
    const isOneStream = opts.providerType === "onestream";
    const res = await fetch(
      `${origin.url.replace(/\/$/, "")}/api/${isOneStream ? "lines/status" : "lines"}`,
      {
        method: isOneStream ? "POST" : "GET",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          ...(isOneStream
            ? { Authorization: `Bearer ${apiKey}:${apiToken}` }
            : {
                "X-API-Key": apiKey,
                Authorization: `Token ${apiKey}`,
              }),
        },
        ...(isOneStream
          ? { body: JSON.stringify({ username: opts.remoteUsername ?? "" }) }
          : {}),
        signal: AbortSignal.timeout(probeTimeoutMs()),
      }
    );
    const latencyMs = Date.now() - start;
    const data = (await res.json()) as unknown;
    const valid = isOneStream
      ? Boolean(data && typeof data === "object" && (data as Record<string, unknown>).status === "success")
      : Array.isArray(data) ||
        Boolean(
          data &&
            typeof data === "object" &&
            (data as Record<string, unknown>).status === "success",
        );
    return {
      status: res.ok && valid ? "online" : res.ok ? "degraded" : "offline",
      message: `${opts.providerType} API ${res.ok && valid ? "OK" : "invalid response"} · ${latencyMs}ms`,
      httpStatus: res.status,
      latencyMs,
    };
  } catch (e) {
    return { status: "offline", message: friendlyFetchError(e), latencyMs: Date.now() - start };
  }
}

async function probeXtreamPanelHealth(
  baseUrl: string,
  opts?: ProviderProbeOptions
): Promise<ProbeResult | null> {
  const managed = await probeManagedProviderHealth(baseUrl, opts ?? {});
  if (managed) return managed;
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
      const data = (await res.json()) as {
        user_info?: {
          auth?: number;
          message?: string;
          exp_date?: string;
          max_connections?: string;
          active_cons?: string;
        };
      };
      if (data.user_info?.auth === 1) {
        const accountKey = `provider:acct:${creds.origin}:${creds.username}`;
        void cacheSet(
          accountKey,
          {
            expiresAt: parseExpiry(data.user_info.exp_date),
            maxConnections: parsePositiveInt(data.user_info.max_connections),
            upstreamActiveConnections: parsePositiveInt(data.user_info.active_cons),
          },
          60
        );
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
  timeoutMs: number,
  headers?: Record<string, string>,
  range = "bytes=0-8191"
): Promise<{ ok: boolean; message: string; httpStatus?: number }> {
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        ...headers,
        "User-Agent": headers?.["User-Agent"] ?? PROBE_UA,
        Range: range,
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
  timeoutMs?: number,
  headers?: Record<string, string>
): Promise<{ res: Response; latencyMs: number }> {
  const start = Date.now();
  const res = await fetch(url, {
    method,
    signal: AbortSignal.timeout(timeoutMs ?? probeTimeoutMs()),
    redirect: "follow",
    headers: {
      ...headers,
      "User-Agent": headers?.["User-Agent"] ?? PROBE_UA,
      ...(method === "GET" ? { Range: "bytes=0-0", Accept: "*/*" } : {}),
    },
  });
  return { res, latencyMs: Date.now() - start };
}

async function probeHttpWithFallback(
  url: string,
  timeoutMs: number,
  headers: Record<string, string>
): Promise<{ res: Response; latencyMs: number; via: "head" | "get" }> {
  try {
    const head = await fetchProbe(url, "HEAD", timeoutMs, headers);
    if (head.res.status !== 405 && head.res.status !== 501) {
      return { ...head, via: "head" };
    }
  } catch {
    /* HEAD blocked — fall through to ranged GET */
  }
  const ranged = await fetchProbe(url, "GET", timeoutMs, headers);
  return { ...ranged, via: "get" };
}

function providerProbeCacheKey(baseUrl: string, opts?: ProviderProbeOptions): string {
  const digest = createHash("sha256")
    .update(
      [
        baseUrl,
        opts?.fast ? "fast" : "full",
        opts?.providerType ?? "",
        opts?.apiKey ?? "",
        opts?.remoteUsername ?? "",
      ].join("\0")
    )
    .digest("hex")
    .slice(0, 24);
  return `provider:probe:${digest}`;
}

async function probeStreamProviderInner(
  baseUrl: string,
  opts?: ProviderProbeOptions
): Promise<ProbeResult> {
  const normalized = normalizeProviderUrl(baseUrl);
  if (!normalized.ok) {
    return withFailureReason({ status: "offline", message: normalized.error });
  }

  const panelProbe = await probeXtreamPanelHealth(baseUrl, opts);
  if (panelProbe) return withFailureReason(panelProbe);

  const url = normalized.url;
  const fast = opts?.fast === true;
  const timeout = probeTimeoutMs(fast);
  const sampleTimeout = fast ? timeout + 2000 : Math.max(timeout, 14_000);
  const direct = isDirectMediaUrl(url);
  const verifyBody = direct;
  const headers = probeHeadersForUrl(url, opts);

  const finishWithBodyCheck = async (
    headResult: { status: "online" | "degraded"; message: string; httpStatus?: number; latencyMs?: number }
  ): Promise<ProbeResult> => {
    if (!verifyBody) {
      return withFailureReason({
        status: headResult.status,
        message: headResult.message,
        httpStatus: headResult.httpStatus,
        latencyMs: headResult.latencyMs,
      });
    }
    const sample = await fetchBodySample(url, sampleTimeout, headers);
    if (sample.ok) {
      return {
        status: "online",
        message: `${headResult.message} · ${sample.message}`,
        httpStatus: sample.httpStatus ?? headResult.httpStatus,
        latencyMs: headResult.latencyMs,
      };
    }
    const httpOk =
      (sample.httpStatus ?? headResult.httpStatus ?? 0) >= 200 &&
      (sample.httpStatus ?? headResult.httpStatus ?? 0) < 300;
    return withFailureReason({
      status: httpOk ? "degraded" : "offline",
      message: `${headResult.message} · ${sample.message}`,
      httpStatus: sample.httpStatus ?? headResult.httpStatus,
      latencyMs: headResult.latencyMs,
    });
  };

  try {
    const { res, latencyMs, via } = await probeHttpWithFallback(url, timeout, headers);
    const code = res.status;

    if (code >= 200 && code < 300 || code === 206) {
      const len = Number(res.headers.get("content-length") ?? "0");
      const headOk = {
        status: "online" as const,
        message: `${via === "get" ? "GET range" : "HEAD"} HTTP ${code} · ${latencyMs}ms`,
        httpStatus: code,
        latencyMs,
      };
      if (direct && (len === 0 || via === "get")) {
        return finishWithBodyCheck(headOk);
      }
      return headOk;
    }
    if (code === 401 || code === 403) {
      return withFailureReason({
        status: "degraded",
        message: `Auth required (HTTP ${code}) · ${latencyMs}ms`,
        httpStatus: code,
        latencyMs,
      });
    }
    if (code === 405 || code === 501) {
      return withFailureReason({
        status: "degraded",
        message: `Reachable (HTTP ${code}) · ${latencyMs}ms`,
        httpStatus: code,
        latencyMs,
      });
    }
    if (code >= 500) {
      return withFailureReason({
        status: "offline",
        message: `Server error HTTP ${code} · ${latencyMs}ms`,
        httpStatus: code,
        latencyMs,
      });
    }
    if (code === 404) {
      return withFailureReason({
        status: "offline",
        message: `Not found HTTP ${code} · ${latencyMs}ms`,
        httpStatus: code,
        latencyMs,
      });
    }
    return withFailureReason({
      status: "degraded",
      message: `HTTP ${code} · ${latencyMs}ms`,
      httpStatus: code,
      latencyMs,
    });
  } catch (e) {
    return withFailureReason({ status: "offline", message: friendlyFetchError(e) });
  }
}

export async function probeStreamProvider(
  baseUrl: string,
  opts?: ProviderProbeOptions
): Promise<ProbeResult> {
  if (opts?.skipCache) {
    return probeStreamProviderInner(baseUrl, opts);
  }
  return cacheGetOrSet(providerProbeCacheKey(baseUrl, opts), 45, () =>
    probeStreamProviderInner(baseUrl, opts)
  );
}

export type ProviderAccountProbe = {
  expiresAt: Date | null;
  maxConnections: number | null;
  upstreamActiveConnections: number | null;
};

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

function probeHeadersForUrl(url: string, opts?: ProviderProbeOptions): Record<string, string> {
  const headers: Record<string, string> = {
    "User-Agent": PROBE_UA,
    Accept: "*/*",
  };
  const creds = extractProviderCredentials(url, opts?.apiKey);
  const username = opts?.remoteUsername?.trim() || creds.username;
  const password = opts?.remotePassword?.trim() || creds.password;
  if (opts?.providerType === "onestream") {
    const [apiKey, apiToken] = (opts.apiKey ?? "").split(/:([\s\S]*)/, 2);
    headers.Authorization = `Bearer ${apiKey}:${apiToken ?? ""}`;
    headers["Content-Type"] = "application/json";
  } else if (opts?.providerType === "nxt" && opts.apiKey) {
    headers["X-API-Key"] = opts.apiKey;
  } else if (username && password && !/\/(live|movie|series)\/[^/]+\/[^/]+\//i.test(url)) {
    headers.Authorization = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
  }
  return headers;
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

  const accountKey = `provider:acct:${creds.origin}:${creds.username}`;
  const cached = await cacheGet<ProviderAccountProbe>(accountKey);
  if (cached) return cached;

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
    const result = {
      expiresAt: parseExpiry(info.exp_date),
      maxConnections: parsePositiveInt(info.max_connections),
      upstreamActiveConnections: parsePositiveInt(info.active_cons),
    };
    void cacheSet(accountKey, result, 60);
    return result;
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
