export type ProbeResult = {
  status: "online" | "degraded" | "offline" | "unknown";
  message: string;
  httpStatus?: number;
  latencyMs?: number;
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
      return {
        status: "degraded",
        message: "Fast probe: direct URL (HEAD skipped, try playback)",
        latencyMs: 0,
      };
    }
  }

  try {
    let result: { res: Response; latencyMs: number };
    try {
      result = await fetchProbe(url, "HEAD", timeout);
    } catch (headErr) {
      if (fast && direct) {
        return { status: "degraded", message: "Fast probe: playable URL format", latencyMs: 0 };
      }
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

export function validateProviderInput(body: {
  name?: unknown;
  baseUrl?: unknown;
  maxStreams?: unknown;
  contactEmail?: unknown;
}): { ok: true; data: { name: string; baseUrl: string; maxStreams: number | null; contactEmail: string | null } } | { ok: false; error: string; field?: string } {
  const name = String(body.name ?? "").trim();
  if (!name) return { ok: false, error: "Name is required", field: "name" };

  const baseUrlRaw = String(body.baseUrl ?? "").trim();
  const urlCheck = normalizeProviderUrl(baseUrlRaw);
  if (!urlCheck.ok) return { ok: false, error: urlCheck.error, field: "baseUrl" };

  const email = body.contactEmail != null && String(body.contactEmail).trim() !== ""
    ? String(body.contactEmail).trim()
    : null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Invalid contact email", field: "contactEmail" };
  }

  let maxStreams: number | null = null;
  if (body.maxStreams != null && body.maxStreams !== "") {
    const n = Number(body.maxStreams);
    if (!Number.isFinite(n) || n < 0) {
      return { ok: false, error: "Max streams must be a positive number", field: "maxStreams" };
    }
    maxStreams = Math.floor(n);
  }

  return { ok: true, data: { name, baseUrl: urlCheck.url, maxStreams, contactEmail: email } };
}
